import { applyMigrationsClean, createTestUser, createTestEmail } from './helpers.js';
import { createApp } from '../../app.js';
import { signUserJwt } from '../../middleware/auth.js';
import { query } from '../../db/index.js';
import http from 'http';

function request(
  app: any,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const payload = body ? JSON.stringify(body) : undefined;
      const reqHeaders = { ...headers };
      if (payload) {
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          method,
          path,
          headers: reqHeaders,
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
      if (payload) req.write(payload);
      req.end();
    });
  });
}

export async function runHttpRoutesTest() {
  console.log('  [Suite 7] Complete Phase 1–4 HTTP Route Coverage & HTML Policy Test...');
  await applyMigrationsClean();
  const app = createApp();

  const user = await createTestUser('http_user@example.com');
  const userToken = signUserJwt({ userId: user.id, email: user.email });

  const userB = await createTestUser('http_user_b@example.com');
  const userBToken = signUserJwt({ userId: userB.id, email: userB.email });

  // 1. GET /health/live & GET /health/ready
  console.log('    7.1 Testing /health/live and /health/ready...');
  const liveRes = await request(app, 'GET', '/health/live');
  if (liveRes.status !== 200 || liveRes.body.status !== 'live') throw new Error('FAILED: /health/live');

  const readyRes = await request(app, 'GET', '/health/ready');
  if (readyRes.status !== 200 || readyRes.body.status !== 'ready') throw new Error('FAILED: /health/ready');

  // 2. GET /auth/google & GET /auth/google/callback
  console.log('    7.2 Testing /auth/google and /auth/google/callback...');
  const googleAuthRes = await request(app, 'GET', '/auth/google');
  if (googleAuthRes.status !== 302 || !googleAuthRes.headers.location?.includes('accounts.google.com')) {
    throw new Error('FAILED: /auth/google redirect');
  }

  const callbackRes = await request(app, 'GET', '/auth/google/callback?code=bad&state=invalid');
  if (callbackRes.status !== 400 || callbackRes.body.error !== 'OAUTH_STATE_EXPIRED') {
    throw new Error('FAILED: /auth/google/callback state validation');
  }

  // 3. GET /auth/session & POST /auth/logout
  console.log('    7.3 Testing /auth/session and /auth/logout...');
  const sessionUnauth = await request(app, 'GET', '/auth/session');
  if (sessionUnauth.body.authenticated !== false) throw new Error('FAILED: /auth/session unauthenticated');

  const sessionAuth = await request(app, 'GET', '/auth/session', { authorization: `Bearer ${userToken}` });
  if (sessionAuth.body.authenticated !== true || sessionAuth.body.user.userId !== user.id) {
    throw new Error('FAILED: /auth/session authenticated');
  }

  const logoutRes = await request(app, 'POST', '/auth/logout');
  if (logoutRes.status !== 200 || !logoutRes.body.ok) throw new Error('FAILED: /auth/logout');

  // 4. POST /auth/google/disconnect
  console.log('    7.4 Testing /auth/google/disconnect...');
  const discUnconnected = await request(app, 'POST', '/auth/google/disconnect', { authorization: `Bearer ${userToken}` });
  if (discUnconnected.status !== 404 || discUnconnected.body.error !== 'GOOGLE_ACCOUNT_DISCONNECTED') {
    throw new Error('FAILED: /auth/google/disconnect non-connected user');
  }

  // Seed credentials for user to test disconnect flow
  await query(
    `INSERT INTO user_credentials (user_id, provider, encrypted_access_token)
     VALUES ($1, 'google', 'v1:fake_enc_token')`,
    [user.id]
  );
  await query(
    `INSERT INTO provider_sync_states (user_id, provider, sync_status)
     VALUES ($1, 'google', 'idle')`,
    [user.id]
  );

  const discRes = await request(app, 'POST', '/auth/google/disconnect', { authorization: `Bearer ${userToken}` });
  if (discRes.status !== 200 || !discRes.body.ok) throw new Error('FAILED: /auth/google/disconnect connected user');

  // 5. POST /emails/sync & GET /sync/status
  console.log('    7.5 Testing /emails/sync and /sync/status...');
  // Reseed credentials for sync test
  await query(
    `INSERT INTO user_credentials (user_id, provider, encrypted_access_token)
     VALUES ($1, 'google', 'v1:fake_enc_token') ON CONFLICT DO NOTHING`,
    [user.id]
  );
  await query(
    `INSERT INTO provider_sync_states (user_id, provider, sync_status)
     VALUES ($1, 'google', 'idle') ON CONFLICT DO NOTHING`,
    [user.id]
  );

  const syncRes = await request(app, 'POST', '/emails/sync', { authorization: `Bearer ${userToken}` });
  if (syncRes.status !== 202 || !syncRes.body.syncRunId) throw new Error('FAILED: /emails/sync');

  const syncStatusRes = await request(app, 'GET', '/sync/status', { authorization: `Bearer ${userToken}` });
  if (syncStatusRes.status !== 200 || !syncStatusRes.body.provider) throw new Error('FAILED: /sync/status');

  // 6. GET /emails & HTML safety policy verification
  console.log('    7.6 Testing GET /emails and raw HTML non-exposure policy...');
  const htmlEmail = await createTestEmail(
    user.id,
    'HTML Safety Subject',
    '<script>alert(1)</script><p>Hello <b>World</b></p><img src="x" onerror="alert(2)"/>'
  );

  const emailsRes = await request(app, 'GET', '/emails', { authorization: `Bearer ${userToken}` });
  if (emailsRes.status !== 200 || !Array.isArray(emailsRes.body.emails)) throw new Error('FAILED: GET /emails');

  const fetchedEmail = emailsRes.body.emails.find((e: any) => e.id === htmlEmail.id);
  if (!fetchedEmail) throw new Error('FAILED: Created email not returned in GET /emails');

  // Verify response envelope contains body_text only — raw_payload / raw_html is NOT present
  if (fetchedEmail.raw_payload !== undefined || fetchedEmail.raw_html !== undefined) {
    throw new Error('FAILED: API exposed raw HTML payload!');
  }
  if (typeof fetchedEmail.body_text !== 'string') {
    throw new Error('FAILED: body_text missing from emails response');
  }
  console.log('        Passed: GET /emails returns plain text body only; raw HTML not exposed.');

  // 7. GET /emails/:id/intelligence & POST /emails/:id/extract
  console.log('    7.7 Testing /emails/:id/extract and /emails/:id/intelligence...');
  const extractRes = await request(app, 'POST', `/emails/${htmlEmail.id}/extract`, { authorization: `Bearer ${userToken}` });
  if (extractRes.status !== 200 || !extractRes.body.extractionRunId) throw new Error('FAILED: POST /emails/:id/extract');

  const intelRes = await request(app, 'GET', `/emails/${htmlEmail.id}/intelligence`, { authorization: `Bearer ${userToken}` });
  if (intelRes.status !== 200 || !intelRes.body.intent_classification) throw new Error('FAILED: GET /emails/:id/intelligence');

  // Verify User B cannot access User A's intelligence -> 404 NOT_FOUND
  const crossIntelRes = await request(app, 'GET', `/emails/${htmlEmail.id}/intelligence`, { authorization: `Bearer ${userBToken}` });
  if (crossIntelRes.status !== 404 || crossIntelRes.body.error !== 'NOT_FOUND') {
    throw new Error('FAILED: User B accessed User A email intelligence!');
  }
  console.log('        Passed: User-scoped ownership enforced on /emails/:id/intelligence.');

  // 8. Auth Conflict & CSRF Tests
  console.log('    7.8 Testing Auth Conflict (401) & CSRF requirements (403)...');
  const conflictRes = await request(app, 'GET', '/emails', {
    cookie: `auth_token=${userToken}`,
    authorization: `Bearer ${userToken}`,
  });
  if (conflictRes.status !== 401 || conflictRes.body.error !== 'AUTH_CONFLICT') throw new Error('FAILED: AUTH_CONFLICT');

  const csrfFailRes = await request(app, 'POST', '/emails/sync', { cookie: `auth_token=${userToken}` });
  if (csrfFailRes.status !== 403 || csrfFailRes.body.error !== 'CSRF_INVALID') throw new Error('FAILED: CSRF_INVALID');

  console.log('        Passed: Complete HTTP route coverage and security rules verified across all 12 endpoints.');
}
