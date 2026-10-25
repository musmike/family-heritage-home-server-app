package com.musmike.familyheritage.service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.AbsentPersonAction;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import com.musmike.familyheritage.model.enums.MatchClassification;
import com.musmike.familyheritage.repository.FamilyRepository;
import com.musmike.familyheritage.repository.GedcomImportSessionRepository;
import com.musmike.familyheritage.repository.PersonRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GedcomImportSessionService {

    private final GedcomImportSessionRepository sessionRepository;
    private final PersonRepository personRepository;
    private final FamilyRepository familyRepository;
    private final GedcomFileExtractor fileExtractor;
    private final GedcomPersonMatcher personMatcher;
    private final GedcomFamilyMatcher familyMatcher;
    private final PersonAndFamilyMatchingStrategy matchingStrategy;
    private final GedcomImportApplier importApplier;
    private final ObjectMapper objectMapper;

    @Transactional
    public ImportSessionResponseDto createSession(InputStream inputStream) throws Exception {
        return createSession(inputStream, null);
    }

    @Transactional
    public ImportSessionResponseDto createSession(InputStream inputStream, String fileName) throws Exception {
        sessionRepository.findFirstByStatusNotOrderByCreatedAtDesc(ImportSessionStatus.COMPLETED)
                .ifPresent(active -> {
                    throw new IllegalStateException(
                            "An active import session is already in progress (ID: " + active.getId()
                                    + "). Please complete or cancel it first."
                    );
                });

        ParsedGedcomFileDto parsedFile = fileExtractor.extract(inputStream);
        List<DbPersonCandidateContext> dbCandidates = buildDbPersonCandidateContexts(parsedFile.getSourceSystem());

        List<IndividualMatchResultDto> individualMatches = new ArrayList<>();
        for (ParsedGedcomIndividualDto gedIndi : parsedFile.getIndividuals()) {
            individualMatches.add(personMatcher.matchIndividual(gedIndi, dbCandidates));
        }

        resolveConflictingAutoMatchesForIndividuals(individualMatches);

        ImportSessionStateDto state = ImportSessionStateDto.builder()
                .parsedFile(parsedFile)
                .individualMatches(individualMatches)
                .build();

        GedcomImportSession session = new GedcomImportSession();
        session.setFileName(fileName);
        session.setStatus(ImportSessionStatus.REVIEW_INDIVIDUALS);
        session.setSourceSystem(parsedFile.getSourceSystem());
        session.setSessionData(serializeState(state));
        session = sessionRepository.save(session);

        return toResponseDto(session, state);
    }

    @Transactional
    public Optional<ImportSessionResponseDto> getActiveSession() {
        return sessionRepository.findFirstByStatusNotOrderByCreatedAtDesc(ImportSessionStatus.COMPLETED)
                .map(session -> toResponseDto(session, deserializeState(session.getSessionData())));
    }

    @Transactional
    public void cancelSession(Long sessionId) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        if (session.getStatus() == ImportSessionStatus.COMPLETED) {
            throw new IllegalStateException("Cannot cancel a COMPLETED import session.");
        }
        sessionRepository.delete(session);
    }

    @Transactional
    public List<ImportSessionHistoryItemDto> getImportHistory() {
        return sessionRepository.findByStatusOrderByCreatedAtDescIdDesc(ImportSessionStatus.COMPLETED).stream()
                .map(session -> {
                    ImportSessionStateDto state = deserializeState(session.getSessionData());
                    return ImportSessionHistoryItemDto.builder()
                            .sessionId(session.getId())
                            .fileName(session.getFileName())
                            .status(session.getStatus())
                            .sourceSystem(session.getSourceSystem())
                            .createdAt(session.getCreatedAt())
                            .updatedAt(session.getUpdatedAt())
                            .summaryPreview(state.getSummaryPreview())
                            .build();
                })
                .toList();
    }

    @Transactional
    public ImportSessionResponseDto getSession(Long sessionId) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        ImportSessionStateDto state = deserializeState(session.getSessionData());
        return toResponseDto(session, state);
    }

    @Transactional
    public ImportSessionResponseDto confirmIndividuals(Long sessionId, List<IndividualDecisionDto> decisions) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        ensureNotCompleted(session);

        ImportSessionStateDto state = deserializeState(session.getSessionData());
        Map<String, IndividualDecisionDto> decisionMap = validateAndMapIndividualDecisions(
                state.getParsedFile().getIndividuals(), decisions
        );

        for (IndividualMatchResultDto match : state.getIndividualMatches()) {
            IndividualDecisionDto d = decisionMap.get(match.getGedcomIndividual().getGedRefId());
            match.setSelectedAction(d.getAction());
            match.setSelectedTargetPersonId(d.getAction() == DecisionAction.MATCH ? d.getTargetPersonId() : null);
        }

        List<DbFamilyCandidateContext> dbFamilies = buildDbFamilyCandidateContexts(
                state.getParsedFile().getSourceSystem()
        );
        List<FamilyMatchResultDto> newFamilyMatches = new ArrayList<>();
        for (ParsedGedcomFamilyDto gedFam : state.getParsedFile().getFamilies()) {
            newFamilyMatches.add(familyMatcher.matchFamily(gedFam, decisionMap, dbFamilies));
        }
        resolveConflictingAutoMatchesForFamilies(newFamilyMatches);

        state.setFamilyMatches(newFamilyMatches);
        session.setStatus(ImportSessionStatus.REVIEW_FAMILIES);
        session.setUpdatedAt(LocalDateTime.now());
        session.setSessionData(serializeState(state));
        session = sessionRepository.save(session);

        return toResponseDto(session, state);
    }

    @Transactional
    public ImportSessionResponseDto confirmFamilies(Long sessionId, List<FamilyDecisionDto> decisions) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        ensureNotCompleted(session);

        ImportSessionStateDto state = deserializeState(session.getSessionData());
        Map<String, FamilyDecisionDto> decisionMap = validateAndMapFamilyDecisions(
                state.getParsedFile().getFamilies(), decisions
        );

        for (FamilyMatchResultDto match : state.getFamilyMatches()) {
            FamilyDecisionDto d = decisionMap.get(match.getGedcomFamily().getGedRefId());
            match.setSelectedAction(d.getAction());
            match.setSelectedTargetFamilyId(d.getAction() == DecisionAction.MATCH ? d.getTargetFamilyId() : null);
        }

        Set<Long> matchedPersonIds = state.getIndividualMatches().stream()
                .filter(m -> m.getSelectedAction() == DecisionAction.MATCH && m.getSelectedTargetPersonId() != null)
                .map(IndividualMatchResultDto::getSelectedTargetPersonId)
                .collect(Collectors.toSet());

        Map<Long, AbsentPersonAction> previousAbsentChoices = state.getAbsentPeople() == null ? Map.of() :
                state.getAbsentPeople().stream()
                        .filter(a -> a.getSelectedAction() != null)
                        .collect(Collectors.toMap(AbsentPersonReviewDto::getPersonId, AbsentPersonReviewDto::getSelectedAction));

        List<AbsentPersonReviewDto> absentPeople = personRepository.findByIsArchivedFalse().stream()
                .filter(p -> !matchedPersonIds.contains(p.getId()))
                .map(p -> {
                    List<String> blockReasons = importApplier.getPersonDeletionBlockReasons(p);
                    boolean canDelete = blockReasons.isEmpty();
                    AbsentPersonAction chosen = canDelete
                            ? previousAbsentChoices.getOrDefault(p.getId(), AbsentPersonAction.ARCHIVE)
                            : AbsentPersonAction.ARCHIVE;
                    return AbsentPersonReviewDto.builder()
                            .personId(p.getId())
                            .givenName(p.getCachedGivenName())
                            .surname(p.getCachedSurname())
                            .birthYear(extractEventYear(p.getBirthEvent()))
                            .deathYear(extractEventYear(p.getDeathEvent()))
                            .selectedAction(chosen)
                            .canBeDeleted(canDelete)
                            .deletionBlockReasons(blockReasons)
                            .build();
                })
                .toList();

        state.setAbsentPeople(new ArrayList<>(absentPeople));
        state.setSummaryPreview(buildSummaryPreview(state, absentPeople.size()));

        session.setStatus(ImportSessionStatus.REVIEW_SUMMARY);
        session.setUpdatedAt(LocalDateTime.now());
        session.setSessionData(serializeState(state));
        session = sessionRepository.save(session);

        return toResponseDto(session, state);
    }

    @Transactional
    public ImportSessionResponseDto applySession(
            Long sessionId,
            List<AbsentPersonDecisionDto> absentPersonDecisions
    ) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        ensureNotCompleted(session);
        if (session.getStatus() != ImportSessionStatus.REVIEW_SUMMARY) {
            throw new IllegalStateException("Session must be in REVIEW_SUMMARY status before applying.");
        }

        ImportSessionStateDto state = deserializeState(session.getSessionData());

        Map<String, IndividualDecisionDto> indiDecisions = state.getIndividualMatches().stream()
                .collect(Collectors.toMap(
                        m -> m.getGedcomIndividual().getGedRefId(),
                        m -> new IndividualDecisionDto(
                                m.getGedcomIndividual().getGedRefId(),
                                m.getSelectedAction(),
                                m.getSelectedTargetPersonId()
                        )
                ));

        Map<String, FamilyDecisionDto> famDecisions = state.getFamilyMatches().stream()
                .collect(Collectors.toMap(
                        m -> m.getGedcomFamily().getGedRefId(),
                        m -> new FamilyDecisionDto(
                                m.getGedcomFamily().getGedRefId(),
                                m.getSelectedAction(),
                                m.getSelectedTargetFamilyId()
                        )
                ));

        Map<Long, AbsentPersonAction> absentMap = new HashMap<>();
        if (state.getAbsentPeople() != null) {
            for (AbsentPersonReviewDto a : state.getAbsentPeople()) {
                absentMap.put(a.getPersonId(), a.getSelectedAction() != null ? a.getSelectedAction() : AbsentPersonAction.ARCHIVE);
            }
        }
        if (absentPersonDecisions != null) {
            for (AbsentPersonDecisionDto d : absentPersonDecisions) {
                if (d.getPersonId() != null && d.getAction() != null) {
                    absentMap.put(d.getPersonId(), d.getAction());
                }
            }
        }

        GedcomImportApplier.AppliedImportResult appliedResult =
                importApplier.applyImport(state.getParsedFile(), indiDecisions, famDecisions, absentMap);

        state.setResolvedPersonIds(appliedResult.resolvedPersonIds());
        state.setResolvedFamilyIds(appliedResult.resolvedFamilyIds());

        session.setStatus(ImportSessionStatus.COMPLETED);
        session.setUpdatedAt(LocalDateTime.now());
        session.setSessionData(serializeState(state));
        session = sessionRepository.save(session);

        return toResponseDto(session, state);
    }

    @Transactional
    public ImportSessionResponseDto restoreSession(Long sessionId) {
        GedcomImportSession session = findSessionOrThrow(sessionId);
        if (session.getStatus() != ImportSessionStatus.COMPLETED) {
            throw new IllegalStateException("Only COMPLETED import sessions can be restored.");
        }

        ImportSessionStateDto state = deserializeState(session.getSessionData());
        ParsedGedcomFileDto parsedFile = state.getParsedFile();

        Map<String, IndividualDecisionDto> indiDecisions = new HashMap<>();
        Set<Long> matchedPersonIds = new HashSet<>();

        for (ParsedGedcomIndividualDto indi : parsedFile.getIndividuals()) {
            Long recordedPersonId = state.getResolvedPersonIds() != null
                    ? state.getResolvedPersonIds().get(indi.getGedRefId()) : null;

            Long targetPersonId = null;
            if (recordedPersonId != null && personRepository.existsById(recordedPersonId)) {
                targetPersonId = recordedPersonId;
            } else {
                targetPersonId = matchingStrategy.findExistingPerson(indi)
                        .map(Person::getId)
                        .orElse(null);
            }

            if (targetPersonId != null && matchedPersonIds.add(targetPersonId)) {
                indiDecisions.put(indi.getGedRefId(),
                        new IndividualDecisionDto(indi.getGedRefId(), DecisionAction.MATCH, targetPersonId));
            } else {
                indiDecisions.put(indi.getGedRefId(),
                        new IndividualDecisionDto(indi.getGedRefId(), DecisionAction.CREATE_NEW, null));
            }
        }

        Map<String, FamilyDecisionDto> famDecisions = new HashMap<>();
        Set<Long> matchedFamilyIds = new HashSet<>();

        for (ParsedGedcomFamilyDto fam : parsedFile.getFamilies()) {
            Long recordedFamilyId = state.getResolvedFamilyIds() != null
                    ? state.getResolvedFamilyIds().get(fam.getGedRefId()) : null;

            Long targetFamilyId = null;
            if (recordedFamilyId != null && familyRepository.existsById(recordedFamilyId)) {
                targetFamilyId = recordedFamilyId;
            } else {
                targetFamilyId = matchingStrategy.findExistingFamily(fam)
                        .map(Family::getId)
                        .orElse(null);
            }

            if (targetFamilyId != null && matchedFamilyIds.add(targetFamilyId)) {
                famDecisions.put(fam.getGedRefId(),
                        new FamilyDecisionDto(fam.getGedRefId(), DecisionAction.MATCH, targetFamilyId));
            } else {
                famDecisions.put(fam.getGedRefId(),
                        new FamilyDecisionDto(fam.getGedRefId(), DecisionAction.CREATE_NEW, null));
            }
        }

        // Archive all absent people during restore so no newer people or their attachments are lost
        Map<Long, AbsentPersonAction> safeArchiveAllAbsent = new HashMap<>();
        for (Person p : personRepository.findAll()) {
            if (!matchedPersonIds.contains(p.getId())) {
                safeArchiveAllAbsent.put(p.getId(), AbsentPersonAction.ARCHIVE);
            }
        }

        GedcomImportApplier.AppliedImportResult appliedResult =
                importApplier.applyImport(parsedFile, indiDecisions, famDecisions, safeArchiveAllAbsent);

        state.setResolvedPersonIds(appliedResult.resolvedPersonIds());
        state.setResolvedFamilyIds(appliedResult.resolvedFamilyIds());
        session.setUpdatedAt(LocalDateTime.now());
        session.setSessionData(serializeState(state));
        session = sessionRepository.save(session);

        return toResponseDto(session, state);
    }

    @Transactional
    public List<PersonMatchCandidateDto> searchPeopleCandidates(String query) {
        String normalizedQuery = query != null ? query.trim().toLowerCase() : "";
        return buildDbPersonCandidateContexts(null).stream()
                .filter(c -> {
                    if (normalizedQuery.isEmpty()) return true;
                    String fullName = ((c.getGivenName() != null ? c.getGivenName() : "") + " "
                            + (c.getSurname() != null ? c.getSurname() : "")).toLowerCase();
                    return fullName.contains(normalizedQuery);
                })
                .map(c -> PersonMatchCandidateDto.builder()
                        .personId(c.getPersonId())
                        .givenName(c.getGivenName())
                        .surname(c.getSurname())
                        .sex(c.getSex() != null ? c.getSex().name() : null)
                        .birthYear(c.getBirthYear())
                        .birthDate(formatCandidateDate(c.getBirthYear(), c.getBirthMonth(), c.getBirthDay()))
                        .birthPlace(c.getBirthPlace())
                        .deathYear(c.getDeathYear())
                        .deathDate(formatCandidateDate(c.getDeathYear(), c.getDeathMonth(), c.getDeathDay()))
                        .deathPlace(c.getDeathPlace())
                        .parentGivenNames(c.getParentGivenNames())
                        .spouseGivenNames(c.getSpouseGivenNames())
                        .archived(c.isArchived())
                        .confidenceScore(0)
                        .matchReasons(List.of("Manual selection"))
                        .build())
                .toList();
    }

    @Transactional
    public List<FamilyMatchCandidateDto> searchFamilyCandidates(String query) {
        String normalizedQuery = query != null ? query.trim().toLowerCase() : "";
        return buildDbFamilyCandidateContexts(null).stream()
                .filter(f -> {
                    if (normalizedQuery.isEmpty()) return true;
                    String husb = f.getHusbandName() != null ? f.getHusbandName().toLowerCase() : "";
                    String wife = f.getWifeName() != null ? f.getWifeName().toLowerCase() : "";
                    return husb.contains(normalizedQuery) || wife.contains(normalizedQuery);
                })
                .map(f -> FamilyMatchCandidateDto.builder()
                        .familyId(f.getFamilyId())
                        .husbandName(f.getHusbandName())
                        .wifeName(f.getWifeName())
                        .weddingYear(f.getWeddingYear())
                        .confidenceScore(0)
                        .matchReasons(List.of("Manual selection"))
                        .build())
                .toList();
    }

    private String formatCandidateDate(Integer year, Integer month, Integer day) {
        if (year == null) return null;
        if (month != null && day != null) {
            return String.format("%02d.%02d.%d", day, month, year);
        }
        if (month != null) {
            return String.format("%02d.%d", month, year);
        }
        return String.valueOf(year);
    }

    private List<DbPersonCandidateContext> buildDbPersonCandidateContexts(String sourceSystem) {
        List<Person> allPeople = personRepository.findAll();
        List<Family> allFamilies = familyRepository.findAll();

        Map<Long, Set<String>> parentNamesByPerson = new HashMap<>();
        Map<Long, Set<String>> spouseNamesByPerson = new HashMap<>();

        for (Family fam : allFamilies) {
            String husbGiven = fam.getHusband() != null ? fam.getHusband().getCachedGivenName() : null;
            String wifeGiven = fam.getWife() != null ? fam.getWife().getCachedGivenName() : null;

            if (fam.getHusband() != null && wifeGiven != null && !wifeGiven.isBlank()) {
                spouseNamesByPerson.computeIfAbsent(fam.getHusband().getId(), k -> new HashSet<>()).add(wifeGiven);
            }
            if (fam.getWife() != null && husbGiven != null && !husbGiven.isBlank()) {
                spouseNamesByPerson.computeIfAbsent(fam.getWife().getId(), k -> new HashSet<>()).add(husbGiven);
            }

            for (FamilyChild fc : fam.getChildren()) {
                Long childId = fc.getChild().getId();
                if (husbGiven != null && !husbGiven.isBlank()) {
                    parentNamesByPerson.computeIfAbsent(childId, k -> new HashSet<>()).add(husbGiven);
                }
                if (wifeGiven != null && !wifeGiven.isBlank()) {
                    parentNamesByPerson.computeIfAbsent(childId, k -> new HashSet<>()).add(wifeGiven);
                }
            }
        }

        List<DbPersonCandidateContext> result = new ArrayList<>();
        for (Person p : allPeople) {
            Set<String> uids = new HashSet<>();
            for (PersonExternalId ext : p.getExternalIds()) {
                if (sourceSystem != null && sourceSystem.equalsIgnoreCase(ext.getSourceSystem())) {
                    uids.add(ext.getUidValue());
                }
            }

            DateDescriptor birthDd = p.getBirthEvent() != null ? p.getBirthEvent().getStartDate() : null;
            String birthPlace = p.getBirthEvent() != null && p.getBirthEvent().getMainLocation() != null
                    ? p.getBirthEvent().getMainLocation().getName() : null;

            DateDescriptor deathDd = p.getDeathEvent() != null ? p.getDeathEvent().getStartDate() : null;
            String deathPlace = p.getDeathEvent() != null && p.getDeathEvent().getMainLocation() != null
                    ? p.getDeathEvent().getMainLocation().getName() : null;

            result.add(DbPersonCandidateContext.builder()
                    .personId(p.getId())
                    .givenName(p.getCachedGivenName())
                    .surname(p.getCachedSurname())
                    .sex(p.getSex())
                    .archived(Boolean.TRUE.equals(p.getIsArchived()))
                    .lastGedRefId(p.getGedcomData() != null ? p.getGedcomData().getGedRefId() : null)
                    .externalUids(uids)
                    .birthYear(birthDd != null ? birthDd.getStartYear() : null)
                    .birthMonth(birthDd != null ? birthDd.getStartMonth() : null)
                    .birthDay(birthDd != null ? birthDd.getStartDay() : null)
                    .birthPlace(birthPlace)
                    .deathYear(deathDd != null ? deathDd.getStartYear() : null)
                    .deathMonth(deathDd != null ? deathDd.getStartMonth() : null)
                    .deathDay(deathDd != null ? deathDd.getStartDay() : null)
                    .deathPlace(deathPlace)
                    .parentGivenNames(parentNamesByPerson.getOrDefault(p.getId(), Set.of()))
                    .spouseGivenNames(spouseNamesByPerson.getOrDefault(p.getId(), Set.of()))
                    .build());
        }
        return result;
    }

    private List<DbFamilyCandidateContext> buildDbFamilyCandidateContexts(String sourceSystem) {
        List<Family> allFamilies = familyRepository.findAll();
        List<DbFamilyCandidateContext> result = new ArrayList<>();

        for (Family fam : allFamilies) {
            Set<String> uids = new HashSet<>();
            for (FamilyExternalId ext : fam.getExternalIds()) {
                if (sourceSystem != null && sourceSystem.equalsIgnoreCase(ext.getSourceSystem())) {
                    uids.add(ext.getUidValue());
                }
            }

            Set<Long> childIds = fam.getChildren().stream()
                    .map(fc -> fc.getChild().getId())
                    .collect(Collectors.toSet());

            result.add(DbFamilyCandidateContext.builder()
                    .familyId(fam.getId())
                    .husbandPersonId(fam.getHusband() != null ? fam.getHusband().getId() : null)
                    .husbandName(formatPersonName(fam.getHusband()))
                    .wifePersonId(fam.getWife() != null ? fam.getWife().getId() : null)
                    .wifeName(formatPersonName(fam.getWife()))
                    .weddingYear(extractEventYear(fam.getPrimaryWedding()))
                    .lastGedRefId(fam.getGedcomData() != null ? fam.getGedcomData().getGedRefId() : null)
                    .externalUids(uids)
                    .childPersonIds(childIds)
                    .build());
        }
        return result;
    }

    private void resolveConflictingAutoMatchesForIndividuals(List<IndividualMatchResultDto> matches) {
        Map<Long, List<IndividualMatchResultDto>> byTarget = matches.stream()
                .filter(m -> m.getSelectedAction() == DecisionAction.MATCH && m.getSelectedTargetPersonId() != null)
                .collect(Collectors.groupingBy(IndividualMatchResultDto::getSelectedTargetPersonId));

        for (List<IndividualMatchResultDto> group : byTarget.values()) {
            if (group.size() > 1) {
                for (IndividualMatchResultDto m : group) {
                    m.setClassification(MatchClassification.NEEDS_REVIEW);
                    m.setSelectedAction(null);
                    m.setSelectedTargetPersonId(null);
                }
            }
        }
    }

    private void resolveConflictingAutoMatchesForFamilies(List<FamilyMatchResultDto> matches) {
        Map<Long, List<FamilyMatchResultDto>> byTarget = matches.stream()
                .filter(m -> m.getSelectedAction() == DecisionAction.MATCH && m.getSelectedTargetFamilyId() != null)
                .collect(Collectors.groupingBy(FamilyMatchResultDto::getSelectedTargetFamilyId));

        for (List<FamilyMatchResultDto> group : byTarget.values()) {
            if (group.size() > 1) {
                for (FamilyMatchResultDto m : group) {
                    m.setClassification(MatchClassification.NEEDS_REVIEW);
                    m.setSelectedAction(null);
                    m.setSelectedTargetFamilyId(null);
                }
            }
        }
    }

    private Map<String, IndividualDecisionDto> validateAndMapIndividualDecisions(
            List<ParsedGedcomIndividualDto> individuals,
            List<IndividualDecisionDto> decisions
    ) {
        if (decisions == null) {
            throw new IllegalArgumentException("Individual decisions list cannot be null.");
        }
        Map<String, IndividualDecisionDto> map = new HashMap<>();
        Set<Long> usedTargetIds = new HashSet<>();

        for (IndividualDecisionDto d : decisions) {
            if (d.getGedRefId() == null || d.getAction() == null) {
                throw new IllegalArgumentException("Each decision must specify gedRefId and action.");
            }
            if (d.getAction() == DecisionAction.MATCH) {
                if (d.getTargetPersonId() == null) {
                    throw new IllegalArgumentException("MATCH action requires targetPersonId for " + d.getGedRefId());
                }
                if (!usedTargetIds.add(d.getTargetPersonId())) {
                    throw new IllegalArgumentException("Duplicate targetPersonId in decisions: " + d.getTargetPersonId());
                }
            }
            map.put(d.getGedRefId(), d);
        }

        for (ParsedGedcomIndividualDto indi : individuals) {
            if (!map.containsKey(indi.getGedRefId())) {
                throw new IllegalArgumentException("Missing decision for individual: " + indi.getGedRefId());
            }
        }
        return map;
    }

    private Map<String, FamilyDecisionDto> validateAndMapFamilyDecisions(
            List<ParsedGedcomFamilyDto> families,
            List<FamilyDecisionDto> decisions
    ) {
        if (decisions == null) {
            throw new IllegalArgumentException("Family decisions list cannot be null.");
        }
        Map<String, FamilyDecisionDto> map = new HashMap<>();
        Set<Long> usedTargetIds = new HashSet<>();

        for (FamilyDecisionDto d : decisions) {
            if (d.getGedRefId() == null || d.getAction() == null) {
                throw new IllegalArgumentException("Each family decision must specify gedRefId and action.");
            }
            if (d.getAction() == DecisionAction.MATCH) {
                if (d.getTargetFamilyId() == null) {
                    throw new IllegalArgumentException("MATCH action requires targetFamilyId for " + d.getGedRefId());
                }
                if (!usedTargetIds.add(d.getTargetFamilyId())) {
                    throw new IllegalArgumentException("Duplicate targetFamilyId in decisions: " + d.getTargetFamilyId());
                }
            }
            map.put(d.getGedRefId(), d);
        }

        for (ParsedGedcomFamilyDto fam : families) {
            if (!map.containsKey(fam.getGedRefId())) {
                throw new IllegalArgumentException("Missing decision for family: " + fam.getGedRefId());
            }
        }
        return map;
    }

    private ImportSummaryPreviewDto buildSummaryPreview(ImportSessionStateDto state, int absentPersonsCount) {
        int indiCreate = 0;
        int indiUpdate = 0;
        int indiUnchanged = 0;

        Map<String, Long> previewResolvedPersonIds = new HashMap<>();

        for (IndividualMatchResultDto m : state.getIndividualMatches()) {
            if (m.getSelectedAction() == DecisionAction.CREATE_NEW) {
                indiCreate++;
            } else if (m.getSelectedAction() == DecisionAction.MATCH && m.getSelectedTargetPersonId() != null) {
                previewResolvedPersonIds.put(m.getGedcomIndividual().getGedRefId(), m.getSelectedTargetPersonId());
                Person existing = personRepository.findById(m.getSelectedTargetPersonId()).orElse(null);
                if (existing == null || hasIndividualChanged(m.getGedcomIndividual(), existing)) {
                    indiUpdate++;
                } else {
                    indiUnchanged++;
                }
            }
        }

        int famCreate = 0;
        int famUpdate = 0;
        int famUnchanged = 0;

        for (FamilyMatchResultDto m : state.getFamilyMatches()) {
            if (m.getSelectedAction() == DecisionAction.CREATE_NEW) {
                famCreate++;
            } else if (m.getSelectedAction() == DecisionAction.MATCH && m.getSelectedTargetFamilyId() != null) {
                Family existing = familyRepository.findById(m.getSelectedTargetFamilyId()).orElse(null);
                if (existing == null || hasFamilyChanged(m.getGedcomFamily(), existing, previewResolvedPersonIds)) {
                    famUpdate++;
                } else {
                    famUnchanged++;
                }
            }
        }

        long totalDbFamilies = familyRepository.count();
        int matchedFamiliesCount = famUpdate + famUnchanged;
        int famDelete = Math.max(0, (int) totalDbFamilies - matchedFamiliesCount);

        return ImportSummaryPreviewDto.builder()
                .individualsToCreate(indiCreate)
                .individualsToUpdate(indiUpdate)
                .individualsUnchanged(indiUnchanged)
                .familiesToCreate(famCreate)
                .familiesToUpdate(famUpdate)
                .familiesUnchanged(famUnchanged)
                .familiesToDelete(famDelete)
                .absentPersonsCount(absentPersonsCount)
                .build();
    }

    private boolean hasIndividualChanged(ParsedGedcomIndividualDto gedIndi, Person existing) {
        if (Boolean.TRUE.equals(existing.getIsArchived())) {
            return true;
        }
        PersonGedcomData raw = existing.getGedcomData();
        if (raw == null) {
            return true;
        }
        if (gedIndi.getGedUid() != null && !gedIndi.getGedUid().isBlank()) {
            boolean uidKnown = existing.getExternalIds().stream()
                    .anyMatch(ext -> gedIndi.getGedUid().equals(ext.getUidValue()));
            if (!uidKnown) {
                return true;
            }
        }
        return !Objects.equals(nullToEmpty(gedIndi.getGivenName()), nullToEmpty(raw.getRawGivenName()))
                || !Objects.equals(nullToEmpty(gedIndi.getSurname()), nullToEmpty(raw.getRawSurname()))
                || !Objects.equals(gedIndi.getSex(), raw.getRawSex())
                || gedIndi.isDeathIndicated() != Boolean.TRUE.equals(raw.getRawDeathIndicated())
                || !Objects.equals(gedIndi.getBirthDate(), raw.getRawBirthDate())
                || !Objects.equals(gedIndi.getBirthPlace(), raw.getRawBirthPlace())
                || !Objects.equals(gedIndi.getDeathDate(), raw.getRawDeathDate())
                || !Objects.equals(gedIndi.getDeathPlace(), raw.getRawDeathPlace())
                || !Objects.equals(gedIndi.getCauseOfDeath(), raw.getRawCauseOfDeath())
                || !Objects.equals(gedIndi.getBurialPlace(), raw.getRawBurialPlace());
    }

    private boolean hasFamilyChanged(
            ParsedGedcomFamilyDto gedFam,
            Family existing,
            Map<String, Long> resolvedPersonIds
    ) {
        FamilyGedcomData raw = existing.getGedcomData();
        if (raw == null) {
            return true;
        }
        if (gedFam.getGedUid() != null && !gedFam.getGedUid().isBlank()) {
            boolean uidKnown = existing.getExternalIds().stream()
                    .anyMatch(ext -> gedFam.getGedUid().equals(ext.getUidValue()));
            if (!uidKnown) {
                return true;
            }
        }

        Long expectedHusbId = gedFam.getHusbandGedRefId() != null
                ? resolvedPersonIds.get(gedFam.getHusbandGedRefId()) : null;
        Long expectedWifeId = gedFam.getWifeGedRefId() != null
                ? resolvedPersonIds.get(gedFam.getWifeGedRefId()) : null;

        Long currentHusbId = existing.getHusband() != null ? existing.getHusband().getId() : null;
        Long currentWifeId = existing.getWife() != null ? existing.getWife().getId() : null;

        if (!Objects.equals(expectedHusbId, currentHusbId) || !Objects.equals(expectedWifeId, currentWifeId)) {
            return true;
        }

        if (!Objects.equals(gedFam.getStatusCode(), raw.getRawStatus())
                || !Objects.equals(gedFam.getWeddingDate(), raw.getRawWeddingDate())
                || !Objects.equals(gedFam.getWeddingPlace(), raw.getRawWeddingPlace())) {
            return true;
        }

        List<ParsedGedcomChildLinkDto> gedChildren = gedFam.getChildren() != null ? gedFam.getChildren() : List.of();
        if (gedChildren.size() != existing.getChildren().size()) {
            return true;
        }

        Set<Long> existingChildPersonIds = existing.getChildren().stream()
                .map(fc -> fc.getChild().getId())
                .collect(Collectors.toSet());

        for (ParsedGedcomChildLinkDto childLink : gedChildren) {
            Long resolvedChildId = resolvedPersonIds.get(childLink.getChildGedRefId());
            if (resolvedChildId == null || !existingChildPersonIds.contains(resolvedChildId)) {
                return true;
            }
        }

        return false;
    }

    private String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private GedcomImportSession findSessionOrThrow(Long sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Import session not found: " + sessionId));
    }

    private void ensureNotCompleted(GedcomImportSession session) {
        if (session.getStatus() == ImportSessionStatus.COMPLETED) {
            throw new IllegalStateException("Import session is already completed.");
        }
    }

    private Integer extractEventYear(Event event) {
        if (event == null || event.getStartDate() == null) {
            return null;
        }
        return event.getStartDate().getStartYear();
    }

    private String formatPersonName(Person p) {
        if (p == null) return null;
        return ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim();
    }

    private String serializeState(ImportSessionStateDto state) {
        try {
            return objectMapper.writeValueAsString(state);
        } catch (JacksonException e) {
            throw new IllegalStateException("Failed to serialize import session state", e);
        }
    }

    private ImportSessionStateDto deserializeState(String json) {
        try {
            return objectMapper.readValue(json, ImportSessionStateDto.class);
        } catch (JacksonException e) {
            throw new IllegalStateException("Failed to deserialize import session state", e);
        }
    }

    private ImportSessionResponseDto toResponseDto(GedcomImportSession session, ImportSessionStateDto state) {
        return ImportSessionResponseDto.builder()
                .sessionId(session.getId())
                .fileName(session.getFileName())
                .status(session.getStatus())
                .sourceSystem(session.getSourceSystem())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .individualMatches(state.getIndividualMatches())
                .familyMatches(state.getFamilyMatches())
                .absentPeople(state.getAbsentPeople())
                .summaryPreview(state.getSummaryPreview())
                .build();
    }
}