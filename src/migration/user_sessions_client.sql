-- Separate app vs web user sessions.
-- Dev/staging auto-apply via `sequelize.sync({ alter: true })` on backend start.
-- For production, run this script once. All statements are idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'enum_user_sessions_client'
  ) THEN
    CREATE TYPE enum_user_sessions_client AS ENUM ('web', 'app');
  END IF;
END
$$;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS client enum_user_sessions_client NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS user_sessions_client_idx ON user_sessions (client);
