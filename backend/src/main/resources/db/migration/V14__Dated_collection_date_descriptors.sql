-- V14__Dated_collection_date_descriptors.sql

ALTER TABLE media_collections
    ADD COLUMN IF NOT EXISTS start_date_id BIGINT,
    ADD COLUMN IF NOT EXISTS end_date_id BIGINT,
    ADD CONSTRAINT fk_media_collections_start_date FOREIGN KEY (start_date_id)
        REFERENCES date_descriptors(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_media_collections_end_date FOREIGN KEY (end_date_id)
        REFERENCES date_descriptors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_collections_start_date ON media_collections(start_date_id);
CREATE INDEX IF NOT EXISTS idx_media_collections_end_date ON media_collections(end_date_id);

