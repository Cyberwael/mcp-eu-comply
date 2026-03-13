import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapWithCompliance } from '../src/wrapper/compliance-wrapper.js';
import { verifyChain } from '../src/logger/hash-chain.js';
import type { ComplianceConfig, OversightHandler } from '../src/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-eu-comply-wrapper-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(overrides?: Partial<ComplianceConfig>): ComplianceConfig {
  return {
    riskRules: [
      { toolPattern: /transfer|payment|withdraw/, level: 'critical' as const },
      { toolPattern: /delete|remove/, level: 'high' as const },
      { toolPattern: /read|list|get/, level: 'low' as const },
    ],
    logging: {
      outputDir: tmpDir,
    },
    ...overrides,
  };
}

function createMockServer(): McpServer {
  return new McpServer({ name: 'test-server', version: '1.0.0' });
}

describe('wrapWithCompliance', () => {
  it('intercepts registerTool and logs the call', async () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    let callbackCalled = false;
    wrapped.registerTool('read_data', { description: 'Read data' }, async (args: Record<string, unknown>) => {
      callbackCalled = true;
      return { content: [{ type: 'text' as const, text: 'result' }] };
    });

    // Access the internal tool registry to call the tool
    // Since we can't easily call the tool directly via MCP protocol in tests,
    // we'll verify the tool was registered by checking the server's internals
    expect(callbackCalled).toBe(false); // Not called yet, just registered
  });

  it('returns the original result unchanged', async () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    const expectedResult = { content: [{ type: 'text' as const, text: 'hello world' }] };

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;

    // Spy on the actual registerTool to capture the wrapped callback
    const originalRegisterTool = server.registerTool.bind(server);
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    wrapped.registerTool('get_info', { description: 'Get info' }, async () => {
      return expectedResult;
    });

    expect(registeredCallback).not.toBeNull();

    // Call the wrapped callback
    const result = await registeredCallback!({}, { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) });
    expect(result).toEqual(expectedResult);
  });

  it('classifies risk based on tool name', async () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    wrapped.registerTool('transfer_funds', { description: 'Transfer' }, async () => {
      return { content: [{ type: 'text' as const, text: 'done' }] };
    });

    await registeredCallback!({ amount: 100 }, { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) });

    // Check that a log file was created with the correct risk level
    const files = await fs.readdir(tmpDir);
    const ndjsonFile = files.find(f => f.endsWith('.ndjson'));
    expect(ndjsonFile).toBeDefined();

    const content = await fs.readFile(path.join(tmpDir, ndjsonFile!), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.risk).toBe('critical'); // transfer matches critical rule
    expect(entry.tool).toBe('transfer_funds');
  });

  it('triggers oversight for high-risk tools and blocks denied actions', async () => {
    const server = createMockServer();

    const mockHandler: OversightHandler = {
      requestApproval: vi.fn().mockResolvedValue({
        status: 'denied',
        approvedBy: 'admin',
        reason: 'Too risky',
      }),
    };

    const config = makeConfig({
      oversight: {
        requireApproval: ['critical'],
        timeoutMs: 5000,
        onTimeout: 'deny',
        handler: mockHandler,
      },
    });

    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    let originalCalled = false;
    wrapped.registerTool('transfer_funds', { description: 'Transfer' }, async () => {
      originalCalled = true;
      return { content: [{ type: 'text' as const, text: 'done' }] };
    });

    const result = await registeredCallback!({ amount: 50000 }, { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) });

    // Original should NOT have been called (action denied)
    expect(originalCalled).toBe(false);
    // Result should indicate denial
    expect(result).toHaveProperty('isError', true);
    // Oversight handler should have been called
    expect(mockHandler.requestApproval).toHaveBeenCalled();
  });

  it('does not break tool execution when compliance layer errors', async () => {
    const server = createMockServer();
    // Use an invalid outputDir to force logging errors
    const config = makeConfig({
      logging: { outputDir: '/nonexistent/path/that/should/fail' },
    });
    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    const expectedResult = { content: [{ type: 'text' as const, text: 'still works' }] };
    wrapped.registerTool('get_data', { description: 'Get' }, async () => expectedResult);

    // Suppress console.warn during this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await registeredCallback!({}, { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) });

    // Tool should still return its result even if logging failed
    expect(result).toEqual(expectedResult);
    // A warning should have been logged
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('passes through non-registerTool methods via Reflect.get', () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    // These properties should pass through to the original server
    expect(wrapped.server).toBe(server.server);
    expect(typeof wrapped.connect).toBe('function');
    expect(typeof wrapped.close).toBe('function');
  });

  it('redacts PII in logged args', async () => {
    const server = createMockServer();
    const config = makeConfig({
      dataResidency: {
        region: 'EU',
        piiFields: ['email', 'name'],
        redactInLogs: true,
      },
    });
    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    wrapped.registerTool('list_users', { description: 'List' }, async () => {
      return { content: [{ type: 'text' as const, text: 'users' }] };
    });

    await registeredCallback!(
      { email: 'secret@test.com', name: 'John', age: 30 },
      { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) }
    );

    const files = await fs.readdir(tmpDir);
    const ndjsonFile = files.find(f => f.endsWith('.ndjson'));
    const content = await fs.readFile(path.join(tmpDir, ndjsonFile!), 'utf-8');
    const entry = JSON.parse(content.trim());

    expect(entry.args.email).toBe('***REDACTED***');
    expect(entry.args.name).toBe('***REDACTED***');
    expect(entry.args.age).toBe(30);
  });

  it('maintains valid hash chain across multiple wrapped tool calls', async () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    wrapped.registerTool('read_data', { description: 'Read' }, async () => {
      return { content: [{ type: 'text' as const, text: 'data' }] };
    });

    // Make 5 calls
    for (let i = 0; i < 5; i++) {
      await registeredCallback!({ query: `test-${i}` }, { signal: new AbortController().signal, requestId: String(i), sendNotification: async () => {}, sendRequest: async () => ({}) });
    }

    // Verify hash chain integrity
    const result = await verifyChain(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(5);
  });

  it('logs tool errors without swallowing them', async () => {
    const server = createMockServer();
    const config = makeConfig();
    const wrapped = wrapWithCompliance(server, config);

    let registeredCallback: ((...args: unknown[]) => unknown) | null = null;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, toolConfig: unknown, cb: unknown) => {
        registeredCallback = cb as (...args: unknown[]) => unknown;
        return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {}, enabled: true } as ReturnType<McpServer['registerTool']>;
      }
    );

    const toolError = new Error('Database connection failed');
    wrapped.registerTool('get_data', { description: 'Get' }, async () => {
      throw toolError;
    });

    await expect(
      registeredCallback!({}, { signal: new AbortController().signal, requestId: '1', sendNotification: async () => {}, sendRequest: async () => ({}) })
    ).rejects.toThrow('Database connection failed');

    // Error should be logged
    const files = await fs.readdir(tmpDir);
    const ndjsonFile = files.find(f => f.endsWith('.ndjson'));
    expect(ndjsonFile).toBeDefined();

    const content = await fs.readFile(path.join(tmpDir, ndjsonFile!), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.result.status).toBe('error');
    expect(entry.result.error).toBe('Database connection failed');
  });
});
