-- V4__add_default_proband_and_user_person.sql

ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_default_proband BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS person_id BIGINT,
    ADD CONSTRAINT fk_users_person FOREIGN KEY (person_id)
        REFERENCES people(id) ON DELETE SET NULL;