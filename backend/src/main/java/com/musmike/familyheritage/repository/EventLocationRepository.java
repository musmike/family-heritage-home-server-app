package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Event;
import com.musmike.familyheritage.model.EventLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface EventLocationRepository extends JpaRepository<EventLocation, Long> {
    Optional<EventLocation> findByEvent(Event event);
    void deleteByEvent(Event event);
}