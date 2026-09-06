import { encryptToken, decryptToken } from '../utils/crypto.js';
import { signUserJwt } from '../middleware/auth.js';
import { generatePKCE } from '../services/googleAuth.js';
import jwt from 'jsonwebtoken';

async function runSecurityGate() {
  console.log('=== RUNNING PHASE 1 & 2 RUNTIME SECURITY GATE ===');

  // 1. Encryption & Metadata test
  console.log('\n[1] Testing AES-256-GCM Token Encryption & Key Versioning...');
  const secretToken = 'ya29.sample_oauth_token_string_12345';
  const encrypted = encryptToken(secretToken);
  console.log('    Encrypted payload format:', encrypted);
  if (!encrypted.startsWith('v1:')) {
    throw new Error('FAILED: Encrypted token missing v1: key version prefix');
  }
  const decrypted = decryptToken(encrypted);
  if (decrypted !== secretToken) {
    throw new Error('FAILED: Decrypted token does not match original secret');
  }
  console.log('    PASSED: Token encryption & key versioning verified.');

  // 2. PKCE Generation & Format Test
  console.log('\n[2] Testing PKCE Generation & SHA-256 Code Challenge...');
  const { verifier, challenge } = generatePKCE();
  if (!verifier || !challenge || verifier.length < 40) {
    throw new Error('FAILED: PKCE generation returned invalid verifier or challenge');
  }
  console.log('    Generated PKCE verifier & challenge successfully.');
  console.log('    PASSED: PKCE generation verified.');

  // 3. JWT Security Claims Verification
  console.log('\n[3] Testing JWT Security Claims (Issuer, Audience, Expiration)...');
  const sampleUser = { userId: '123e4567-e89b-12d3-a456-426614174000', email: 'user@example.com' };
  const jwtToken = signUserJwt(sampleUser);
  const decoded = jwt.decode(jwtToken) as any;
  if (decoded.iss !== 'obligo-api' || decoded.aud !== 'obligo-app' || !decoded.exp) {
    throw new Error('FAILED: JWT claims missing required issuer, audience, or exp');
  }
  console.log('    Decoded JWT claims:', { iss: decoded.iss, aud: decoded.aud, sub: decoded.sub });
  console.log('    PASSED: JWT token claims verified (iss: obligo-api, aud: obligo-app).');

  console.log('\n=== ALL PHASE 1 & 2 SECURITY GATE UNIT ASSERTS PASSED SUCCESSFULLY ===\n');
  process.exit(0);
}

runSecurityGate().catch((err) => {
  console.error('\nSECURITY GATE FAILED:', err);
  process.exit(1);
});
