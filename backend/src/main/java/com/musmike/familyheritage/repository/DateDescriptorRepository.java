package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.DateDescriptor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface DateDescriptorRepository extends JpaRepository<DateDescriptor, Long> {
    @Modifying
    @Query(value = "DELETE FROM date_descriptors dd " +
            "WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.start_date_id = dd.id OR e.end_date_id = dd.id)",
            nativeQuery = true)
    void deleteOrphanDateDescriptors();
}