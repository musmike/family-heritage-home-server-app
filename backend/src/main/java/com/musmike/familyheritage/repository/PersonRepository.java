package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonRepository extends JpaRepository<Person, Long> {
    Optional<Person> findByGedcomDataGedRefId(String gedRefId);
    Optional<Person> findByGedcomDataGedUid(String gedUid);
    Optional<Person> findByExternalIdsUidValue(String uidValue);
    List<Person> findByIsArchivedFalse();
    Optional<Person> findFirstByIsDefaultProbandTrue();
}