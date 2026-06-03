import { EventEmitter } from 'events';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ChildProcess } from 'child_process';

export class DAPClient extends EventEmitter {
  private adapter: ChildProcess | null = null;
  private seq = 0;
  private pendingRequests = new Map<number, (response: any) => void>();
  private buffer = '';
  private contentLength = -1;

  async spawn(adapterPath: string, args: string[] = []) {
    const { spawn } = await import('child_process');
    
    this.adapter = spawn(process.execPath, [adapterPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.adapter.stdout?.on('data', this.onData.bind(this));
    this.adapter.stderr?.on('data', (data) => {
      console.error('Adapter stderr:', data.toString());
    });

    this.adapter.on('close', () => {
      this.emit('closed');
    });

    this.adapter.on('error', (err) => {
      console.error('Adapter error:', err);
      this.emit('error', err);
    });
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString();
    this.processBuffer();
  }

  // DAP uses Content-Length header followed by JSON body
  private processBuffer() {
    while (true) {
      if (this.contentLength < 0) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        
        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length: (\d+)/);
        if (!match) throw new Error('Invalid DAP header');
        
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.substring(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;

      const messageStr = this.buffer.substring(0, this.contentLength);
      this.buffer = this.buffer.substring(this.contentLength);
      this.contentLength = -1;

      const message = JSON.parse(messageStr) as DebugProtocol.ProtocolMessage;
      this.handleMessage(message);
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
      this.pendingRequests.set(this.seq, resolve);
      
      const json = JSON.stringify(request);
      const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
      
      if (!this.adapter?.stdin) {
        reject(new Error('Adapter not connected'));
        return;
      }
      
      this.adapter.stdin.write(header + json);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(this.seq)) {
          this.pendingRequests.delete(this.seq);
          reject(new Error(`Request timeout: ${command}`));
        }
      }, 10000);
    });
  }

  private handleMessage(message: DebugProtocol.ProtocolMessage) {
    if (message.type === 'response') {
      const response = message as DebugProtocol.Response;
      const handler = this.pendingRequests.get(response.request_seq);
      if (handler) {
        handler(response);
        this.pendingRequests.delete(response.request_seq);
      }
    } else if (message.type === 'event') {
      const event = message as DebugProtocol.Event;
      this.emit('event', event);
      this.emit(event.event, event.body);
    }
  }

  dispose() {
    if (this.adapter) {
      // Try to send disconnect request first
      try {
        this.sendRequest('disconnect', { restart: false });
      } catch (e) {
        // Ignore errors during disconnect
      }
      
      this.adapter.kill();
      this.adapter = null;
    }
    
    // Clear any pending requests
    this.pendingRequests.clear();
    this.buffer = '';
    this.contentLength = -1;
  }
}