import { describe, it, expect } from 'vitest';

// Isolated re-implementation of contextFilter logic to test without env/db deps
const hasSignal = (text: string) =>
  /(deadline|due|submit|application|interview|schedule|meeting|respond|reply|internship|event|reminder|today|tomorrow|urgent)/i.test(
    text
  );

const hoursUntil = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return (parsed - Date.now()) / (1000 * 60 * 60);
};

type RawEmail = {
  id: string;
  subject: string;
  sender: string;
  senderDomain?: string | null;
  receivedAt?: string | null;
  preview?: string;
  importance?: string | null;
  classification?: string | null;
};

const filterEmail = (email: RawEmail) => {
  const reasons: string[] = [];
  const text = `${email.subject} ${email.preview ?? ''}`.trim();
  const sender = email.sender.toLowerCase();

  if (email.importance === 'high') reasons.push('important');
  if (email.classification && email.classification !== 'spam')
    reasons.push(`classification:${email.classification}`);
  if (hasSignal(text)) reasons.push('actionable_keyword');
  if (
    /(career|jobs?|recruit|talent|campus|professor|office|university)/i.test(
      sender
    )
  )
    reasons.push('high_value_sender');

  const actionable = reasons.length > 0 && email.classification !== 'spam';
  return {
    ...email,
    actionable,
    reasons: actionable ? reasons : ['filtered_noise'],
  };
};

describe('Context Filter', () => {
  describe('hasSignal', () => {
    it('detects deadline keywords', () => {
      expect(hasSignal('Your deadline is tomorrow')).toBe(true);
      expect(hasSignal('Please submit by Friday')).toBe(true);
      expect(hasSignal('Interview scheduled for Monday')).toBe(true);
      expect(hasSignal('Internship opportunity at Google')).toBe(true);
    });

    it('rejects noise text', () => {
      expect(hasSignal('Newsletter from store')).toBe(false);
      expect(hasSignal('Your order has shipped')).toBe(false);
      expect(hasSignal('Weekly digest')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(hasSignal('URGENT: Action Required')).toBe(true);
      expect(hasSignal('DEADLINE approaching')).toBe(true);
    });
  });

  describe('hoursUntil', () => {
    it('returns null for null/undefined input', () => {
      expect(hoursUntil(null)).toBeNull();
      expect(hoursUntil(undefined)).toBeNull();
    });

    it('returns null for invalid date string', () => {
      expect(hoursUntil('not-a-date')).toBeNull();
    });

    it('returns positive hours for future dates', () => {
      const future = new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString();
      const hours = hoursUntil(future)!;
      expect(hours).toBeGreaterThan(4.9);
      expect(hours).toBeLessThan(5.1);
    });

    it('returns negative hours for past dates', () => {
      const past = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
      expect(hoursUntil(past)!).toBeLessThan(0);
    });
  });

  describe('filterEmail', () => {
    const base: RawEmail = {
      id: '1',
      subject: 'Hello',
      sender: 'john@example.com',
      preview: 'Nothing special',
    };

    it('marks high importance emails as actionable', () => {
      const result = filterEmail({ ...base, importance: 'high' });
      expect(result.actionable).toBe(true);
      expect(result.reasons).toContain('important');
    });

    it('marks emails with actionable keywords as actionable', () => {
      const result = filterEmail({
        ...base,
        subject: 'Your deadline is tomorrow',
      });
      expect(result.actionable).toBe(true);
      expect(result.reasons).toContain('actionable_keyword');
    });

    it('marks classified non-spam emails as actionable', () => {
      const result = filterEmail({ ...base, classification: 'academic' });
      expect(result.actionable).toBe(true);
      expect(result.reasons).toContain('classification:academic');
    });

    it('filters out spam even with other signals', () => {
      const result = filterEmail({
        ...base,
        classification: 'spam',
        importance: 'high',
      });
      expect(result.actionable).toBe(false);
      expect(result.reasons).toContain('filtered_noise');
    });

    it('detects high-value senders', () => {
      const result = filterEmail({
        ...base,
        sender: 'John <recruiting@university.edu>',
      });
      expect(result.actionable).toBe(true);
      expect(result.reasons).toContain('high_value_sender');
    });

    it('filters plain noise emails', () => {
      const result = filterEmail({
        ...base,
        subject: 'Weekly newsletter',
        preview: 'Check out our deals',
      });
      expect(result.actionable).toBe(false);
      expect(result.reasons).toContain('filtered_noise');
    });
  });
});
