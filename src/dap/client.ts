import { EventEmitter } from 'events';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ChildProcess } from 'child_process';

export class DAPClient extends EventEmitter {
  private adapter: ChildProcess | null = null;
  private seq = 0;
  private pendingRequests = new Map<number, { resolve: (response: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private buffer = '';
  private contentLength = -1;
  private disposed = false;

  constructor(private requestTimeoutMs: number = 10_000) {
    super();
  }

  async spawn(adapterPath: string, args: string[] = []) {
    const { spawn } = await import('child_process');

    this.adapter = spawn(process.execPath, [adapterPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });

    this.adapter.stdout?.on('data', this.onData.bind(this));
    this.adapter.stderr?.on('data', (data) => {
      console.error('Adapter stderr:', data.toString());
    });

    this.adapter.on('close', (code) => {
      this.rejectAllPending(new Error(`Adapter process closed (exit code ${code ?? 'null'})`));
      this.emit('closed');
    });

    this.adapter.on('error', (err) => {
      console.error('Adapter error:', err);
      this.rejectAllPending(err);
      // EventEmitter throws when 'error' is emitted without listeners; guard it.
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      }
    });
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString();
    this.processBuffer();
  }

  // DAP uses Content-Length header followed by JSON body. Malformed frames
  // (e.g. non-DAP noise on stdout) are skipped without crashing the host or
  // losing subsequent valid frames that share the same chunk.
  private processBuffer() {
    for (;;) {
      if (this.contentLength < 0) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length: (\d+)/);
        if (!match) {
          this.buffer = this.buffer.substring(headerEnd + 4);
          this.emit('protocolError', new Error(`Invalid DAP header: ${header.slice(0, 120)}`));
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.substring(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;

      const messageStr = this.buffer.substring(0, this.contentLength);
      this.buffer = this.buffer.substring(this.contentLength);
      this.contentLength = -1;

      try {
        const message = JSON.parse(messageStr) as DebugProtocol.ProtocolMessage;
        this.handleMessage(message);
      } catch (err) {
        this.emit('protocolError', err);
      }
    }
  }

  sendRequest<T extends DebugProtocol.Request>(
    command: T['command'],
    args?: T['arguments']
  ): Promise<DebugProtocol.Response> {
    this.seq++;
    const request: DebugProtocol.Request = {
      seq: this.seq,
      type: 'request',
      command,
      arguments: args,
    };

    return new Promise((resolve, reject) => {
      const json = JSON.stringify(request);
      const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;

      if (this.disposed || !this.adapter?.stdin) {
        reject(new Error('Adapter not connected'));
        return;
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(this.seq)) {
          this.pendingRequests.delete(this.seq);
          reject(new Error(`Request timeout: ${command}`));
        }
      }, this.requestTimeoutMs);

      this.pendingRequests.set(this.seq, { resolve, reject, timer });

      this.adapter.stdin.write(header + json, (err) => {
        if (err && this.pendingRequests.has(this.seq)) {
          const pending = this.pendingRequests.get(this.seq)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(this.seq);
          reject(err);
        }
      });
    });
  }

  private handleMessage(message: DebugProtocol.ProtocolMessage) {
    if (message.type === 'response') {
      const response = message as DebugProtocol.Response;
      const handler = this.pendingRequests.get(response.request_seq);
      if (handler) {
        clearTimeout(handler.timer);
        this.pendingRequests.delete(response.request_seq);
        if (response.success === false) {
          handler.reject(new Error(response.message || `DAP request '${response.command}' failed`));
        } else {
          handler.resolve(response);
        }
      }
    } else if (message.type === 'event') {
      const event = message as DebugProtocol.Event;
      this.emit('event', event);
      this.emit(event.event, event.body);
    }
  }

  private rejectAllPending(err: Error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  dispose() {
    this.disposed = true;
    if (this.adapter) {
      // Try to send disconnect request first, but never let a failure here
      // become an unhandled rejection.
      this.sendRequest('disconnect', { restart: false }).catch(() => {});

      this.adapter.kill();
      this.adapter = null;
    }

    // Reject anything still waiting so callers don't hang until the timeout.
    this.rejectAllPending(new Error('Client disposed'));
    this.buffer = '';
    this.contentLength = -1;
  }
}