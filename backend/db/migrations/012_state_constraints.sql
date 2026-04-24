ALTER TABLE must_act_items
  DROP CONSTRAINT IF EXISTS must_act_items_status_check;
ALTER TABLE must_act_items
  ADD CONSTRAINT must_act_items_status_check
  CHECK (status IN ('open', 'approved', 'rejected', 'deferred', 'edited', 'expired'));

ALTER TABLE must_act_items
  DROP CONSTRAINT IF EXISTS must_act_items_deferred_until_check;
ALTER TABLE must_act_items
  ADD CONSTRAINT must_act_items_deferred_until_check
  CHECK (
    (status = 'deferred' AND deferred_until IS NOT NULL)
    OR (status <> 'deferred' AND deferred_until IS NULL)
  );

ALTER TABLE followup_threads
  DROP CONSTRAINT IF EXISTS followup_threads_state_check;
ALTER TABLE followup_threads
  ADD CONSTRAINT followup_threads_state_check
  CHECK (state IN ('open', 'waiting', 'closed'));

ALTER TABLE followup_schedules
  DROP CONSTRAINT IF EXISTS followup_schedules_status_check;
ALTER TABLE followup_schedules
  ADD CONSTRAINT followup_schedules_status_check
  CHECK (status IN ('pending', 'suggested', 'sent', 'cancelled', 'failed'));

ALTER TABLE followup_schedules
  DROP CONSTRAINT IF EXISTS followup_schedules_sent_at_check;
ALTER TABLE followup_schedules
  ADD CONSTRAINT followup_schedules_sent_at_check
  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR (status <> 'sent')
  );

DELETE FROM followup_schedules
WHERE thread_state_id IS NULL;

ALTER TABLE followup_schedules
  ALTER COLUMN thread_state_id SET NOT NULL;

ALTER TABLE agent_actions
  DROP CONSTRAINT IF EXISTS agent_actions_status_check;
ALTER TABLE agent_actions
  ADD CONSTRAINT agent_actions_status_check
  CHECK (
    status IN (
      'accepted',
      'approved',
      'rejected',
      'always_allow',
      'preview',
      'suggest',
      'suggested',
      'modified',
      'executed',
      'failed',
      'cancelled',
      'undone'
    )
  );

CREATE INDEX IF NOT EXISTS must_act_items_user_status_updated_idx
  ON must_act_items (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS followup_threads_user_thread_updated_idx
  ON followup_threads (user_id, thread_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS followup_schedules_user_thread_status_scheduled_idx
  ON followup_schedules (user_id, thread_state_id, status, scheduled_for);

CREATE UNIQUE INDEX IF NOT EXISTS followup_schedules_active_thread_action_unique_idx
  ON followup_schedules (user_id, thread_state_id, action)
  WHERE status IN ('pending', 'suggested');
