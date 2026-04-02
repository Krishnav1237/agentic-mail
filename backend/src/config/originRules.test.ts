import { describe, expect, it } from 'vitest';
import {
  getPrimaryOrigin,
  isOriginAllowedByRules,
  parseOriginRule,
} from './originRules.js';

describe('origin rules', () => {
  it('accepts exact origin matches', () => {
    const rules = [parseOriginRule('https://agentic-mail.vercel.app')!];
    expect(
      isOriginAllowedByRules(rules, 'https://agentic-mail.vercel.app')
    ).toBe(true);
    expect(isOriginAllowedByRules(rules, 'https://other.vercel.app')).toBe(
      false
    );
  });

  it('accepts wildcard subdomains', () => {
    const rules = [parseOriginRule('https://*.example.com')!];
    expect(isOriginAllowedByRules(rules, 'https://app.example.com')).toBe(true);
    expect(isOriginAllowedByRules(rules, 'https://a.b.example.com')).toBe(true);
    expect(isOriginAllowedByRules(rules, 'https://example.net')).toBe(false);
  });

  it('accepts infix host wildcards for Vercel preview domains', () => {
    const rules = [parseOriginRule('https://agentic-mail-*.vercel.app')!];
    expect(
      isOriginAllowedByRules(
        rules,
        'https://agentic-mail-git-main-shrey.vercel.app'
      )
    ).toBe(true);
    expect(
      isOriginAllowedByRules(rules, 'https://agentic-mail.vercel.app')
    ).toBe(false);
  });

  it('accepts wildcard ports for localhost-style rules', () => {
    const rules = [parseOriginRule('http://localhost:*')!];
    expect(isOriginAllowedByRules(rules, 'http://localhost:3000')).toBe(true);
    expect(isOriginAllowedByRules(rules, 'http://localhost:5173')).toBe(true);
    expect(isOriginAllowedByRules(rules, 'http://127.0.0.1:5173')).toBe(false);
  });

  it('returns the first exact origin as the primary origin', () => {
    const rules = [
      parseOriginRule('https://agentic-mail.vercel.app')!,
      parseOriginRule('https://agentic-mail-*.vercel.app')!,
    ];
    expect(getPrimaryOrigin(rules, 'http://localhost:5173')).toBe(
      'https://agentic-mail.vercel.app'
    );
  });

  it('falls back when only pattern rules exist', () => {
    const rules = [parseOriginRule('https://agentic-mail-*.vercel.app')!];
    expect(getPrimaryOrigin(rules, 'http://localhost:5173')).toBe(
      'http://localhost:5173'
    );
  });
});
