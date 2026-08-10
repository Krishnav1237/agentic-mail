import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_VERSION = 1;

const getKey = (): Buffer => {
  const rawKeyB64 = env.TOKEN_ENC_KEY;
  const keyBuffer = Buffer.from(rawKeyB64, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `Invalid TOKEN_ENC_KEY: Must be a base64-encoded string representing exactly 32 bytes. Got ${keyBuffer.length} bytes.`
    );
  }
  return keyBuffer;
};

export const encryptToken = (text: string): string => {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return formatted metadata string: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
  return `v${KEY_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptToken = (encryptedString: string): string => {
  if (!encryptedString) return '';

  const parts = encryptedString.split(':');
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Invalid encrypted token format');
  }

  const version = parts[0];
  if (version !== `v${KEY_VERSION}`) {
    throw new Error(`Unsupported token key version: ${version}`);
  }

  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const encryptedText = Buffer.from(parts[3], 'base64');

  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
};
