import { describe, it, expect, vi } from 'vitest';
import { OversightEngine } from '../src/oversight/oversight-engine.js';
import type {
  OversightConfig,
  OversightHandler,
  OversightRequest,
  OversightDecision,
  OversightNotification,
} from '../src/types.js';

/**
 * Helper to create a minimal OversightConfig with overrides.
 */
function makeConfig(
  overrides: Partial<OversightConfig> = {}
): OversightConfig {
  return {
    requireApproval: ['critical', 'high'],
    notifyOn: [],
    timeoutMs: 5000,
    onTimeout: 'deny',
    ...overrides,
  };
}

/**
 * Helper to create a mock OversightHandler.
 */
function makeMockHandler(
  approvalResponse?: OversightDecision
): OversightHandler & {
  requestApproval: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
} {
  return {
    requestApproval: vi.fn().mockResolvedValue(
      approvalResponse ?? { status: 'approved', approvedBy: 'admin' }
    ),
    notify: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OversightEngine', () => {
  it('low risk returns not-required, no handler called', async () => {
    const handler = makeMockHandler();
    const config = makeConfig({ handler });
    const engine = new OversightEngine(config);

    const result = await engine.check('read_file', { path: '/tmp/test' }, 'low');

    expect(result.required).toBe(false);
    expect(result.status).toBe('not-required');
    expect(handler.requestApproval).not.toHaveBeenCalled();
    expect(handler.notify).not.toHaveBeenCalled();
  });

  it('critical risk with handler returns approved', async () => {
    const handler = makeMockHandler({
      status: 'approved',
      approvedBy: 'admin',
    });
    const config = makeConfig({ handler });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'delete_account',
      { userId: '123' },
      'critical'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('approved');
    expect(result.approvedBy).toBe('admin');
    expect(result.approvedAt).toBeDefined();
    expect(handler.requestApproval).toHaveBeenCalledOnce();

    // Verify the request structure
    const request = handler.requestApproval.mock.calls[0][0] as OversightRequest;
    expect(request.tool).toBe('delete_account');
    expect(request.args).toEqual({ userId: '123' });
    expect(request.risk).toBe('critical');
    expect(request.id).toBeDefined();
    expect(request.timestamp).toBeDefined();
  });

  it('critical risk with handler returns denied', async () => {
    const handler = makeMockHandler({
      status: 'denied',
      approvedBy: 'admin',
      reason: 'too risky',
    });
    const config = makeConfig({ handler });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'wire_transfer',
      { amount: 1000000 },
      'critical'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('denied');
    expect(result.approvedBy).toBe('admin');
    expect(result.reason).toBe('too risky');
    expect(handler.requestApproval).toHaveBeenCalledOnce();
  });

  it('timeout with onTimeout=deny returns timeout status with denied reason', async () => {
    // Handler that never resolves (simulates human not responding)
    const handler = makeMockHandler();
    handler.requestApproval = vi.fn().mockReturnValue(
      new Promise(() => {
        /* never resolves */
      })
    );

    const config = makeConfig({
      handler,
      timeoutMs: 100,
      onTimeout: 'deny',
    });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'delete_database',
      { db: 'production' },
      'critical'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('timeout');
    expect(result.reason).toContain('denied');
    expect(result.reason).toContain('precautionary');
  });

  it('timeout with onTimeout=allow returns timeout status with allowed reason', async () => {
    const handler = makeMockHandler();
    handler.requestApproval = vi.fn().mockReturnValue(
      new Promise(() => {
        /* never resolves */
      })
    );

    const config = makeConfig({
      handler,
      timeoutMs: 100,
      onTimeout: 'allow',
    });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'send_email',
      { to: 'user@example.com' },
      'high'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('timeout');
    expect(result.reason).toContain('allowed');
    expect(result.reason).toContain('configured');
  });

  it('notifyOn triggers handler.notify without blocking, returns not-required', async () => {
    const handler = makeMockHandler();
    const config = makeConfig({
      handler,
      requireApproval: ['critical', 'high'],
      notifyOn: ['medium'],
    });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'query_data',
      { table: 'users' },
      'medium'
    );

    expect(result.required).toBe(false);
    expect(result.status).toBe('not-required');
    expect(handler.requestApproval).not.toHaveBeenCalled();

    // Give the fire-and-forget notify a tick to execute
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler.notify).toHaveBeenCalledOnce();

    const notification = handler.notify.mock.calls[0][0] as OversightNotification;
    expect(notification.tool).toBe('query_data');
    expect(notification.risk).toBe('medium');
  });

  it('no handler configured auto-approves with warning for required risk', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = makeConfig({
      // No handler provided
      requireApproval: ['critical'],
    });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'delete_all',
      {},
      'critical'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('approved');
    expect(result.reason).toBe('no-handler-configured');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No oversight handler configured')
    );

    warnSpy.mockRestore();
  });

  it('handler error does not throw, returns denied result', async () => {
    const handler = makeMockHandler();
    handler.requestApproval = vi.fn().mockRejectedValue(
      new Error('Network failure')
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = makeConfig({ handler });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'dangerous_action',
      {},
      'critical'
    );

    // Should not throw — compliance layer catches errors
    expect(result.required).toBe(true);
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('Network failure');
    expect(result.reason).toContain('denied');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('timeout with onTimeout=escalate returns escalated reason', async () => {
    const handler = makeMockHandler();
    handler.requestApproval = vi.fn().mockReturnValue(
      new Promise(() => {
        /* never resolves */
      })
    );

    const config = makeConfig({
      handler,
      timeoutMs: 100,
      onTimeout: 'escalate',
    });
    const engine = new OversightEngine(config);

    const result = await engine.check(
      'modify_permissions',
      {},
      'high'
    );

    expect(result.required).toBe(true);
    expect(result.status).toBe('timeout');
    expect(result.reason).toContain('escalated');
  });

  it('passes context (sessionId, agentId) to handler request', async () => {
    const handler = makeMockHandler();
    const config = makeConfig({ handler });
    const engine = new OversightEngine(config);

    await engine.check(
      'tool_name',
      {},
      'critical',
      { sessionId: 'sess-123', agentId: 'agent-456' }
    );

    const request = handler.requestApproval.mock.calls[0][0] as OversightRequest;
    expect(request.context.sessionId).toBe('sess-123');
    expect(request.context.agentId).toBe('agent-456');
  });
});
