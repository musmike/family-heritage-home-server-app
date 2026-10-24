package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Grave;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface GraveRepository extends JpaRepository<Grave, Long> {
    @Modifying
    @Query(value = "DELETE FROM graves g WHERE NOT EXISTS (SELECT 1 FROM burials b WHERE b.grave_id = g.id)", nativeQuery = true)
    void deleteOrphanGraves();
}