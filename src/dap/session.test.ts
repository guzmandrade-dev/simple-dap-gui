import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { DebugSession } from './session';
import { LaunchConfiguration } from './types';

// A fake DAP client: EventEmitter with a stubbed sendRequest.
function fakeClient(sendRequestImpl?: (command: string, args?: unknown) => Promise<unknown>) {
  const fake = new EventEmitter() as EventEmitter & {
    sendRequest: ReturnType<typeof vi.fn>;
    dispose: () => void;
  };
  fake.sendRequest = vi.fn(sendRequestImpl ?? (async () => ({ success: true, body: {} })));
  fake.dispose = vi.fn();
  return fake;
}

function makeSession(client: ReturnType<typeof fakeClient>, pathMappings?: Record<string, string>) {
  const config: LaunchConfiguration = {
    type: 'php',
    request: 'launch',
    name: 'Test',
    pathMappings,
  };
  const session = new DebugSession(config, '/workspace');
  // Swap in the fake client and re-bind the session's event handlers to it.
  (session as unknown as { client: unknown }).client = client;
  (session as unknown as { setupEventHandlers: () => void }).setupEventHandlers();
  return session;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DebugSession path mapping', () => {
  const createSession = (pathMappings?: Record<string, string>) => {
    const config: LaunchConfiguration = {
      type: 'php',
      request: 'launch',
      name: 'Test',
      pathMappings,
    };
    return new DebugSession(config, '/workspace');
  };

  describe('serverToLocalPath', () => {
    it('maps a server path to local using workspaceFolder', () => {
      const session = createSession({
        '/var/www/html': '${workspaceFolder}',
      });
      expect(session.serverToLocalPath('/var/www/html/index.php')).toBe('/workspace/index.php');
    });

    it('maps a server path to an absolute local path', () => {
      const session = createSession({
        '/server/app': '/local/app',
      });
      expect(session.serverToLocalPath('/server/app/src/main.php')).toBe('/local/app/src/main.php');
    });

    it('returns the original path when no mapping matches', () => {
      const session = createSession({
        '/var/www/html': '${workspaceFolder}',
      });
      expect(session.serverToLocalPath('/other/path/file.php')).toBe('/other/path/file.php');
    });

    it('handles multiple mappings', () => {
      const session = createSession({
        '/var/www/html': '${workspaceFolder}',
        '/shared/lib': '/workspace/vendor',
      });
      expect(session.serverToLocalPath('/shared/lib/utils.php')).toBe('/workspace/vendor/utils.php');
    });
  });

  describe('localToServerPath', () => {
    it('maps a local path to server using workspaceFolder', () => {
      const session = createSession({
        '/var/www/html': '${workspaceFolder}',
      });
      // localToServerPath is private, but we can test it via setBreakpoints indirectly
      // or we can access it via any method. Since it's private, we'll test behavior through
      // the public interface. For now, we test serverToLocalPath which is public.
      // To test localToServerPath properly, we can use a workaround:
      expect((session as any).localToServerPath('/workspace/index.php')).toBe('/var/www/html/index.php');
    });

    it('returns the original path when no reverse mapping matches', () => {
      expect((createSession({ '/var/www/html': '${workspaceFolder}' }) as any).localToServerPath('/other/file.php')).toBe('/other/file.php');
    });
  });

  describe('workspaceFolder resolution', () => {
    it('resolves ${workspaceFolder} in the constructor', () => {
      const session = createSession({
        '/app': '${workspaceFolder}/src',
      });
      expect(session.serverToLocalPath('/app/index.php')).toBe('/workspace/src/index.php');
    });

    it('handles empty path mappings', () => {
      const session = createSession(undefined);
      expect(session.serverToLocalPath('/anything.php')).toBe('/anything.php');
    });
  });

  describe('expandConfig', () => {
    it('resolves variables and strips pathMappings from the sent config', () => {
      const session = createSession({ '/var/www': '${workspaceFolder}' });
      (session as unknown as { config: LaunchConfiguration }).config = {
        ...(session as unknown as { config: LaunchConfiguration }).config,
        program: '${workspaceFolder}/index.php',
        port: 9003,
      };
      const expanded = (session as unknown as { expandConfig: () => Record<string, unknown> }).expandConfig();
      expect(expanded.program).toBe('/workspace/index.php');
      expect(expanded.pathMappings).toBeUndefined();
      expect(expanded.port).toBe(9003);
    });
  });
});

describe('DebugSession stop handling', () => {
  it('emits stoppedEvent before the stack trace so the UI always pauses', async () => {
    const client = fakeClient(async (command) => {
      if (command === 'stackTrace') {
        return { success: true, body: { stackFrames: [{ id: 1, name: 'main', line: 5 }], totalFrames: 1 } };
      }
      if (command === 'scopes') {
        return { success: true, body: { scopes: [] } };
      }
      return { success: true, body: {} };
    });
    makeSession(client);

    const order: string[] = [];
    client.on('stoppedEvent', () => order.push('stoppedEvent'));
    client.on('stackTrace', () => order.push('stackTrace'));

    client.emit('stopped', { reason: 'breakpoint', threadId: 7 });
    await flush();

    expect(order).toEqual(['stoppedEvent', 'stackTrace']);
  });

  it('still emits stoppedEvent and an empty stack when stackTrace fails', async () => {
    const client = fakeClient(async (command) => {
      if (command === 'stackTrace') throw new Error('adapter exploded');
      return { success: true, body: {} };
    });
    makeSession(client);

    const events: string[] = [];
    let stackBody: unknown;
    client.on('stoppedEvent', () => events.push('stoppedEvent'));
    client.on('stackTrace', (body) => {
      events.push('stackTrace');
      stackBody = body;
    });

    // Must not produce an unhandled rejection
    client.emit('stopped', { reason: 'exception', threadId: 3 });
    await flush();
    await flush();

    expect(events).toContain('stoppedEvent');
    expect(events).toContain('stackTrace');
    expect((stackBody as { stackFrames: unknown[] }).stackFrames).toEqual([]);
  });

  it('handles a stop without threadId without requesting a stack trace', async () => {
    const client = fakeClient();
    makeSession(client);

    let stopped = false;
    client.on('stoppedEvent', () => { stopped = true; });

    client.emit('stopped', { reason: 'pause' });
    await flush();

    expect(stopped).toBe(true);
    expect(client.sendRequest).not.toHaveBeenCalled();
  });

  it('fetchSource returns content from the adapter', async () => {
    const client = fakeClient(async (command) => {
      if (command === 'source') {
        return { success: true, body: { content: '<?php phpinfo();', mimeType: 'text/x-php' } };
      }
      return { success: true, body: {} };
    });
    const session = makeSession(client);

    const result = await session.fetchSource(42);
    expect(result.content).toBe('<?php phpinfo();');
    expect(result.mimeType).toBe('text/x-php');
    expect(client.sendRequest).toHaveBeenCalledWith('source', { sourceReference: 42 });
  });

  it('stepping requests do not throw when the adapter errors', async () => {
    const client = fakeClient(async () => { throw new Error('no thread'); });
    const session = makeSession(client);

    client.emit('stopped', { reason: 'breakpoint', threadId: 9 });
    await flush();

    await expect(session.continue()).resolves.toBeUndefined();
    await expect(session.stepOver()).resolves.toBeUndefined();
    await expect(session.stepInto()).resolves.toBeUndefined();
    await expect(session.stepOut()).resolves.toBeUndefined();
    await expect(session.pause()).resolves.toBeUndefined();
  });
});
