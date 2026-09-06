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

  // 6b. GET /emails with status/classification filters — count query placeholder regression
  console.log('    7.6b Testing GET /emails?status=... and ?classification=... (count query placeholder bug)...');
  await query(`UPDATE emails SET status = 'read', classification = 'newsletter' WHERE id = $1`, [htmlEmail.id]);

  const statusFilterRes = await request(app, 'GET', '/emails?status=read', { authorization: `Bearer ${userToken}` });
  if (statusFilterRes.status !== 200) throw new Error(`FAILED: GET /emails?status=read threw (status ${statusFilterRes.status})`);
  if (typeof statusFilterRes.body.total !== 'number' || statusFilterRes.body.total < 1) {
    throw new Error('FAILED: GET /emails?status=read returned an incorrect total');
  }
  if (!statusFilterRes.body.emails.every((e: any) => e.status === 'read')) {
    throw new Error('FAILED: GET /emails?status=read returned emails with the wrong status');
  }

  const classificationFilterRes = await request(app, 'GET', '/emails?classification=newsletter', { authorization: `Bearer ${userToken}` });
  if (classificationFilterRes.status !== 200) throw new Error(`FAILED: GET /emails?classification=newsletter threw (status ${classificationFilterRes.status})`);
  if (typeof classificationFilterRes.body.total !== 'number' || classificationFilterRes.body.total < 1) {
    throw new Error('FAILED: GET /emails?classification=newsletter returned an incorrect total');
  }
  if (!classificationFilterRes.body.emails.every((e: any) => e.classification === 'newsletter')) {
    throw new Error('FAILED: GET /emails?classification=newsletter returned emails with the wrong classification');
  }
  console.log('        Passed: GET /emails filters by status/classification without a placeholder mismatch.');

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

  // 7b. GET /threads — one row per thread, not one row per flat message
  console.log('    7.7b Testing GET /threads returns one thread row with the correct message_count...');
  const threadRes = await query(
    `INSERT INTO email_threads (user_id, google_thread_id, message_count, last_message_at)
     VALUES ($1, 'gthread_1', 2, NOW())
     RETURNING id`,
    [user.id]
  );
  const threadDbId = threadRes.rows[0].id;

  await query(
    `INSERT INTO emails (user_id, google_message_id, google_thread_id, thread_id, sender_email, sender_name, subject, body_text, received_at, status)
     VALUES ($1, 'thread_msg_1', 'gthread_1', $2, 'sender@example.com', 'Sender', 'Thread subject', 'First message body', NOW() - interval '1 hour', 'read')`,
    [user.id, threadDbId]
  );
  await query(
    `INSERT INTO emails (user_id, google_message_id, google_thread_id, thread_id, sender_email, sender_name, subject, body_text, received_at, status)
     VALUES ($1, 'thread_msg_2', 'gthread_1', $2, 'sender@example.com', 'Sender', 'Thread subject', 'Second, most recent message body', NOW(), 'unread')`,
    [user.id, threadDbId]
  );

  const threadsListRes = await request(app, 'GET', '/threads', { authorization: `Bearer ${userToken}` });
  if (threadsListRes.status !== 200 || !Array.isArray(threadsListRes.body.threads)) {
    throw new Error('FAILED: GET /threads');
  }

  const fetchedThread = threadsListRes.body.threads.find((t: any) => t.id === threadDbId);
  if (!fetchedThread) throw new Error('FAILED: Seeded thread not returned by GET /threads');
  if (fetchedThread.message_count !== 2) {
    throw new Error(`FAILED: Expected message_count=2, got ${fetchedThread.message_count}`);
  }
  if (fetchedThread.subject !== 'Thread subject') {
    throw new Error('FAILED: GET /threads did not return the most recent message subject');
  }
  if (typeof fetchedThread.snippet !== 'string' || !fetchedThread.snippet.includes('Second, most recent')) {
    throw new Error('FAILED: GET /threads did not join to the thread\'s most recent message');
  }
  const threadRowCount = threadsListRes.body.threads.filter((t: any) => t.id === threadDbId).length;
  if (threadRowCount !== 1) {
    throw new Error(`FAILED: Expected exactly one row for the thread, got ${threadRowCount} (flat messages leaking through)`);
  }
  console.log('        Passed: GET /threads groups messages into one row per thread with the correct message_count.');

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
