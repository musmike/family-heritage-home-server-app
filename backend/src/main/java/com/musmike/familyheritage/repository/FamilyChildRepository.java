package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.FamilyChild;
import com.musmike.familyheritage.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FamilyChildRepository extends JpaRepository<FamilyChild, Long> {
    List<FamilyChild> findByChild(Person child);
}