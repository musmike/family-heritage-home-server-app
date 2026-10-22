package com.musmike.familyheritage.integration.repository;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.GedcomImportSession;
import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import com.musmike.familyheritage.repository.GedcomImportSessionRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class GedcomImportSessionRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private GedcomImportSessionRepository sessionRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    @Transactional
    void shouldSaveAndUpdateImportSession() {
        // GIVEN
        GedcomImportSession session = new GedcomImportSession();
        session.setStatus(ImportSessionStatus.REVIEW_INDIVIDUALS);
        session.setSourceSystem("MYHERITAGE");
        session.setSessionData("{\"individuals\":[]}");

        // WHEN
        GedcomImportSession saved = sessionRepository.saveAndFlush(session);
        entityManager.clear();

        // THEN
        Optional<GedcomImportSession> found = sessionRepository.findById(saved.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getStatus()).isEqualTo(ImportSessionStatus.REVIEW_INDIVIDUALS);
        assertThat(found.get().getSourceSystem()).isEqualTo("MYHERITAGE");
        assertThat(found.get().getSessionData()).isEqualTo("{\"individuals\":[]}");
        assertThat(found.get().getCreatedAt()).isNotNull();
        assertThat(found.get().getUpdatedAt()).isNotNull();
    }
}