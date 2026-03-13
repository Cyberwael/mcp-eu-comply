import { describe, it, expect } from 'vitest';
import { redactFields } from '../src/logger/pii-redactor';

const REDACTED = '***REDACTED***';

describe('redactFields', () => {
  it('redacts flat object PII fields', () => {
    const obj = { email: 'test@test.com', name: 'John', age: 30 };
    const result = redactFields(obj, ['email', 'name']);

    expect(result.email).toBe(REDACTED);
    expect(result.name).toBe(REDACTED);
    expect(result.age).toBe(30);
  });

  it('redacts nested object PII fields', () => {
    const obj = { user: { email: 'x', name: 'y' }, id: 1 };
    const result = redactFields(obj, ['email', 'name']);

    const user = result.user as Record<string, unknown>;
    expect(user.email).toBe(REDACTED);
    expect(user.name).toBe(REDACTED);
    expect(result.id).toBe(1);
  });

  it('redacts array of objects', () => {
    const obj = { users: [{ email: 'a' }, { email: 'b' }] };
    const result = redactFields(obj, ['email']);

    const users = result.users as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(users[0]!.email).toBe(REDACTED);
    expect(users[1]!.email).toBe(REDACTED);
  });

  it('does NOT mutate original object', () => {
    const original = {
      email: 'test@test.com',
      user: { name: 'John', nested: { phone: '123' } },
      tags: ['a', 'b'],
    };
    const snapshot = JSON.parse(JSON.stringify(original));

    redactFields(original, ['email', 'name', 'phone']);

    expect(original).toStrictEqual(snapshot);
  });

  it('case-insensitive matching', () => {
    const obj = { Email: 'x', EMAIL: 'y', email: 'z' };
    const result = redactFields(obj, ['email']);

    expect(result.Email).toBe(REDACTED);
    expect(result.EMAIL).toBe(REDACTED);
    expect(result.email).toBe(REDACTED);
  });

  it('non-matching fields untouched', () => {
    const obj = { foo: 'bar', baz: 42 };
    const result = redactFields(obj, ['email']);

    expect(result.foo).toBe('bar');
    expect(result.baz).toBe(42);
  });

  it('handles null and undefined values — redacts matching fields regardless of value', () => {
    const obj = { email: null, name: undefined, phone: '123' };
    const result = redactFields(obj, ['email', 'name', 'phone']);

    expect(result.email).toBe(REDACTED);
    expect(result.name).toBe(REDACTED);
    expect(result.phone).toBe(REDACTED);
  });

  it('empty piiFields returns deep clone', () => {
    const obj = { foo: 'bar', nested: { baz: 42 } };
    const result = redactFields(obj, []);

    expect(result).toStrictEqual(obj);
    expect(result).not.toBe(obj);
    expect(result.nested).not.toBe(obj.nested);
  });

  it('handles arrays of primitives', () => {
    const obj = { tags: ['a', 'b'], email: 'x' };
    const result = redactFields(obj, ['email']);

    expect(result.tags).toStrictEqual(['a', 'b']);
    expect(result.email).toBe(REDACTED);
  });
});
