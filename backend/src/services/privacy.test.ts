import { describe, expect, it } from 'vitest';
import { normalizeRetentionDaysWithBounds } from './privacyUtils.js';

describe('privacy retention normalization', () => {
  it('clamps values below minimum', () => {
    expect(normalizeRetentionDaysWithBounds(1, 7, 365)).toBe(7);
  });

  it('clamps values above maximum', () => {
    expect(normalizeRetentionDaysWithBounds(999, 7, 365)).toBe(365);
  });

  it('truncates decimal inputs before clamping', () => {
    expect(normalizeRetentionDaysWithBounds(30.9, 7, 365)).toBe(30);
  });
});
