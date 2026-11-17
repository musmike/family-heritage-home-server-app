-- V16__Add_folder_slug_to_graves.sql

ALTER TABLE graves
    ADD COLUMN IF NOT EXISTS folder_slug VARCHAR(255);