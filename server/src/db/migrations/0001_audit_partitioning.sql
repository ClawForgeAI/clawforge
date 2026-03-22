-- Migration: Convert audit_events to a partitioned table (by month on timestamp).
--
-- NOTE: Run this during a maintenance window. The table will be briefly unavailable.

-- Step 1: Drop existing indexes (they will be recreated on the partitioned table)
DROP INDEX IF EXISTS audit_events_org_ts_idx;
DROP INDEX IF EXISTS audit_events_org_user_idx;

-- Step 2: Rename existing table
ALTER TABLE audit_events RENAME TO audit_events_old;

-- Step 3: Create partitioned table
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

-- Step 4: Create indexes on the partitioned table
CREATE INDEX audit_events_org_ts_idx ON audit_events (org_id, "timestamp");
CREATE INDEX audit_events_org_user_idx ON audit_events (org_id, user_id);

-- Step 5: Create monthly partitions for current period
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
    partition_start DATE;
    partition_end DATE;
BEGIN
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
END $$;

-- Step 6: Create a default partition for data outside defined ranges
CREATE TABLE IF NOT EXISTS audit_events_default PARTITION OF audit_events DEFAULT;

-- Step 7: Copy existing data
INSERT INTO audit_events (id, org_id, user_id, event_type, tool_name, outcome, agent_id, session_key, metadata, "timestamp")
SELECT id, org_id, user_id, event_type, tool_name, outcome, agent_id, session_key, metadata, "timestamp"
FROM audit_events_old;

-- Step 8: Drop old table
DROP TABLE audit_events_old;
