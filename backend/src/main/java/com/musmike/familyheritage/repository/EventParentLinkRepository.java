package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.EventParentLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventParentLinkRepository extends JpaRepository<EventParentLink, Long> {
    List<EventParentLink> findByChildEventIdOrderBySortOrderAscIdAsc(Long childEventId);
    List<EventParentLink> findByParentEventIdOrderBySortOrderAscIdAsc(Long parentEventId);
}