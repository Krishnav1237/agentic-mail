ALTER TABLE users ADD COLUMN IF NOT EXISTS google_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_provider text NOT NULL DEFAULT 'microsoft';

ALTER TABLE users ALTER COLUMN ms_access_token DROP NOT NULL;
ALTER TABLE users ALTER COLUMN ms_refresh_token DROP NOT NULL;
ALTER TABLE users ALTER COLUMN ms_token_expires_at DROP NOT NULL;
