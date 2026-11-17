-- V10__Expand_events_taxonomy_roles_time_and_indexes.sql

-- 1. Add time and time qualifiers to date_descriptors
ALTER TABLE date_descriptors
    ADD COLUMN IF NOT EXISTS start_time_qualifier VARCHAR(50),
    ADD COLUMN IF NOT EXISTS start_hour INT,
    ADD COLUMN IF NOT EXISTS start_minute INT,
    ADD COLUMN IF NOT EXISTS end_time_qualifier VARCHAR(50),
    ADD COLUMN IF NOT EXISTS end_hour INT,
    ADD COLUMN IF NOT EXISTS end_minute INT;

-- 2. Allow multiple event types per event (many-to-many)
CREATE TABLE IF NOT EXISTS event_assigned_types (
                                                    event_id BIGINT NOT NULL,
                                                    user_code_id BIGINT NOT NULL,
                                                    PRIMARY KEY (event_id, user_code_id),
                                                    CONSTRAINT fk_eat_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                                                    CONSTRAINT fk_eat_user_code FOREIGN KEY (user_code_id) REFERENCES user_codes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eat_user_code_id ON event_assigned_types (user_code_id);

INSERT INTO event_assigned_types (event_id, user_code_id)
SELECT id, type_id FROM events
ON CONFLICT DO NOTHING;

-- 3. Support text-only (non-database) participants in event_participants
ALTER TABLE event_participants
    ALTER COLUMN person_id DROP NOT NULL,
    DROP CONSTRAINT IF EXISTS event_participants_event_id_person_id_key,
    ADD COLUMN IF NOT EXISTS participant_text VARCHAR(255),
    ADD COLUMN IF NOT EXISTS participant_sex VARCHAR(20),
    ADD CONSTRAINT chk_ep_person_or_text CHECK (person_id IS NOT NULL OR participant_text IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ep_event_person
    ON event_participants (event_id, person_id)
    WHERE person_id IS NOT NULL;

-- 4. Performance indexes for fast timeline loading
CREATE INDEX IF NOT EXISTS idx_events_type_id ON events (type_id);
CREATE INDEX IF NOT EXISTS idx_events_start_date_id ON events (start_date_id);
CREATE INDEX IF NOT EXISTS idx_events_end_date_id ON events (end_date_id);
CREATE INDEX IF NOT EXISTS idx_events_main_location_id ON events (main_location_id);
CREATE INDEX IF NOT EXISTS idx_events_cached_start_sort ON events (cached_start_sort_date_time);
CREATE INDEX IF NOT EXISTS idx_ep_event_id ON event_participants (event_id);

-- 5. Insert new participant roles
INSERT INTO user_codes (category, code, is_system)
VALUES
    ('EVENT_PARTICIPANT_ROLE', 'GODPARENT', TRUE),
    ('EVENT_PARTICIPANT_ROLE', 'WITNESS', TRUE),
    ('EVENT_PARTICIPANT_ROLE', 'HOST', TRUE),
    ('EVENT_PARTICIPANT_ROLE', 'VISITOR', TRUE),
    ('EVENT_PARTICIPANT_ROLE', 'GUEST', TRUE),
    ('EVENT_PARTICIPANT_ROLE', 'PARTICIPANT', TRUE)
ON CONFLICT (category, code) DO NOTHING;

-- 6. Insert all new event types
INSERT INTO user_codes (category, code, is_system)
VALUES
    ('EVENT_TYPE', 'BAPTISM', TRUE),
    ('EVENT_TYPE', 'BAPTISM_CEREMONY', TRUE),
    ('EVENT_TYPE', 'BAPTISM_RECEPTION', TRUE),
    ('EVENT_TYPE', 'FIRST_COMMUNION', TRUE),
    ('EVENT_TYPE', 'CONFIRMATION', TRUE),
    ('EVENT_TYPE', 'WEDDING_CEREMONY', TRUE),
    ('EVENT_TYPE', 'WEDDING_RECEPTION', TRUE),
    ('EVENT_TYPE', 'WEDDING_AFTERPARTY', TRUE),
    ('EVENT_TYPE', 'WEDDING_ANNIVERSARY', TRUE),
    ('EVENT_TYPE', 'GOLDEN_WEDDING_ANNIVERSARY', TRUE),
    ('EVENT_TYPE', 'DIAMOND_WEDDING_ANNIVERSARY', TRUE),
    ('EVENT_TYPE', 'FUNERAL', TRUE),
    ('EVENT_TYPE', 'FUNERAL_MASS', TRUE),
    ('EVENT_TYPE', 'FUNERAL_CEREMONY', TRUE),
    ('EVENT_TYPE', 'CREMATION', TRUE),
    ('EVENT_TYPE', 'FAMILY_GATHERING', TRUE),
    ('EVENT_TYPE', 'BIRTHDAY_PARTY', TRUE),
    ('EVENT_TYPE', 'VISIT', TRUE),
    ('EVENT_TYPE', 'TRIP', TRUE),
    ('EVENT_TYPE', 'SUMMER_VACATION', TRUE),
    ('EVENT_TYPE', 'WINTER_HOLIDAYS', TRUE),
    ('EVENT_TYPE', 'PILGRIMAGE', TRUE),
    ('EVENT_TYPE', 'SCHOOL_TRIP', TRUE),
    ('EVENT_TYPE', 'SCHOOL_REUNION', TRUE),
    ('EVENT_TYPE', 'SCHOOL_START_CEREMONY', TRUE),
    ('EVENT_TYPE', 'SCHOOL_END_CEREMONY', TRUE),
    ('EVENT_TYPE', 'SCHOOL_YEAR_START_CEREMONY', TRUE),
    ('EVENT_TYPE', 'SCHOOL_YEAR_END_CEREMONY', TRUE),
    ('EVENT_TYPE', 'SCHOOL_EVENT', TRUE),
    ('EVENT_TYPE', 'SCHOOL_EXAM', TRUE),
    ('EVENT_TYPE', 'SCHOOL_PROM', TRUE),
    ('EVENT_TYPE', 'SCHOOL_DISCO', TRUE),
    ('EVENT_TYPE', 'UNIVERSITY_EVENT', TRUE),
    ('EVENT_TYPE', 'ACADEMIC_YEAR_START_CEREMONY', TRUE),
    ('EVENT_TYPE', 'ACADEMIC_YEAR_END_CEREMONY', TRUE),
    ('EVENT_TYPE', 'THESIS_DEFENSE', TRUE),
    ('EVENT_TYPE', 'GRADUATION_CEREMONY', TRUE),
    ('EVENT_TYPE', 'UNIVERSITY_PROM', TRUE),
    ('EVENT_TYPE', 'UNIVERSITY_DISCO', TRUE),
    ('EVENT_TYPE', 'CHRISTMAS', TRUE),
    ('EVENT_TYPE', 'EASTER', TRUE),
    ('EVENT_TYPE', 'HARVEST', TRUE),
    ('EVENT_TYPE', 'FESTIVAL', TRUE),
    ('EVENT_TYPE', 'RENOVATION', TRUE),
    ('EVENT_TYPE', 'MOVING', TRUE)
ON CONFLICT (category, code) DO NOTHING;

-- 7. Link allowed participant roles to event types
-- 7a. Allow PRINCIPAL, PARTICIPANT, and GUEST for all event types
INSERT INTO event_type_participant_roles (event_type_id, participant_role_id)
SELECT t.id, r.id
FROM user_codes t
         CROSS JOIN user_codes r
WHERE t.category = 'EVENT_TYPE'
  AND r.category = 'EVENT_PARTICIPANT_ROLE'
  AND r.code IN ('PRINCIPAL', 'PARTICIPANT', 'GUEST')
ON CONFLICT (event_type_id, participant_role_id) DO NOTHING;

-- 7b. Allow GODPARENT and WITNESS for Baptism events
INSERT INTO event_type_participant_roles (event_type_id, participant_role_id)
SELECT t.id, r.id
FROM user_codes t
         CROSS JOIN user_codes r
WHERE t.category = 'EVENT_TYPE'
  AND t.code IN ('BAPTISM', 'BAPTISM_CEREMONY', 'BAPTISM_RECEPTION')
  AND r.category = 'EVENT_PARTICIPANT_ROLE'
  AND r.code IN ('GODPARENT', 'WITNESS')
ON CONFLICT (event_type_id, participant_role_id) DO NOTHING;

-- 7c. Allow WITNESS for Wedding & Confirmation events
INSERT INTO event_type_participant_roles (event_type_id, participant_role_id)
SELECT t.id, r.id
FROM user_codes t
         CROSS JOIN user_codes r
WHERE t.category = 'EVENT_TYPE'
  AND t.code IN ('WEDDING', 'WEDDING_CEREMONY', 'CONFIRMATION')
  AND r.category = 'EVENT_PARTICIPANT_ROLE'
  AND r.code = 'WITNESS'
ON CONFLICT (event_type_id, participant_role_id) DO NOTHING;

-- 7d. Allow HOST and VISITOR for Visit and Gathering events
INSERT INTO event_type_participant_roles (event_type_id, participant_role_id)
SELECT t.id, r.id
FROM user_codes t
         CROSS JOIN user_codes r
WHERE t.category = 'EVENT_TYPE'
  AND t.code IN ('VISIT', 'FAMILY_GATHERING', 'BIRTHDAY_PARTY', 'CHRISTMAS', 'EASTER')
  AND r.category = 'EVENT_PARTICIPANT_ROLE'
  AND r.code IN ('HOST', 'VISITOR')
ON CONFLICT (event_type_id, participant_role_id) DO NOTHING;

-- 8. Insert Polish translations for all event types
INSERT INTO translations (table_name, record_id, field_name, language_code, value)
SELECT 'user_codes', uc.id, 'code', 'pl-PL', v.pl_label
FROM (VALUES
          ('BIRTH', 'Narodziny'),
          ('BAPTISM', 'Chrzest'),
          ('BAPTISM_CEREMONY', 'Ceremonia chrztu'),
          ('BAPTISM_RECEPTION', 'Przyjęcie z okazji chrztu'),
          ('FIRST_COMMUNION', 'Pierwsza Komunia Święta'),
          ('CONFIRMATION', 'Bierzmowanie'),
          ('WEDDING', 'Ślub'),
          ('WEDDING_CEREMONY', 'Ceremonia ślubu'),
          ('WEDDING_RECEPTION', 'Wesele'),
          ('WEDDING_AFTERPARTY', 'Poprawiny'),
          ('WEDDING_ANNIVERSARY', 'Rocznica ślubu'),
          ('GOLDEN_WEDDING_ANNIVERSARY', 'Złote gody'),
          ('DIAMOND_WEDDING_ANNIVERSARY', 'Diamentowe gody'),
          ('DEATH', 'Śmierć'),
          ('FUNERAL', 'Pogrzeb'),
          ('FUNERAL_MASS', 'Msza pogrzebowa'),
          ('FUNERAL_CEREMONY', 'Ceremonia pogrzebowa'),
          ('CREMATION', 'Kremacja'),
          ('BURIAL', 'Pochówek'),
          ('FAMILY_GATHERING', 'Spotkanie rodzinne'),
          ('BIRTHDAY_PARTY', 'Przyjęcie urodzinowe'),
          ('VISIT', 'Odwiedziny'),
          ('TRIP', 'Wyjazd'),
          ('SUMMER_VACATION', 'Wakacje'),
          ('WINTER_HOLIDAYS', 'Ferie'),
          ('PILGRIMAGE', 'Pielgrzymka'),
          ('SCHOOL_TRIP', 'Wycieczka szkolna'),
          ('SCHOOL_REUNION', 'Zjazd szkolny'),
          ('SCHOOL_START_CEREMONY', 'Uroczystość rozpoczęcia szkoły'),
          ('SCHOOL_END_CEREMONY', 'Uroczystość zakończenia szkoły'),
          ('SCHOOL_YEAR_START_CEREMONY', 'Uroczystość rozpoczęcia roku szkolnego'),
          ('SCHOOL_YEAR_END_CEREMONY', 'Uroczystość zakończenia roku szkolnego'),
          ('SCHOOL_EVENT', 'Wydarzenie szkolne'),
          ('SCHOOL_EXAM', 'Egzamin szkolny'),
          ('SCHOOL_PROM', 'Bal szkolny'),
          ('SCHOOL_DISCO', 'Dyskoteka szkolna'),
          ('UNIVERSITY_EVENT', 'Wydarzenie uczelniane'),
          ('ACADEMIC_YEAR_START_CEREMONY', 'Uroczystość rozpoczęcia roku akademickiego'),
          ('ACADEMIC_YEAR_END_CEREMONY', 'Uroczystość zakończenia roku akademickiego'),
          ('THESIS_DEFENSE', 'Obrona pracy dyplomowej'),
          ('GRADUATION_CEREMONY', 'Graduacja studentów'),
          ('UNIVERSITY_PROM', 'Bal uczelniany'),
          ('UNIVERSITY_DISCO', 'Dyskoteka uczelniana'),
          ('CHRISTMAS', 'Święta Bożego Narodzenia'),
          ('EASTER', 'Święta Wielkanocne'),
          ('HARVEST', 'Żniwa'),
          ('FESTIVAL', 'Festyn'),
          ('RENOVATION', 'Remont'),
          ('MOVING', 'Przeprowadzka')
     ) AS v(code, pl_label)
         JOIN user_codes uc ON uc.category = 'EVENT_TYPE' AND uc.code = v.code
ON CONFLICT (table_name, record_id, field_name, language_code) DO NOTHING;