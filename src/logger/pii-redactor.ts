/**
 * PII Redactor — Deep recursive field redaction for GDPR compliance.
 *
 * Designed to meet GDPR Article 5 requirements for data minimisation in audit logs.
 * Zero external dependencies. Pure TypeScript.
 */

const REDACTION_MARKER = '***REDACTED***';

/**
 * Deep-clones an object and replaces any field whose name matches a PII field with '***REDACTED***'.
 * Case-insensitive field matching. Never mutates the original object.
 *
 * @param obj - The object to redact.
 * @param piiFields - Array of field names to treat as PII (matched case-insensitively).
 * @returns A new object with PII fields replaced by '***REDACTED***'.
 */
export function redactFields(
  obj: Record<string, unknown>,
  piiFields: string[],
): Record<string, unknown> {
  if (obj == null) {
    return {};
  }

  const lowerPiiFields = piiFields.map((f) => f.toLowerCase());

  return redactObject(obj, lowerPiiFields) as Record<string, unknown>;
}

/**
 * Recursively clones and redacts an unknown value.
 *
 * @param value - The value to process.
 * @param lowerPiiFields - Lowercased PII field names for matching.
 * @returns A deep clone with PII fields redacted.
 */
function redactValue(value: unknown, lowerPiiFields: string[]): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, lowerPiiFields));
  }

  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, lowerPiiFields);
  }

  // Primitives: string, number, boolean — return as-is (deep clone by value)
  return value;
}

/**
 * Clones a plain object, redacting any keys that match PII field names.
 *
 * @param obj - The object to clone and redact.
 * @param lowerPiiFields - Lowercased PII field names for matching.
 * @returns A new object with PII fields replaced by the redaction marker.
 */
function redactObject(
  obj: Record<string, unknown>,
  lowerPiiFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    if (lowerPiiFields.includes(key.toLowerCase())) {
      result[key] = REDACTION_MARKER;
    } else {
      result[key] = redactValue(obj[key], lowerPiiFields);
    }
  }

  return result;
}
