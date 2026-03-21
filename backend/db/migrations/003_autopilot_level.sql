ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS autopilot_level smallint DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_goals' AND column_name='autopilot_mode') THEN
    UPDATE user_goals SET autopilot_level = CASE WHEN autopilot_mode THEN 1 ELSE 0 END WHERE autopilot_level IS NULL;
    ALTER TABLE user_goals DROP COLUMN IF EXISTS autopilot_mode;
  END IF;
END $$;
