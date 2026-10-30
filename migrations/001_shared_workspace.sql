CREATE TABLE IF NOT EXISTS shield_workspace (
 id text PRIMARY KEY,
 version integer NOT NULL DEFAULT 0,
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
