package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface LocationRepository extends JpaRepository<Location, Long> {
    Optional<Location> findByName(String name);

    // DODAJ TO
    @Modifying
    @Query(value = "DELETE FROM locations l " +
            "WHERE NOT EXISTS (SELECT 1 FROM event_locations el WHERE el.location_id = l.id) " +
            "AND NOT EXISTS (SELECT 1 FROM events e WHERE e.main_location_id = l.id) " +
            "AND NOT EXISTS (SELECT 1 FROM graves g WHERE g.cemetery_location_id = l.id)", nativeQuery = true)
    void deleteOrphanLocations();
}