import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DebugSession } from './session';

// A mock DAP adapter that runs a full launch handshake and then lets the test
// drive stop/step/source traffic. The stopped frame deliberately has only a
// sourceReference (no local path) — the "stopped in a file outside the
// project" scenario.
const MOCK_ADAPTER = `
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
    const m = buffer.slice(0, headerEnd).toString().match(/Content-Length: (\\d+)/);
    if (!m) { buffer = Buffer.alloc(0); return; }
    const len = parseInt(m[1], 10);
    if (buffer.length < headerEnd + 4 + len) return;
    const msg = JSON.parse(buffer.slice(headerEnd + 4, headerEnd + 4 + len).toString());
    buffer = buffer.slice(headerEnd + 4 + len);
    if (msg.type !== 'request') continue;
    const seq = msg.seq, cmd = msg.command;
    const ok = (body) => send({ seq: 0, type: 'response', request_seq: seq, success: true, command: cmd, body: body ?? {} });
    if (cmd === 'initialize') ok({ capabilities: { supportsConfigurationDoneRequest: true } });
    else if (cmd === 'launch') {
      ok({});
      send({ seq: 0, type: 'event', event: 'initialized', body: {} });
    }
    else if (cmd === 'configurationDone') ok({});
    else if (cmd === 'setBreakpoints') ok({ breakpoints: (msg.arguments.breakpoints || []).map(b => ({ verified: true, line: b.line })) });
    else if (cmd === 'setExceptionBreakpoints') ok({ breakpoints: [] });
    else if (cmd === 'stackTrace') ok({ stackFrames: [{ id: 1, name: 'main', line: 10, column: 1, source: { name: 'vendor/lib.php', sourceReference: 5 } }], totalFrames: 1 });
    else if (cmd === 'scopes') ok({ scopes: [{ name: 'Local', variablesReference: 100, expensive: false }] });
    else if (cmd === 'variables') ok({ variables: [{ name: 'x', value: '42', type: 'int', variablesReference: 0 }] });
    else if (cmd === 'source') ok({ content: '<?php // vendor code', mimeType: 'text/x-php' });
    else if (cmd === 'evaluate') ok({ result: '42', variablesReference: 0 });
    else if (cmd === 'continue' || cmd === 'next' || cmd === 'stepIn' || cmd === 'stepOut' || cmd === 'pause') {
      ok({ allThreadsContinued: true });
      if (cmd === 'next') send({ seq: 0, type: 'event', event: 'stopped', body: { reason: 'step', threadId: 1 } });
    }
    else if (cmd === 'disconnect') { ok({}); }
    else ok({});
  }
});
`;

let tmpDir: string;
let adapterPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dap-session-it-'));
  adapterPath = path.join(tmpDir, 'mock-adapter.js');
  fs.writeFileSync(adapterPath, MOCK_ADAPTER);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const flush = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('DebugSession end-to-end with a mock adapter', () => {
  it('runs the handshake, handles a stop in adapter-only source, and stays alive', async () => {
    const session = new DebugSession(
      { type: 'php', request: 'launch', name: 'IT', port: 9003 },
      '/workspace'
    );

    const events: string[] = [];
    let stackBody: unknown;
    let variablesData: unknown;
    session.client.on('stoppedEvent', () => events.push('stoppedEvent'));
    session.client.on('stackTrace', (b) => { events.push('stackTrace'); stackBody = b; });
    session.client.on('scopes', () => events.push('scopes'));
    session.client.on('variables', (d) => { events.push('variables'); variablesData = d; });

    // Full start handshake against the real child process
    await session.start(adapterPath);

    // Simulate the adapter reporting a breakpoint stop in a frame whose
    // source only exists on the adapter (sourceReference, no local path).
    session.client.emit('stopped', { reason: 'breakpoint', threadId: 1 });
    await flush(100);

    expect(events).toContain('stoppedEvent');
    expect(events).toContain('stackTrace');
    const frames = (stackBody as { stackFrames: Array<{ source?: { sourceReference?: number } }> }).stackFrames;
    expect(frames[0].source?.sourceReference).toBe(5);
    expect(events).toContain('scopes');
    expect(events).toContain('variables');
    expect((variablesData as { variables: Array<{ name: string }> }).variables[0].name).toBe('x');

    // The source can be pulled from the adapter (the out-of-project fallback)
    const src = await session.fetchSource(5);
    expect(src.content).toBe('<?php // vendor code');

    // The session is still fully usable afterwards
    await session.continue();
    await session.stepOver();
    await flush(100);
    expect(events.filter((e) => e === 'stoppedEvent').length).toBe(2); // initial stop + step stop

    await session.disconnect();
  }, 15000);
});
