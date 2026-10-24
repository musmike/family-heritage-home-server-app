-- V3__Update_import_sessions_and_external_ids.sql

ALTER TABLE gedcom_import_sessions
    ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

UPDATE person_external_ids
SET source_system = 'UNKNOWN'
WHERE source_system IS NULL;

ALTER TABLE person_external_ids
    ALTER COLUMN source_system SET NOT NULL,
    DROP CONSTRAINT IF EXISTS person_external_ids_uid_value_key,
    ADD CONSTRAINT ux_person_external_ids_source_uid UNIQUE (source_system, uid_value);

CREATE INDEX IF NOT EXISTS idx_person_external_ids_source_uid
    ON person_external_ids (source_system, uid_value);


UPDATE family_external_ids
SET source_system = 'UNKNOWN'
WHERE source_system IS NULL;

ALTER TABLE family_external_ids
    ALTER COLUMN source_system SET NOT NULL,
    DROP CONSTRAINT IF EXISTS family_external_ids_uid_value_key,
    ADD CONSTRAINT ux_family_external_ids_source_uid UNIQUE (source_system, uid_value);

CREATE INDEX IF NOT EXISTS idx_family_external_ids_source_uid
    ON family_external_ids (source_system, uid_value);