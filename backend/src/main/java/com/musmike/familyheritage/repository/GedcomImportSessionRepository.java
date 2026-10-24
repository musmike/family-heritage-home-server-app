package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.GedcomImportSession;
import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GedcomImportSessionRepository extends JpaRepository<GedcomImportSession, Long> {
    List<GedcomImportSession> findByStatusOrderByCreatedAtDescIdDesc(ImportSessionStatus status);
    Optional<GedcomImportSession> findFirstByStatusNotOrderByCreatedAtDesc(ImportSessionStatus status);
}