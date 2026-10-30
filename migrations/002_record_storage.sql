-- Additive migration: old shield_workspace is retained unchanged for rollback.
-- @statement
CREATE TABLE IF NOT EXISTS shield_records (
 collection text NOT NULL,
 key text NOT NULL,
 data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(collection,key)
);
-- @statement
CREATE UNIQUE INDEX IF NOT EXISTS shield_payment_request_key ON shield_records ((data->>'userId'),(data->>'key')) WHERE collection='payments' AND data->>'key' IS NOT NULL;
-- @statement
CREATE TABLE IF NOT EXISTS shield_revision (id text PRIMARY KEY, version bigint NOT NULL);

-- @statement
CREATE OR REPLACE FUNCTION shield_migrate_records() RETURNS void LANGUAGE plpgsql AS $$
DECLARE s jsonb; c text; item record;
BEGIN
 PERFORM pg_advisory_xact_lock(78231004);
 IF EXISTS(SELECT 1 FROM shield_revision WHERE id='main') THEN RETURN; END IF;
 IF to_regclass('public.shield_workspace') IS NOT NULL THEN
  SELECT data INTO s FROM shield_workspace WHERE id='main';
 END IF;
 s := COALESCE(s,'{"users":{},"sessions":{},"loginAttempts":{},"payments":[],"history":[],"audit":[]}'::jsonb);
 FOREACH c IN ARRAY ARRAY['users','sessions','loginAttempts'] LOOP
  INSERT INTO shield_records(collection,key,data) SELECT c,j.key,j.value FROM jsonb_each(COALESCE(s->c,'{}'::jsonb)) j ON CONFLICT DO NOTHING;
 END LOOP;
 FOREACH c IN ARRAY ARRAY['payments','audit'] LOOP
  INSERT INTO shield_records(collection,key,data) SELECT c,j.value->>'id',j.value FROM jsonb_array_elements(COALESCE(s->c,'[]'::jsonb)) j ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO shield_records(collection,key,data)
 SELECT 'history','legacy-history-'||j.ordinality, j.value||jsonb_build_object('_storeId','legacy-history-'||j.ordinality)
 FROM jsonb_array_elements(COALESCE(s->'history','[]'::jsonb)) WITH ORDINALITY j(value,ordinality) ON CONFLICT DO NOTHING;
 INSERT INTO shield_revision VALUES ('main',1) ON CONFLICT DO NOTHING;
END $$;

-- @statement
CREATE OR REPLACE FUNCTION shield_apply_records(patch jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE p jsonb; current_data jsonb;
BEGIN
 -- Consistent lock order avoids opposite account update deadlocks.
 FOR p IN SELECT value FROM jsonb_array_elements(patch) ORDER BY value->>'collection',value->>'key' LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended((p->>'collection')||':'||(p->>'key'),0));
  SELECT data INTO current_data FROM shield_records WHERE collection=p->>'collection' AND key=p->>'key';
  IF current_data IS DISTINCT FROM NULLIF(p->'previous','null'::jsonb) THEN RETURN false; END IF;
 END LOOP;
 BEGIN
  FOR p IN SELECT value FROM jsonb_array_elements(patch) LOOP
   IF p->'next'='null'::jsonb THEN
    DELETE FROM shield_records WHERE collection=p->>'collection' AND key=p->>'key';
   ELSE
    INSERT INTO shield_records(collection,key,data) VALUES(p->>'collection',p->>'key',p->'next')
    ON CONFLICT(collection,key) DO UPDATE SET data=excluded.data;
   END IF;
  END LOOP;
  UPDATE shield_revision SET version=version+1 WHERE id='main';
 EXCEPTION WHEN unique_violation THEN RETURN false;
 END;
 RETURN true;
END $$;
-- @statement
SELECT shield_migrate_records();
