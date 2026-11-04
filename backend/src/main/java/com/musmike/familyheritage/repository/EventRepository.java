package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface EventRepository extends JpaRepository<Event, Long> {

    @Query("SELECT DISTINCT e FROM Event e " +
            "LEFT JOIN FETCH e.eventType " +
            "LEFT JOIN FETCH e.assignedTypes " +
            "LEFT JOIN FETCH e.startDate " +
            "LEFT JOIN FETCH e.endDate " +
            "LEFT JOIN FETCH e.mainLocation " +
            "LEFT JOIN FETCH e.parentEvent pe " +
            "LEFT JOIN FETCH pe.eventType " +
            "LEFT JOIN FETCH e.parentLinks pl " +
            "LEFT JOIN FETCH pl.parentEvent lpe " +
            "LEFT JOIN FETCH lpe.eventType " +
            "LEFT JOIN FETCH e.participants ep " +
            "LEFT JOIN FETCH ep.person p " +
            "LEFT JOIN FETCH p.birthEvent be " +
            "LEFT JOIN FETCH be.startDate " +
            "LEFT JOIN FETCH ep.role r " +
            "LEFT JOIN FETCH r.participantRole")
    List<Event> findAllWithFullTimelineDetails();

    List<Event> findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(Long parentEventId);

    @Modifying
    @Query(value = "DELETE FROM events e WHERE e.parent_event_id IS NOT NULL " +
            "AND NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id)", nativeQuery = true)
    void deleteOrphanChildEvents();

    @Modifying
    @Query(value = "DELETE FROM events e WHERE e.parent_event_id IS NULL " +
            "AND e.title IS NULL AND e.description IS NULL " +
            "AND NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id) " +
            "AND NOT EXISTS (SELECT 1 FROM families f WHERE f.primary_wedding_id = e.id) " +
            "AND NOT EXISTS (SELECT 1 FROM events child WHERE child.parent_event_id = e.id) " +
            "AND NOT EXISTS (SELECT 1 FROM event_parent_links epl WHERE epl.parent_event_id = e.id) " +
            "AND NOT EXISTS (SELECT 1 FROM media_events me WHERE me.event_id = e.id)",
            nativeQuery = true)
    void deleteOrphanEvents();
}