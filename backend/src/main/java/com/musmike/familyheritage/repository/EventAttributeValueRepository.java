package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Event;
import com.musmike.familyheritage.model.EventAttributeValue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventAttributeValueRepository extends JpaRepository<EventAttributeValue, Long> {
    List<EventAttributeValue> findByEvent(Event event);
    void deleteByEvent(Event event);
}