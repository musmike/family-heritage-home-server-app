-- V13__Collections_hierarchy_dated_collections_and_media_flags.sql

-- 1. Extend media_collections with parent_collection_id and dated collection fields
ALTER TABLE media_collections
    ADD COLUMN IF NOT EXISTS parent_collection_id BIGINT,
    ADD COLUMN IF NOT EXISTS is_dated_collection BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS start_year INT,
    ADD COLUMN IF NOT EXISTS end_year INT,
    ADD CONSTRAINT fk_media_collections_parent FOREIGN KEY (parent_collection_id)
        REFERENCES media_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_collections_parent_id ON media_collections (parent_collection_id);
CREATE INDEX IF NOT EXISTS idx_media_collections_dated ON media_collections (is_dated_collection, start_year);

-- 2. Extend media_items with portrait_media and unknown_media flags
ALTER TABLE media_items
    ADD COLUMN IF NOT EXISTS is_portrait BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_unknown BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE media_items
SET is_portrait = TRUE
WHERE primary_context = 'PERSON';