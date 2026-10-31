-- V8__Add_event_hierarchy_and_title.sql

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS parent_event_id BIGINT,
    ADD CONSTRAINT fk_events_parent_event FOREIGN KEY (parent_event_id)
        REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_parent_event_id ON events (parent_event_id);