package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.FamilyChildGedcomData;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyChildGedcomDataRepository extends JpaRepository<FamilyChildGedcomData, Long> {
}