import { query } from '../../db/index.js';
import { createTestUser } from './helpers.js';
import { StructuredAiService } from '../../ai/structuredAiService.js';
import { DraftReplyService, type DraftAiProvider } from '../../ai/draftReplyService.js';
import { processReplyDrafting, makeReplyIdempotencyKey } from '../../services/replyDraftingService.js';
import { queueAutoSend, type PreparedSendPayload } from '../../services/googleWriteService.js';
import { agentQueue } from '../../queues/index.js';

async function grantSendScope(userId: string) {
  await query(
    `INSERT INTO user_credentials (user_id, provider, encrypted_access_token, scopes)
     VALUES ($1, 'google', 'placeholder', ARRAY['https://www.googleapis.com/auth/gmail.send'])`,
    [userId]
  );
}

async function setReplyDrafting(userId: string, value: 'off' | 'review' | 'auto') {
  await query(
    `INSERT INTO user_preferences (user_id, preferences)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET preferences = $2::jsonb`,
    [userId, JSON.stringify({ replyDrafting: value, replyTone: 'neutral' })]
  );
}

/** Creates a thread with one inbound email in it (not from the user — no
 * SENT label), returning enough to call processReplyDrafting against it. */
async function createInboundThread(
  userId: string,
  opts: { subject?: string; senderEmail?: string; bodyText?: string; googleThreadId?: string } = {}
) {
  const googleThreadId = opts.googleThreadId ?? `gthread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const threadRes = await query(
    `INSERT INTO email_threads (user_id, google_thread_id, last_message_at) VALUES ($1, $2, NOW()) RETURNING id`,
    [userId, googleThreadId]
  );
  const threadId = threadRes.rows[0].id as string;

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const emailRes = await query(
    `INSERT INTO emails (user_id, google_message_id, google_thread_id, thread_id, sender_email, sender_name, subject, body_text, received_at, labels, message_id_header)
     VALUES ($1, $2, $3, $4, $5, 'Sender Name', $6, $7, NOW(), ARRAY['INBOX'], $8)
     RETURNING id`,
    [
      userId,
      msgId,
      googleThreadId,
      threadId,
      opts.senderEmail ?? 'sender@example.com',
      opts.subject ?? 'Quick question',
      opts.bodyText ?? 'Can you send over the report by Friday?',
      `<${msgId}@example.com>`,
    ]
  );
  return { emailId: emailRes.rows[0].id as string, threadId, googleThreadId };
}

const HIGH_CONFIDENCE_DRAFT: DraftAiProvider = {
  call: async () => ({
    rawText: JSON.stringify({ draftBody: 'Sure, I will send it over by Friday.', confidence: 0.95, reasoning: 'Direct request, clear answer.' }),
    promptTokens: 20,
    completionTokens: 15,
  }),
};

const LOW_CONFIDENCE_DRAFT: DraftAiProvider = {
  call: async () => ({
    rawText: JSON.stringify({ draftBody: 'Maybe, not sure.', confidence: 0.5, reasoning: 'Ambiguous ask.' }),
    promptTokens: 20,
    completionTokens: 10,
  }),
};

const REPLY_WORTHY_EXTRACTION = { isNoise: false, replyWorthy: true, replyWorthyConfidence: 0.9 };

export async function runReplyDraftingTest() {
  console.log('  [Suite 14] Reply Drafting — detection, routing, and the concurrent auto-send race...');

  // 1. Schema: chk_approvals_action_type now accepts draft_reply
  console.log('    14.1 Testing chk_approvals_action_type accepts draft_reply...');
  const schemaUser = await createTestUser();
  const draftRow = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload) VALUES ($1, 'draft_reply', 'pending', '{}') RETURNING action_type`,
    [schemaUser.id]
  );
  if (draftRow.rows[0].action_type !== 'draft_reply') throw new Error('FAILED: draft_reply insert did not round-trip');

  let rejectedBogus = false;
  try {
    await query(`INSERT INTO approvals (user_id, action_type, status, prepared_payload) VALUES ($1, 'archive_email', 'pending', '{}')`, [schemaUser.id]);
  } catch (err: any) {
    if (err.code === '23514') rejectedBogus = true;
  }
  if (!rejectedBogus) throw new Error('FAILED: chk_approvals_action_type still accepts an unsupported value');
  console.log('        Passed.');

  // 2. Schema: emails/email_intelligence new columns exist and round-trip
  console.log('    14.2 Testing emails.message_id_header/references_header and email_intelligence.reply_worthy(_confidence)...');
  const { emailId: colsEmailId } = await createInboundThread(schemaUser.id);
  const emailCols = await query(`SELECT message_id_header, references_header FROM emails WHERE id = $1`, [colsEmailId]);
  if (!emailCols.rows[0].message_id_header) throw new Error('FAILED: message_id_header not persisted');

  await query(
    `INSERT INTO email_intelligence (email_id, extraction_version, intent_classification, sender_classification, priority_score, urgency_score, is_noise, reply_worthy, reply_worthy_confidence)
     VALUES ($1, 1, 'task', 'peer', 50, 50, false, true, 0.8)`,
    [colsEmailId]
  );
  const intelRow = await query(`SELECT reply_worthy, reply_worthy_confidence FROM email_intelligence WHERE email_id = $1`, [colsEmailId]);
  if (intelRow.rows[0].reply_worthy !== true || Number(intelRow.rows[0].reply_worthy_confidence) !== 0.8) {
    throw new Error('FAILED: reply_worthy/reply_worthy_confidence did not round-trip');
  }
  console.log('        Passed.');

  // 3. Phase A: isNoise forces replyWorthy false regardless of what the model said
  console.log('    14.3 Testing StructuredAiService suppresses replyWorthy when isNoise...');
  const noisyProvider = {
    call: async () => ({
      rawText: JSON.stringify({
        intentClassification: 'newsletter', senderClassification: 'automated',
        priorityScore: 10, urgencyScore: 5, isNoise: true,
        actionCandidates: [], opportunityCandidates: [],
        replyWorthy: true, replyWorthyConfidence: 0.99, reasoning: 'test',
      }),
      promptTokens: 10, completionTokens: 10,
    }),
  };
  const noisyResult = await StructuredAiService.analyzeEmail('Newsletter', 'Unsubscribe here', 'a@b.com', noisyProvider);
  if (noisyResult.data.replyWorthy !== false) throw new Error('FAILED: isNoise did not suppress replyWorthy');
  console.log('        Passed.');

  // 4. Phase B: abstains (returns null) when no provider is available — the
  //    integration test env has no GEMINI_API_KEY, matching production's
  //    "no placeholder prose" contract.
  console.log('    14.4 Testing DraftReplyService abstains (null) with no provider available...');
  const abstained = await DraftReplyService.generateDraft(
    [{ senderEmail: 'a@b.com', isFromUser: false, receivedAt: new Date().toISOString(), bodyText: 'Hi' }],
    'neutral'
  );
  if (abstained !== null) throw new Error('FAILED: DraftReplyService should abstain (null), not fabricate a draft, when no provider is configured');
  console.log('        Passed.');

  // 5. Routing: 'off' produces nothing
  console.log('    14.5 Testing replyDrafting=off produces no approvals row...');
  const offUser = await createTestUser();
  await setReplyDrafting(offUser.id, 'off');
  const { emailId: offEmailId } = await createInboundThread(offUser.id);
  await processReplyDrafting(offEmailId, offUser.id, REPLY_WORTHY_EXTRACTION, HIGH_CONFIDENCE_DRAFT);
  const offRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [offEmailId]);
  if (offRows.rows.length !== 0) throw new Error('FAILED: replyDrafting=off should never create an approvals row');
  console.log('        Passed.');

  // 6. Routing: 'review' produces a draft_reply/pending row, and re-extraction
  //    refreshes it rather than duplicating it (idempotency_key UNIQUE)
  console.log('    14.6 Testing replyDrafting=review creates one draft_reply row, refreshed on re-run...');
  const reviewUser = await createTestUser();
  await setReplyDrafting(reviewUser.id, 'review');
  const { emailId: reviewEmailId } = await createInboundThread(reviewUser.id);

  await processReplyDrafting(reviewEmailId, reviewUser.id, REPLY_WORTHY_EXTRACTION, HIGH_CONFIDENCE_DRAFT);
  let reviewRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [reviewEmailId]);
  if (reviewRows.rows.length !== 1) throw new Error(`FAILED: expected exactly 1 approvals row, got ${reviewRows.rows.length}`);
  if (reviewRows.rows[0].action_type !== 'draft_reply' || reviewRows.rows[0].status !== 'pending') {
    throw new Error('FAILED: review draft should be action_type=draft_reply, status=pending');
  }
  if (Number(reviewRows.rows[0].confidence) !== 0.95) throw new Error('FAILED: draft confidence not persisted onto approvals.confidence');

  // Re-run with a different draft body — must UPDATE the same row, not insert a second
  const secondDraft: DraftAiProvider = {
    call: async () => ({ rawText: JSON.stringify({ draftBody: 'Updated draft body.', confidence: 0.8, reasoning: 'r2' }), promptTokens: 5, completionTokens: 5 }),
  };
  await processReplyDrafting(reviewEmailId, reviewUser.id, REPLY_WORTHY_EXTRACTION, secondDraft);
  reviewRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [reviewEmailId]);
  if (reviewRows.rows.length !== 1) throw new Error(`FAILED: re-extraction should update the same row, found ${reviewRows.rows.length}`);
  if (reviewRows.rows[0].prepared_payload.bodyText !== 'Updated draft body.') {
    throw new Error('FAILED: pending draft was not refreshed by re-extraction');
  }
  console.log('        Passed.');

  // 7. Protected status: once approved, re-extraction must not touch it
  console.log('    14.7 Testing an approved draft is protected from re-extraction overwrite...');
  await query(`UPDATE approvals SET status = 'approved' WHERE email_id = $1`, [reviewEmailId]);
  await processReplyDrafting(reviewEmailId, reviewUser.id, REPLY_WORTHY_EXTRACTION, HIGH_CONFIDENCE_DRAFT);
  const protectedRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [reviewEmailId]);
  if (protectedRows.rows.length !== 1 || protectedRows.rows[0].status !== 'approved') {
    throw new Error('FAILED: an approved draft must not be reopened or duplicated by re-extraction');
  }
  if (protectedRows.rows[0].prepared_payload.bodyText !== 'Updated draft body.') {
    throw new Error('FAILED: approved draft content was overwritten by re-extraction');
  }
  console.log('        Passed.');

  // 8. Routing: thread already answered (SENT label on latest message) skips entirely
  console.log('    14.8 Testing an already-answered thread produces no draft...');
  const answeredUser = await createTestUser();
  await setReplyDrafting(answeredUser.id, 'review');
  const { emailId: answeredEmailId, threadId: answeredThreadId } = await createInboundThread(answeredUser.id);
  await query(
    `INSERT INTO emails (user_id, google_message_id, thread_id, sender_email, subject, body_text, received_at, labels)
     VALUES ($1, $2, $3, $4, 'Re: Quick question', 'Already replied.', NOW() + interval '1 minute', ARRAY['SENT'])`,
    [answeredUser.id, `msg_sent_${Date.now()}`, answeredThreadId, answeredUser.email]
  );
  await processReplyDrafting(answeredEmailId, answeredUser.id, REPLY_WORTHY_EXTRACTION, HIGH_CONFIDENCE_DRAFT);
  const answeredRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [answeredEmailId]);
  if (answeredRows.rows.length !== 0) throw new Error('FAILED: an already-SENT-answered thread should never get a draft');
  console.log('        Passed.');

  // 9. Routing: 'auto' + high confidence goes straight to queueAutoSend (send_reply, no draft_reply)
  console.log('    14.9 Testing replyDrafting=auto + high confidence queues a send_reply directly...');
  const autoUser = await createTestUser();
  await setReplyDrafting(autoUser.id, 'auto');
  await grantSendScope(autoUser.id);
  const { emailId: autoEmailId } = await createInboundThread(autoUser.id);
  await processReplyDrafting(autoEmailId, autoUser.id, REPLY_WORTHY_EXTRACTION, HIGH_CONFIDENCE_DRAFT);
  const autoRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [autoEmailId]);
  if (autoRows.rows.length !== 1) throw new Error(`FAILED: expected exactly 1 row for auto path, got ${autoRows.rows.length}`);
  if (autoRows.rows[0].action_type !== 'send_reply' || autoRows.rows[0].status !== 'pending' || !autoRows.rows[0].scheduled_at) {
    throw new Error('FAILED: high-confidence auto draft should go straight to a scheduled send_reply row');
  }
  console.log('        Passed.');

  // 10. Routing: 'auto' + LOW confidence falls back to a review draft, never silently dropped
  console.log('    14.10 Testing replyDrafting=auto + low confidence falls back to draft_reply, not dropped...');
  const autoLowUser = await createTestUser();
  await setReplyDrafting(autoLowUser.id, 'auto');
  await grantSendScope(autoLowUser.id);
  const { emailId: autoLowEmailId } = await createInboundThread(autoLowUser.id);
  await processReplyDrafting(autoLowEmailId, autoLowUser.id, REPLY_WORTHY_EXTRACTION, LOW_CONFIDENCE_DRAFT);
  const autoLowRows = await query(`SELECT * FROM approvals WHERE email_id = $1`, [autoLowEmailId]);
  if (autoLowRows.rows.length !== 1) throw new Error(`FAILED: expected exactly 1 fallback row, got ${autoLowRows.rows.length}`);
  if (autoLowRows.rows[0].action_type !== 'draft_reply' || autoLowRows.rows[0].scheduled_at !== null) {
    throw new Error('FAILED: a low-confidence auto draft must fall back to an unscheduled draft_reply row, not be dropped or auto-scheduled');
  }
  console.log('        Passed.');

  // 11. THE RACE: two concurrent queueAutoSend calls with the SAME idempotency
  //     key must result in exactly one approvals row and exactly one winner —
  //     this is what actually proves the fix, not just that the happy path works.
  console.log('    14.11 Testing concurrent queueAutoSend calls with the same key cannot double-send...');
  const raceUser = await createTestUser();
  await grantSendScope(raceUser.id);
  const { emailId: raceEmailId } = await createInboundThread(raceUser.id);
  const raceKey = makeReplyIdempotencyKey({ userId: raceUser.id, emailId: raceEmailId });
  const racePayload: PreparedSendPayload = {
    threadId: 'gthread_race', to: 'sender@example.com', subject: 'Re: race', bodyText: 'racing draft',
  };

  const [resultA, resultB] = await Promise.all([
    queueAutoSend(raceUser.id, raceEmailId, racePayload, raceKey),
    queueAutoSend(raceUser.id, raceEmailId, racePayload, raceKey),
  ]);

  const raceApprovalRows = await query(`SELECT id FROM approvals WHERE idempotency_key = $1`, [raceKey]);
  if (raceApprovalRows.rows.length !== 1) {
    throw new Error(`FAILED: two concurrent queueAutoSend calls with the same key created ${raceApprovalRows.rows.length} rows — must be exactly 1`);
  }
  if (resultA.approvalId !== resultB.approvalId) {
    throw new Error('FAILED: both concurrent calls should resolve to the SAME approvalId');
  }
  const alreadyQueuedFlags = [resultA.alreadyQueued, resultB.alreadyQueued].sort();
  if (JSON.stringify(alreadyQueuedFlags) !== JSON.stringify([false, true])) {
    throw new Error(
      `FAILED: expected exactly one winner (alreadyQueued=false) and one loser (alreadyQueued=true), got [${resultA.alreadyQueued}, ${resultB.alreadyQueued}]`
    );
  }
  // Exactly one BullMQ job was ever scheduled for this approval — the loser
  // never reached the agentQueue.add(...) line at all.
  const winnerJob = await agentQueue.getJob(raceApprovalRows.rows[0].id);
  if (!winnerJob) throw new Error('FAILED: the winning call should have scheduled exactly one BullMQ job');
  console.log('        Passed: concurrent auto-send attempts for the same email produced exactly one row and one scheduled job.');

  // 12. Sanity check on the backward-compat claim: omitting the idempotency
  //     key (undefined) must NOT collide across calls — NULL != NULL in Postgres.
  console.log('    14.12 Testing queueAutoSend without an idempotency key never collides (backward compatibility)...');
  const noKeyUser = await createTestUser();
  await grantSendScope(noKeyUser.id);
  const { emailId: noKeyEmailA } = await createInboundThread(noKeyUser.id);
  const { emailId: noKeyEmailB } = await createInboundThread(noKeyUser.id);
  const r1 = await queueAutoSend(noKeyUser.id, noKeyEmailA, racePayload);
  const r2 = await queueAutoSend(noKeyUser.id, noKeyEmailB, racePayload);
  if (r1.approvalId === r2.approvalId || r1.alreadyQueued || r2.alreadyQueued) {
    throw new Error('FAILED: two independent queueAutoSend calls with no idempotency key should never be treated as duplicates of each other');
  }
  console.log('        Passed.');
}
