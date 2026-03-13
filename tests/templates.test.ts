import { describe, it, expect } from 'vitest';
import { doraFintech } from '../src/templates/dora-fintech.js';
import { gdprEcommerce } from '../src/templates/gdpr-ecommerce.js';

describe('doraFintech template', () => {
  it('is a valid partial ComplianceConfig with riskRules, dataResidency, and oversight', () => {
    expect(Array.isArray(doraFintech.riskRules)).toBe(true);
    expect(doraFintech.dataResidency).toBeDefined();
    expect(doraFintech.oversight).toBeDefined();
  });

  it('has at least 10 piiFields', () => {
    expect(doraFintech.dataResidency!.piiFields.length).toBeGreaterThanOrEqual(10);
  });

  it('contains at least one critical risk rule', () => {
    const hasCritical = doraFintech.riskRules!.some((r) => r.level === 'critical');
    expect(hasCritical).toBe(true);
  });

  it('requires approval for critical and high risk levels', () => {
    expect(doraFintech.oversight!.requireApproval).toContain('critical');
    expect(doraFintech.oversight!.requireApproval).toContain('high');
  });

  it('has region EU', () => {
    expect(doraFintech.dataResidency!.region).toBe('EU');
  });

  it('has redactInLogs true', () => {
    expect(doraFintech.dataResidency!.redactInLogs).toBe(true);
  });
});

describe('gdprEcommerce template', () => {
  it('is a valid partial ComplianceConfig with riskRules, dataResidency, and oversight', () => {
    expect(Array.isArray(gdprEcommerce.riskRules)).toBe(true);
    expect(gdprEcommerce.dataResidency).toBeDefined();
    expect(gdprEcommerce.oversight).toBeDefined();
  });

  it('has credit_card in piiFields', () => {
    expect(gdprEcommerce.dataResidency!.piiFields).toContain('credit_card');
  });

  it('requires approval for critical risk level', () => {
    expect(gdprEcommerce.oversight!.requireApproval).toContain('critical');
  });

  it('has region EU', () => {
    expect(gdprEcommerce.dataResidency!.region).toBe('EU');
  });

  it('has redactInLogs true', () => {
    expect(gdprEcommerce.dataResidency!.redactInLogs).toBe(true);
  });
});
