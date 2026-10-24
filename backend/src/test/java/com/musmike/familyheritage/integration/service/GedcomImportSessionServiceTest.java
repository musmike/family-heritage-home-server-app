package com.musmike.familyheritage.integration.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.enums.AbsentPersonAction;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import com.musmike.familyheritage.model.enums.MatchClassification;
import com.musmike.familyheritage.repository.FamilyRepository;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.service.GedcomImportService;
import com.musmike.familyheritage.service.GedcomImportSessionService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GedcomImportSessionServiceTest extends AbstractIntegrationTest {

    @Autowired private GedcomImportSessionService sessionService;
    @Autowired private GedcomImportService gedcomImportService;
    @Autowired private PersonRepository personRepository;
    @Autowired private FamilyRepository familyRepository;
    @Autowired private EntityManager entityManager;

    @Test
    @Transactional
    void shouldCompleteFullInteractiveImportWithSteppingBackFromFamiliesToIndividuals() throws Exception {
        String initialGedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1920
            0 @I2@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1980
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID uid-anna-1982
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 1982
            1 FAMS @F1@
            0 @I4@ INDI
            1 NAME Piotr /Zieliński/
            1 SEX M
            1 FAMC @F1@
            0 @F1@ FAM
            1 HUSB @I2@
            1 WIFE @I3@
            1 CHIL @I4@
            1 MARR
            2 DATE 10 JUN 2005
            2 PLAC Warszawa
            0 TRLR
            """;

        gedcomImportService.importGedcom(new ByteArrayInputStream(initialGedcom.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Person grandfatherJan = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow();
        Person grandsonJan = personRepository.findByGedcomDataGedRefId("@I2@").orElseThrow();
        Person anna = personRepository.findByGedcomDataGedRefId("@I3@").orElseThrow();
        Person piotr = personRepository.findByGedcomDataGedRefId("@I4@").orElseThrow();
        Long existingFamId = familyRepository.findAll().getFirst().getId();

        String secondGedcom = """
            0 HEAD
            1 SOUR GRAMPS
            1 CHAR UTF-8
            0 @I10@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F10@
            0 @I11@ INDI
            1 _UID uid-anna-1982
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 1982
            1 FAMS @F10@
            0 @F10@ FAM
            1 HUSB @I10@
            1 WIFE @I11@
            1 MARR
            2 DATE 10 JUN 2005
            2 PLAC Warszawa
            0 TRLR
            """;

        ImportSessionResponseDto step1 = sessionService.createSession(
                new ByteArrayInputStream(secondGedcom.getBytes(StandardCharsets.UTF_8))
        );

        assertThat(step1.getStatus()).isEqualTo(ImportSessionStatus.REVIEW_INDIVIDUALS);
        assertThat(step1.getIndividualMatches()).hasSize(2);

        IndividualMatchResultDto janMatch = step1.getIndividualMatches().stream()
                .filter(m -> m.getGedcomIndividual().getGedRefId().equals("@I10@"))
                .findFirst().orElseThrow();
        assertThat(janMatch.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(janMatch.getCandidates()).hasSize(2);

        IndividualMatchResultDto annaMatch = step1.getIndividualMatches().stream()
                .filter(m -> m.getGedcomIndividual().getGedRefId().equals("@I11@"))
                .findFirst().orElseThrow();
        assertThat(annaMatch.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(annaMatch.getSelectedTargetPersonId()).isEqualTo(anna.getId());

        ImportSessionResponseDto step2Wrong = sessionService.confirmIndividuals(
                step1.getSessionId(),
                List.of(
                        new IndividualDecisionDto("@I10@", DecisionAction.MATCH, grandfatherJan.getId()),
                        new IndividualDecisionDto("@I11@", DecisionAction.MATCH, anna.getId())
                )
        );

        assertThat(step2Wrong.getStatus()).isEqualTo(ImportSessionStatus.REVIEW_FAMILIES);
        assertThat(step2Wrong.getFamilyMatches()).hasSize(1);
        assertThat(step2Wrong.getFamilyMatches().getFirst().getClassification())
                .isEqualTo(MatchClassification.NEEDS_REVIEW);

        ImportSessionResponseDto step2Fixed = sessionService.confirmIndividuals(
                step1.getSessionId(),
                List.of(
                        new IndividualDecisionDto("@I10@", DecisionAction.MATCH, grandsonJan.getId()),
                        new IndividualDecisionDto("@I11@", DecisionAction.MATCH, anna.getId())
                )
        );

        assertThat(step2Fixed.getStatus()).isEqualTo(ImportSessionStatus.REVIEW_FAMILIES);
        FamilyMatchResultDto famMatch = step2Fixed.getFamilyMatches().getFirst();
        assertThat(famMatch.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(famMatch.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(famMatch.getSelectedTargetFamilyId()).isEqualTo(existingFamId);

        ImportSessionResponseDto step3 = sessionService.confirmFamilies(
                step1.getSessionId(),
                List.of(new FamilyDecisionDto("@F10@", DecisionAction.MATCH, existingFamId))
        );

        assertThat(step3.getStatus()).isEqualTo(ImportSessionStatus.REVIEW_SUMMARY);
        assertThat(step3.getSummaryPreview().getIndividualsToUpdate()).isEqualTo(2);
        assertThat(step3.getSummaryPreview().getIndividualsToCreate()).isZero();
        assertThat(step3.getSummaryPreview().getFamiliesToUpdate()).isEqualTo(1);
        assertThat(step3.getAbsentPeople())
                .extracting(AbsentPersonReviewDto::getPersonId)
                .containsExactlyInAnyOrder(grandfatherJan.getId(), piotr.getId());

        ImportSessionResponseDto completed = sessionService.applySession(
                step1.getSessionId(),
                List.of(
                        new AbsentPersonDecisionDto(grandfatherJan.getId(), AbsentPersonAction.ARCHIVE),
                        new AbsentPersonDecisionDto(piotr.getId(), AbsentPersonAction.DELETE)
                )
        );
        entityManager.flush();
        entityManager.clear();

        assertThat(completed.getStatus()).isEqualTo(ImportSessionStatus.COMPLETED);
        assertThat(personRepository.findById(piotr.getId())).isEmpty();
        assertThat(personRepository.findById(grandfatherJan.getId()).orElseThrow().getIsArchived()).isTrue();
        assertThat(personRepository.findById(grandsonJan.getId()).orElseThrow().getIsArchived()).isFalse();

        // Attempting to modify a COMPLETED session must throw IllegalStateException
        assertThrows(IllegalStateException.class, () ->
                sessionService.confirmIndividuals(step1.getSessionId(), List.of())
        );
    }

    @Test
    @Transactional
    void shouldValidateDecisionsAndDowngradeConflictingAutoMatches() throws Exception {
        // GIVEN - 1 person and 1 family in DB
        String initialGedcom = """
            0 HEAD
            1 SOUR TEST
            0 @I1@ INDI
            1 _UID dup-uid
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID dup-fam-uid
            1 HUSB @I1@
            0 TRLR
            """;
        gedcomImportService.importGedcom(new ByteArrayInputStream(initialGedcom.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Long existingPersonId = personRepository.findAll().getFirst().getId();
        Long existingFamId = familyRepository.findAll().getFirst().getId();

        // WHEN - Malformed GEDCOM where two individuals and two families share the same _UID
        String conflictingGedcom = """
            0 HEAD
            1 SOUR TEST
            0 @I1@ INDI
            1 _UID dup-uid
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID dup-uid
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F2@
            0 @F1@ FAM
            1 _UID dup-fam-uid
            1 HUSB @I1@
            0 @F2@ FAM
            1 _UID dup-fam-uid
            1 HUSB @I2@
            0 TRLR
            """;

        ImportSessionResponseDto session = sessionService.createSession(
                new ByteArrayInputStream(conflictingGedcom.getBytes(StandardCharsets.UTF_8))
        );

        // THEN - Conflicting auto-matches are downgraded to NEEDS_REVIEW
        assertThat(session.getIndividualMatches())
                .allMatch(m -> m.getClassification() == MatchClassification.NEEDS_REVIEW);

        // Validation: cannot apply before REVIEW_SUMMARY
        assertThrows(IllegalStateException.class, () ->
                sessionService.applySession(session.getSessionId(), List.of())
        );

        // Validation: null list, missing targetPersonId, duplicate targetPersonId, missing individual
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmIndividuals(session.getSessionId(), null)
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmIndividuals(session.getSessionId(), List.of(
                        new IndividualDecisionDto("@I1@", DecisionAction.MATCH, null)
                ))
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmIndividuals(session.getSessionId(), List.of(
                        new IndividualDecisionDto("@I1@", DecisionAction.MATCH, existingPersonId),
                        new IndividualDecisionDto("@I2@", DecisionAction.MATCH, existingPersonId)
                ))
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmIndividuals(session.getSessionId(), List.of(
                        new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null)
                ))
        );

        // Valid individual decisions -> triggers conflicting family auto-match downgrade
        ImportSessionResponseDto afterIndi = sessionService.confirmIndividuals(session.getSessionId(), List.of(
                new IndividualDecisionDto("@I1@", DecisionAction.MATCH, existingPersonId),
                new IndividualDecisionDto("@I2@", DecisionAction.CREATE_NEW, null)
        ));
        assertThat(afterIndi.getFamilyMatches())
                .allMatch(m -> m.getClassification() == MatchClassification.NEEDS_REVIEW);

        // Validation on families: null list, missing targetFamilyId, duplicate targetFamilyId, missing family
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmFamilies(session.getSessionId(), null)
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmFamilies(session.getSessionId(), List.of(
                        new FamilyDecisionDto("@F1@", DecisionAction.MATCH, null)
                ))
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmFamilies(session.getSessionId(), List.of(
                        new FamilyDecisionDto("@F1@", DecisionAction.MATCH, existingFamId),
                        new FamilyDecisionDto("@F2@", DecisionAction.MATCH, existingFamId)
                ))
        );
        assertThrows(IllegalArgumentException.class, () ->
                sessionService.confirmFamilies(session.getSessionId(), List.of(
                        new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)
                ))
        );
    }

    @Test
    @Transactional
    void shouldSearchPeopleAndFamilyCandidatesByQuery() throws Exception {
        // GIVEN
        String gedcom = """
            0 HEAD
            1 SOUR TEST
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 NAME Anna /Nowak/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 NAME Piotr /Wiśniewski/
            1 SEX M
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            0 TRLR
            """;
        gedcomImportService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // WHEN & THEN - Search people by query
        List<PersonMatchCandidateDto> matchedPeople = sessionService.searchPeopleCandidates("kowal");
        assertThat(matchedPeople).hasSize(1);
        assertThat(matchedPeople.getFirst().getGivenName()).isEqualTo("Jan");
        assertThat(matchedPeople.getFirst().getSurname()).isEqualTo("Kowalski");

        // Blank query returns all people
        assertThat(sessionService.searchPeopleCandidates("")).hasSize(3);

        // WHEN & THEN - Search families by spouse name query
        List<FamilyMatchCandidateDto> matchedFamilies = sessionService.searchFamilyCandidates("nowak");
        assertThat(matchedFamilies).hasSize(1);
        assertThat(matchedFamilies.getFirst().getWifeName()).isEqualTo("Anna Nowak");

        // Query with no match returns empty list
        assertThat(sessionService.searchFamilyCandidates("nonexistent")).isEmpty();
    }

    @Test
    @Transactional
    void shouldListImportHistoryAndRestorePreviousCompletedSessionSafely() throws Exception {
        // GIVEN - Import #1: Jan (born in Warszawa) + Anna (married in F1) + Piotr
        String gedcomV1 = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID hist-jan-uid
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1950
            2 PLAC Warszawa
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID hist-anna-uid
            1 NAME Anna /Nowak/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID hist-piotr-uid
            1 NAME Piotr /Zieliński/
            1 SEX M
            0 @F1@ FAM
            1 _UID hist-fam-1
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            2 DATE 1975
            0 TRLR
            """;

        ImportSessionResponseDto session1 = sessionService.createSession(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)),
                "import_v1.ged"
        );

        // Cannot restore an uncompleted session
        assertThrows(IllegalStateException.class, () ->
                sessionService.restoreSession(session1.getSessionId())
        );

        sessionService.confirmIndividuals(session1.getSessionId(), List.of(
                new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null),
                new IndividualDecisionDto("@I2@", DecisionAction.CREATE_NEW, null),
                new IndividualDecisionDto("@I3@", DecisionAction.CREATE_NEW, null)
        ));
        sessionService.confirmFamilies(session1.getSessionId(), List.of(
                new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)
        ));
        sessionService.applySession(session1.getSessionId(), List.of());
        entityManager.flush();
        entityManager.clear();

        Long janId = personRepository.findByExternalIdsUidValue("hist-jan-uid").orElseThrow().getId();
        Long annaId = personRepository.findByExternalIdsUidValue("hist-anna-uid").orElseThrow().getId();
        Long piotrId = personRepository.findByExternalIdsUidValue("hist-piotr-uid").orElseThrow().getId();
        Long fam1Id = familyRepository.findByExternalIdsUidValue("hist-fam-1").orElseThrow().getId();

        // Import #2: Jan's birth place changed to Kraków, Anna is archived, Piotr is deleted,
        // and a brand-new person Marek (@I99@) is added!
        String gedcomV2 = """
            0 HEAD
            1 SOUR GRAMPS
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID hist-jan-uid
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1950
            2 PLAC Kraków
            1 FAMS @F1@
            0 @I99@ INDI
            1 _UID hist-marek-uid
            1 NAME Marek /Nowy/
            1 SEX M
            0 @F1@ FAM
            1 _UID hist-fam-1
            1 HUSB @I1@
            1 MARR
            2 DATE 1975
            0 TRLR
            """;

        ImportSessionResponseDto session2 = sessionService.createSession(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)),
                "import_v2.ged"
        );
        sessionService.confirmIndividuals(session2.getSessionId(), List.of(
                new IndividualDecisionDto("@I1@", DecisionAction.MATCH, janId),
                new IndividualDecisionDto("@I99@", DecisionAction.CREATE_NEW, null)
        ));
        sessionService.confirmFamilies(session2.getSessionId(), List.of(
                new FamilyDecisionDto("@F1@", DecisionAction.MATCH, fam1Id)
        ));
        sessionService.applySession(session2.getSessionId(), List.of(
                new AbsentPersonDecisionDto(annaId, AbsentPersonAction.ARCHIVE),
                new AbsentPersonDecisionDto(piotrId, AbsentPersonAction.DELETE)
        ));
        entityManager.flush();
        entityManager.clear();

        Long marekId = personRepository.findByExternalIdsUidValue("hist-marek-uid").orElseThrow().getId();
        assertThat(personRepository.findById(annaId).orElseThrow().getIsArchived()).isTrue();
        assertThat(personRepository.findById(piotrId)).isEmpty();
        assertThat(personRepository.findById(janId).orElseThrow().getBirthEvent().getMainLocation().getName())
                .isEqualTo("Kraków");

        // Verify import history list
        List<ImportSessionHistoryItemDto> history = sessionService.getImportHistory();
        assertThat(history).hasSizeGreaterThanOrEqualTo(2);
        assertThat(history.getFirst().getFileName()).isEqualTo("import_v2.ged");

        // WHEN - User restores Session #1 ("import_v1.ged")
        ImportSessionResponseDto restored = sessionService.restoreSession(session1.getSessionId());
        entityManager.flush();
        entityManager.clear();

        // THEN
        assertThat(restored.getStatus()).isEqualTo(ImportSessionStatus.COMPLETED);

        // 1. Jan's birth place reverted to Warszawa
        Person janAfterRestore = personRepository.findById(janId).orElseThrow();
        assertThat(janAfterRestore.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa");

        // 2. Anna is un-archived (same ID!) and re-attached as Wife in F1
        Person annaAfterRestore = personRepository.findById(annaId).orElseThrow();
        assertThat(annaAfterRestore.getIsArchived()).isFalse();
        assertThat(familyRepository.findById(fam1Id).orElseThrow().getWife().getId()).isEqualTo(annaId);

        // 3. Piotr (who was physically deleted in Import #2) is recreated
        assertThat(personRepository.findByExternalIdsUidValue("hist-piotr-uid")).isPresent();

        // 4. Marek (added in Import #2) was NOT deleted — he was safely archived!
        Person marekAfterRestore = personRepository.findById(marekId).orElseThrow();
        assertThat(marekAfterRestore.getIsArchived()).isTrue();
        assertThat(marekAfterRestore.getGedcomData()).isNull();
    }

    @Test
    @Transactional
    void shouldManageSingleActiveSessionAndAllowCancellingIt() throws Exception {
        String gedcom = """
            0 HEAD
            1 SOUR TEST
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            0 TRLR
            """;

        assertThat(sessionService.getActiveSession()).isEmpty();

        ImportSessionResponseDto active = sessionService.createSession(
                new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)),
                "first.ged"
        );

        // Active session is returned by getActiveSession() and NOT in completed history yet
        assertThat(sessionService.getActiveSession()).isPresent();
        assertThat(sessionService.getActiveSession().get().getSessionId()).isEqualTo(active.getSessionId());
        assertThat(sessionService.getImportHistory()).isEmpty();

        // Starting a second session while one is active must fail
        assertThrows(IllegalStateException.class, () ->
                sessionService.createSession(
                        new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)),
                        "second.ged"
                )
        );

        // Cancelling the active session removes it and allows starting a new one
        sessionService.cancelSession(active.getSessionId());
        assertThat(sessionService.getActiveSession()).isEmpty();

        ImportSessionResponseDto newSession = sessionService.createSession(
                new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)),
                "second.ged"
        );
        assertThat(newSession.getFileName()).isEqualTo("second.ged");
    }
}