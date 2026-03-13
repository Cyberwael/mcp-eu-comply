# Show HN: mcp-eu-comply -- EU AI Act compliance for MCP servers in one line of code

EU AI Act enforcement begins August 2, 2026. Penalties run up to 35M EUR or 7% of global revenue. If you're building with MCP (Model Context Protocol, Anthropic's standard for agent-to-tool communication), there is currently zero built-in compliance tooling. Article 12 requires audit logging. Article 14 requires human oversight for high-risk actions. I needed both, so I built this.

**mcp-eu-comply** is a compliance middleware for MCP servers, designed to meet EU AI Act and GDPR requirements without changing your existing tool code.

What it does:

- **Tamper-evident audit logging** with SHA-256 hash chains (Article 12). Every tool call is recorded. Each log entry references the previous hash, so any tampering breaks the chain.
- **Human-in-the-loop oversight engine** with webhook and custom handler support, configurable timeout (Article 14). High-risk tool calls pause execution until a human approves or rejects.
- **Deep PII redaction** before storage and before hash computation (GDPR Article 5). Personally identifiable information never hits your logs.

How it works: a JavaScript Proxy intercepts `registerTool` on your McpServer instance. For each tool call, the middleware classifies risk, checks oversight requirements, executes the tool, and logs the result. All non-intercepted methods pass through via `Reflect.get`. Compliance layer errors never break tool execution -- your server keeps running regardless.

```typescript
const compliantServer = wrapWithCompliance(server, config);
```

That's it. One line. Your existing tools work exactly as before.

```bash
npm install mcp-eu-comply
```

53 tests passing. Zero runtime dependencies. 27.8 kB. TypeScript with full type definitions. MIT license.

- GitHub: https://github.com/Cyberwael/mcp-eu-comply
- npm: https://www.npmjs.com/package/mcp-eu-comply

Feedback welcome. MIT licensed.
