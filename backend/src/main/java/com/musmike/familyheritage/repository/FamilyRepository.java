package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Family;
import com.musmike.familyheritage.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FamilyRepository extends JpaRepository<Family, Long> {
    Optional<Family> findByGedcomDataGedRefId(String gedRefId);
    Optional<Family> findByGedcomDataGedUid(String gedUid);
    Optional<Family> findByExternalIdsUidValue(String uidValue);
    List<Family> findByHusbandOrWife(Person husband, Person wife);
}