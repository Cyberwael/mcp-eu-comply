# EU AI Act Mapping — mcp-eu-comply

## EU AI Act (Regulation 2024/1689)

### Article 12 — Record-Keeping
| Requirement | Our implementation | Field in AuditLogEntry |
|---|---|---|
| Event ID | UUIDv4 | `id` |
| Timestamp | ISO 8601 UTC | `timestamp` |
| Input reference | Tool args (PII redacted) | `args` |
| Output reference | SHA-256 hash of output | `result.contentHash` |
| Outcome | success/error/denied | `result.status` |
| Duration | Milliseconds | `durationMs` |
| Agent identity | Agent ID + session | `agentId`, `sessionId` |
| Human oversight | Full approval record | `oversight` |
| Integrity | SHA-256 hash chain | `prevHash`, `hash` |

### Article 14 — Human Oversight
- `oversight.requireApproval`: risk levels that pause for human approval
- `oversight.handler.requestApproval()`: custom approval flow
- `oversight.onTimeout: 'deny'`: default deny if no human responds
- All decisions logged in audit entry `oversight` field

### Article 9 — Risk Management
- `RiskLevel`: low, medium, high, critical
- `riskRules`: pattern-based classification per tool
- Default: `medium` (precautionary)

### Article 19 — Quality of Logs
- Hash chain ensures integrity
- NDJSON ensures structured, parseable format
- chain-state.json ensures continuity

## GDPR
- **Art. 5(1)(c) Data minimisation**: PII redaction via `piiFields` config
- **Art. 5(1)(e) Storage limitation**: `retention.days` config
- **Art. 5(1)(f) Integrity**: hash chain + EU data residency tagging
- **Art. 15-22 Data subject rights**: pseudonymized IDs enable lookup for access/erasure

## DORA (Financial Services)
- **Art. 11 Response/Recovery**: complete audit trail for ICT incident analysis
- **Art. 12 Backup**: NDJSON files enable standard backup. Webhook enables replication.

## eIDAS 2.0 (Roadmap v2.0+)
- `agentId` field ready for eIDAS wallet bridge
- Not implemented in v0.1 — wallets deploy late 2026
