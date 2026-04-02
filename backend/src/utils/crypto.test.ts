import { describe, it, expect } from 'vitest';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// Self-contained crypto test — doesn't import from src to avoid env dependency
const TEST_KEY = randomBytes(32);

const encrypt = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TEST_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
};

const decrypt = (payload: string): string => {
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || encryptedB64 === undefined) {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', TEST_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

describe('AES-256-GCM Encryption', () => {
  it('encrypts and decrypts a simple string', () => {
    const original = 'hello-world-token';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const original = 'same-input';
    const a = encrypt(original);
    const b = encrypt(original);
    expect(a).not.toBe(b);
    // Both should decrypt to the same value
    expect(decrypt(a)).toBe(original);
    expect(decrypt(b)).toBe(original);
  });

  it('handles empty strings', () => {
    // AES-GCM with empty plaintext: the encrypted buffer is empty but
    // the IV and auth tag are still present, so the format is valid.
    const encrypted = encrypt('');
    const parts = encrypted.split('.');
    expect(parts).toHaveLength(3);
    // IV and tag should be non-empty
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
    // The encrypted data part may be empty for empty plaintext
    const result = decrypt(encrypted);
    expect(result).toBe('');
  });

  it('handles unicode and special characters', () => {
    const original = '🔑 tøken with spëcial chars & symbols <>\'"';
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('handles long strings (OAuth tokens)', () => {
    const original = randomBytes(2048).toString('base64');
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encrypt('sensitive-data');
    const parts = encrypted.split('.');
    // Tamper with the encrypted data
    const tampered = parts[0] + '.' + parts[1] + '.AAAA' + parts[2]!.slice(4);
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects invalid format', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow(
      'Invalid encrypted payload format'
    );
    expect(() => decrypt('')).toThrow('Invalid encrypted payload format');
  });

  it('rejects wrong key', () => {
    const encrypted = encrypt('secret');
    const wrongKey = randomBytes(32);
    const parts = encrypted.split('.');
    const iv = Buffer.from(parts[0]!, 'base64');
    const tag = Buffer.from(parts[1]!, 'base64');
    const enc = Buffer.from(parts[2]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', wrongKey, iv);
    decipher.setAuthTag(tag);
    expect(() => {
      Buffer.concat([decipher.update(enc), decipher.final()]);
    }).toThrow();
  });
});
