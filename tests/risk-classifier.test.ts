import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../src/classifier/risk-classifier.js';
import { RiskRule } from '../src/types.js';

describe('classifyRisk', () => {
  it('exact string match', () => {
    const rules: RiskRule[] = [
      { toolPattern: 'transfer_funds', level: 'critical' },
    ];
    expect(classifyRisk('transfer_funds', {}, rules)).toBe('critical');
  });

  it('substring string match', () => {
    const rules: RiskRule[] = [
      { toolPattern: 'transfer', level: 'high' },
    ];
    expect(classifyRisk('bank_transfer_v2', {}, rules)).toBe('high');
  });

  it('regex match', () => {
    const rules: RiskRule[] = [
      { toolPattern: /^delete_/, level: 'critical' },
    ];
    expect(classifyRisk('delete_user', {}, rules)).toBe('critical');
  });

  it('regex no match', () => {
    const rules: RiskRule[] = [
      { toolPattern: /^delete_/, level: 'critical' },
    ];
    expect(classifyRisk('get_user', {}, rules)).toBe('medium');
  });

  it('args pattern match', () => {
    const rules: RiskRule[] = [
      {
        toolPattern: 'transfer',
        level: 'critical',
        argsPattern: { amount: /^[0-9]{5,}$/ },
      },
    ];
    expect(classifyRisk('transfer', { amount: '50000' }, rules)).toBe('critical');
  });

  it('args pattern no match', () => {
    const rules: RiskRule[] = [
      {
        toolPattern: 'transfer',
        level: 'critical',
        argsPattern: { amount: /^[0-9]{5,}$/ },
      },
    ];
    expect(classifyRisk('transfer', { amount: '100' }, rules)).toBe('medium');
  });

  it('highest risk wins', () => {
    const rules: RiskRule[] = [
      { toolPattern: 'transfer', level: 'high' },
      { toolPattern: 'transfer', level: 'critical' },
    ];
    expect(classifyRisk('transfer', {}, rules)).toBe('critical');
  });

  it('default medium when no match', () => {
    const rules: RiskRule[] = [
      { toolPattern: 'transfer', level: 'critical' },
      { toolPattern: /^delete_/, level: 'high' },
    ];
    expect(classifyRisk('get_user', {}, rules)).toBe('medium');
  });

  it('empty rules returns medium', () => {
    expect(classifyRisk('anything', {}, [])).toBe('medium');
  });

  it('multiple rules, only some match', () => {
    const rules: RiskRule[] = [
      { toolPattern: 'send', level: 'low' },
      { toolPattern: /^delete_/, level: 'critical' },
      { toolPattern: 'send_email', level: 'high' },
    ];
    // "send_email" matches rule 1 (substring "send") and rule 3 (substring "send_email")
    // Does NOT match rule 2 (regex ^delete_)
    // Matched levels: low, high → highest is high
    expect(classifyRisk('send_email', {}, rules)).toBe('high');
  });
});
