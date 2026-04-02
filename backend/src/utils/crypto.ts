import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { env } from '../config/env.js';

const key = Buffer.from(env.tokenEncKey, 'base64');
if (key.length !== 32) {
  throw new Error('TOKEN_ENC_KEY must be 32 bytes (base64-encoded).');
}

export const encrypt = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
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

export const decrypt = (payload: string): string => {
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || encryptedB64 === undefined) {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};
