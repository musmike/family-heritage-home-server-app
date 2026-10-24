package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.PersonName;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonNameRepository extends JpaRepository<PersonName, Long> {
    Optional<PersonName> findByPersonAndType(Person person, String type);
    List<PersonName> findByPerson(Person person);
}