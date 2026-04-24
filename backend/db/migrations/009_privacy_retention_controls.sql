ALTER TABLE users
  ADD COLUMN IF NOT EXISTS data_retention_days integer NOT NULL DEFAULT 180;
