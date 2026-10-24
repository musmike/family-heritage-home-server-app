package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.FamilyChild;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyChildRepository extends JpaRepository<FamilyChild, Long> {
}