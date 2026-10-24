package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.EventParticipant;
import com.musmike.familyheritage.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventParticipantRepository extends JpaRepository<EventParticipant, Long> {
    List<EventParticipant> findByPerson(Person person);
}