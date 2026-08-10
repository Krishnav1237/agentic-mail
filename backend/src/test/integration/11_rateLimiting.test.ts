import { applyMigrationsClean, clearRedisData, createTestUser } from './helpers.js';
import { createApp } from '../../app.js';
import { signUserJwt } from '../../middleware/auth.js';
import { redisCache } from '../../redis/index.js';
import http from 'http';

function request(app: any, method: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          method,
          path,
          headers,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            server.close();
            let parsedBody = raw;
            try {
              parsedBody = JSON.parse(raw);
            } catch {}
            const resHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v) resHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
            }
            resolve({ status: res.statusCode || 500, headers: resHeaders, body: parsedBody });
          });
        }
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

export async function runRateLimitingTest() {
  console.log('  [Suite 11] Redis-Backed Rate Limiting & Spoofing Defense Test...');
  await applyMigrationsClean();
  await clearRedisData();

  const app = createApp();
  const user = await createTestUser('ratelimit_user@example.com');
  const token = signUserJwt({ userId: user.id, email: user.email });

  // 1. Enforcement test on /auth/google (limit 100 requests per 15 mins)
  console.log('    11.1 Testing rate limit enforcement & header headers...');
  const res1 = await request(app, 'GET', '/auth/google');
  if (res1.headers['x-ratelimit-limit'] !== '100') {
    throw new Error(`FAILED: Rate limit header X-RateLimit-Limit expected 100 (got ${res1.headers['x-ratelimit-limit']})`);
  }
  console.log('        Passed: Rate limit response headers verified.');

  // 2. Expiry / flush recovery test
  console.log('    11.2 Testing recovery after clearing Redis key...');
  await clearRedisData();
  const res2 = await request(app, 'GET', '/auth/google');
  if (res2.status === 429) {
    throw new Error('FAILED: Request blocked despite rate limit key flush');
  }
  console.log('        Passed: Rate limit key flush reset the window.');

  // 3. Route separation
  console.log('    11.3 Testing route separation (auth vs email_action keys)...');
  // Fill rate limit key for auth
  await redisCache.set('ratelimit:auth:127.0.0.1', '150', 'EX', 60);

  const blockedAuthRes = await request(app, 'GET', '/auth/google');
  if (blockedAuthRes.status !== 429) {
    throw new Error('FAILED: /auth/google was not rate limited when key exceeded max!');
  }

  // /emails route uses different key prefix 'email_action' (for mutations) or has no limit on GET
  const emailGetRes = await request(app, 'GET', '/emails', {
    authorization: `Bearer ${token}`,
  });
  if (emailGetRes.status === 429) {
    throw new Error('FAILED: /emails GET was blocked by /auth/google rate limit key!');
  }
  console.log('        Passed: Route rate limit keys are isolated.');

  // 4. Spoofed forwarding headers defense (TRUST_PROXY=0)
  console.log('    11.4 Testing spoofed X-Forwarded-For header defense (TRUST_PROXY=0)...');
  await clearRedisData();

  // Send request with spoofed X-Forwarded-For header
  await request(app, 'GET', '/auth/google', {
    'x-forwarded-for': '1.2.3.4, 5.6.7.8',
  });

  // Verify Redis key was created for socket IP 127.0.0.1 — NOT spoofed 1.2.3.4
  const spoofKeyVal = await redisCache.get('ratelimit:auth:1.2.3.4');
  if (spoofKeyVal !== null) {
    throw new Error('FAILED: App trusted spoofed X-Forwarded-For header when TRUST_PROXY=0!');
  }
  const realKeyVal = await redisCache.get('ratelimit:auth:127.0.0.1');
  if (!realKeyVal) {
    throw new Error('FAILED: Rate limiter did not record socket IP 127.0.0.1');
  }
  console.log('        Passed: Spoofed X-Forwarded-For header ignored (socket IP 127.0.0.1 recorded).');

  await clearRedisData();
}
