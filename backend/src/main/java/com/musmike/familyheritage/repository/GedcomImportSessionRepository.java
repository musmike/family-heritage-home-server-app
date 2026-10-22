package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.GedcomImportSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GedcomImportSessionRepository extends JpaRepository<GedcomImportSession, Long> {
    List<GedcomImportSession> findAllByOrderByCreatedAtDescIdDesc();
}