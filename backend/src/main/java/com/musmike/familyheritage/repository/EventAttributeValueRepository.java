package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Event;
import com.musmike.familyheritage.model.EventAttributeValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface EventAttributeValueRepository extends JpaRepository<EventAttributeValue, Long> {
    List<EventAttributeValue> findByEvent(Event event);

    @Query("SELECT eav FROM EventAttributeValue eav " +
            "JOIN FETCH eav.attributeDictionaryValue adv " +
            "JOIN FETCH adv.attributeDefinition")
    List<EventAttributeValue> findAllWithDefinitions();

    void deleteByEvent(Event event);
}