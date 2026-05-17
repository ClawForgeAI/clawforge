-- Migration: Convert audit_events to a partitioned table (by month on timestamp).
--
-- This migration:
-- 1. Renames the existing table to a temporary name
-- 2. Creates a new partitioned table with the same schema
-- 3. Copies existing data into the partitioned table
-- 4. Drops the temporary table
-- 5. Creates initial monthly partitions (current month +/- 3 months)
--
-- Idempotent: the whole migration is wrapped in a check for whether
-- audit_events is already partitioned. Safe to re-run.
--
-- NOTE: When run for the first time, it briefly takes audit_events offline.

DO $migration$
BEGIN
  -- Skip if audit_events is already a partitioned table (relkind = 'p').
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = 'audit_events'
      AND n.nspname = 'public'
      AND c.relkind = 'p'
  ) THEN
    RAISE NOTICE 'audit_events is already partitioned; skipping 0001_audit_partitioning';
    RETURN;
  END IF;

  -- Step 1: Rename existing table
  ALTER TABLE audit_events RENAME TO audit_events_old;

  -- Step 2: Create partitioned table
  CREATE TABLE audit_events (
      id          UUID        NOT NULL DEFAULT gen_random_uuid(),
      org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id     UUID        NOT NULL,
      event_type  TEXT        NOT NULL,
      tool_name   TEXT,
      outcome     TEXT        NOT NULL,
      agent_id    TEXT,
      session_key TEXT,
      metadata    JSONB,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, "timestamp")
  ) PARTITION BY RANGE ("timestamp");

  -- Step 3: Create indexes on the partitioned table
  CREATE INDEX IF NOT EXISTS audit_events_org_ts_idx ON audit_events (org_id, "timestamp");
  CREATE INDEX IF NOT EXISTS audit_events_org_user_idx ON audit_events (org_id, user_id);

  -- Step 4: Create monthly partitions for current period
  DECLARE
      start_date DATE;
      end_date DATE;
      partition_name TEXT;
      partition_start DATE;
      partition_end DATE;
  BEGIN
      -- Create partitions for 3 months back through 6 months forward
      start_date := date_trunc('month', CURRENT_DATE - INTERVAL '3 months');
      end_date := date_trunc('month', CURRENT_DATE + INTERVAL '7 months');

      partition_start := start_date;
      WHILE partition_start < end_date LOOP
          partition_end := partition_start + INTERVAL '1 month';
          partition_name := 'audit_events_' || to_char(partition_start, 'YYYY_MM');

          EXECUTE format(
              'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_events FOR VALUES FROM (%L) TO (%L)',
              partition_name,
              partition_start,
              partition_end
          );

          partition_start := partition_end;
      END LOOP;
  END;

  -- Step 5: Create a default partition for data outside defined ranges
  CREATE TABLE IF NOT EXISTS audit_events_default PARTITION OF audit_events DEFAULT;

  -- Step 6: Copy existing data
  INSERT INTO audit_events (id, org_id, user_id, event_type, tool_name, outcome, agent_id, session_key, metadata, "timestamp")
  SELECT id, org_id, user_id, event_type, tool_name, outcome, agent_id, session_key, metadata, "timestamp"
  FROM audit_events_old;

  -- Step 7: Drop old table
  DROP TABLE audit_events_old;
END;
$migration$;
