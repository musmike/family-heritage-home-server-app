-- V6__Add_biography_content_to_people.sql

ALTER TABLE people
    ADD COLUMN IF NOT EXISTS biography_content TEXT;