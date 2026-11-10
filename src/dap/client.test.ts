import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DAPClient } from './client';

// A minimal mock DAP adapter: speaks Content-Length framed JSON-RPC on stdio.
// Behavior is driven by the request command:
//   initialize/launch/attach/... -> success response (optionally with body)
//   fail                         -> success: false with message 'boom'
//   never                        -> no response (for timeout tests)
//   emitEvent                    -> sends a 'stopped' event, then success
//   garbage                      -> writes malformed bytes, then a valid response
//   source                       -> success with source content
const MOCK_ADAPTER = `
const readline = require('readline');
let buffer = Buffer.alloc(0);

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write('Content-Length: ' + Buffer.byteLength(json) + '\\r\\n\\r\\n' + json);
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString();
    const m = header.match(/Content-Length: (\\d+)/);
    if (!m) { buffer = Buffer.alloc(0); return; }
    const len = parseInt(m[1], 10);
    if (buffer.length < headerEnd + 4 + len) return;
    const body = buffer.slice(headerEnd + 4, headerEnd + 4 + len).toString();
    buffer = buffer.slice(headerEnd + 4 + len);
    const msg = JSON.parse(body);
    if (msg.type !== 'request') continue;

    const seq = msg.seq;
    const cmd = msg.command;
    if (cmd === 'fail') {
      send({ seq: 0, type: 'response', request_seq: seq, success: false, command: cmd, message: 'boom' });
    } else if (cmd === 'never') {
      // never respond
    } else if (cmd === 'emitEvent') {
      send({ seq: 0, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
      send({ seq: 0, type: 'response', request_seq: seq, success: true, command: cmd, body: {} });
    } else if (cmd === 'garbage') {
      process.stdout.write('THIS IS NOT DAP\\r\\n\\r\\n');
      send({ seq: 0, type: 'response', request_seq: seq, success: true, command: cmd, body: { ok: true } });
    } else if (cmd === 'source') {
      send({ seq: 0, type: 'response', request_seq: seq, success: true, command: cmd, body: { content: '<?php echo 1;', mimeType: 'text/x-php' } });
    } else {
      send({ seq: 0, type: 'response', request_seq: seq, success: true, command: cmd, body: { capabilities: {} } });
    }
  }
});
`;

let adapterPath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dap-client-test-'));
  adapterPath = path.join(tmpDir, 'mock-adapter.js');
  fs.writeFileSync(adapterPath, MOCK_ADAPTER);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function spawnClient(timeoutMs = 2000) {
  const client = new DAPClient(timeoutMs);
  await client.spawn(adapterPath);
  return client;
}

describe('DAPClient', () => {
  it('resolves a request with the response body', async () => {
    const client = await spawnClient();
    const response = await client.sendRequest('initialize', { clientID: 'test' } as never);
    expect(response.success).toBe(true);
    expect((response as { body?: { capabilities?: object } }).body?.capabilities).toEqual({});
    client.dispose();
  });

  it('rejects when the adapter responds with success: false', async () => {
    const client = await spawnClient();
    await expect(client.sendRequest('fail' as never)).rejects.toThrow('boom');
    client.dispose();
  });

  it('rejects on request timeout', async () => {
    const client = await spawnClient(300);
    await expect(client.sendRequest('never' as never)).rejects.toThrow('Request timeout: never');
    client.dispose();
  });

  it('emits events sent by the adapter', async () => {
    const client = await spawnClient();
    const stopped = new Promise<void>((resolve) => {
      client.on('stopped', (body: { reason: string }) => {
        expect(body.reason).toBe('breakpoint');
        resolve();
      });
    });
    await client.sendRequest('emitEvent' as never);
    await stopped;
    client.dispose();
  });

  it('survives malformed frames and keeps parsing afterwards', async () => {
    const client = await spawnClient();
    const protocolError = new Promise<void>((resolve) => {
      client.on('protocolError', () => resolve());
    });
    const response = await client.sendRequest('garbage' as never);
    expect(response.success).toBe(true);
    await protocolError;
    // A subsequent request must still work after the protocol error
    const again = await client.sendRequest('initialize' as never);
    expect(again.success).toBe(true);
    client.dispose();
  });

  it('rejects pending requests when disposed', async () => {
    const client = await spawnClient(5000);
    const pending = client.sendRequest('never' as never);
    client.dispose();
    await expect(pending).rejects.toThrow('Client disposed');
  });

  it('rejects new requests after dispose', async () => {
    const client = await spawnClient();
    client.dispose();
    await expect(client.sendRequest('initialize' as never)).rejects.toThrow('Adapter not connected');
  });

  it('rejects pending requests when the adapter process closes', async () => {
    const client = await spawnClient(5000);
    const pending = client.sendRequest('never' as never);
    const closed = new Promise<void>((resolve) => client.on('closed', () => resolve()));
    // Kill the adapter from the outside via a request that ends the process:
    // emulate by disposing the underlying adapter through 'never' + close event
    (client as unknown as { adapter: { kill: () => void } }).adapter.kill();
    await closed;
    await expect(pending).rejects.toThrow(/closed/);
  });

  it('answers a source request with content', async () => {
    const client = await spawnClient();
    const response = await client.sendRequest('source', { sourceReference: 42 } as never);
    const body = (response as unknown as { body: { content: string; mimeType: string } }).body;
    expect(body.content).toBe('<?php echo 1;');
    expect(body.mimeType).toBe('text/x-php');
    client.dispose();
  });
});
