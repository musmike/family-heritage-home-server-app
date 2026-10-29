package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Cemetery;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CemeteryRepository extends JpaRepository<Cemetery, Long> {
    List<Cemetery> findAllByOrderByNameAscIdAsc();
}
