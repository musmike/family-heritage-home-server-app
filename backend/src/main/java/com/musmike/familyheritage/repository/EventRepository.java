package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface EventRepository extends JpaRepository<Event, Long> {
    @Modifying
    @Query(value = "DELETE FROM events e WHERE NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id) " +
            "AND NOT EXISTS (SELECT 1 FROM families f WHERE f.primary_wedding_id = e.id)", nativeQuery = true)
    void deleteOrphanEvents();
}