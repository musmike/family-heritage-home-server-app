package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.MatchClassification;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GedcomFamilyMatcher {

    private static final int MIN_CANDIDATE_SCORE = 40;
    private static final int AUTO_MATCH_THRESHOLD = 90;
    private static final int AMBIGUOUS_SECOND_CANDIDATE_THRESHOLD = 75;

    private final GedcomDateParser dateParser;

    public FamilyMatchResultDto matchFamily(
            ParsedGedcomFamilyDto gedFam,
            Map<String, IndividualDecisionDto> personDecisions,
            List<DbFamilyCandidateContext> dbFamilies
    ) {
        // 1. Check for exact external UID match first
        if (gedFam.getGedUid() != null && !gedFam.getGedUid().isBlank()) {
            for (DbFamilyCandidateContext dbFam : dbFamilies) {
                if (dbFam.getExternalUids() != null && dbFam.getExternalUids().contains(gedFam.getGedUid())) {
                    FamilyMatchCandidateDto exactMatch = toCandidateDto(
                            dbFam, 100, List.of("Exact external UID match")
                    );
                    return FamilyMatchResultDto.builder()
                            .gedcomFamily(gedFam)
                            .classification(MatchClassification.AUTO_MATCH)
                            .selectedAction(DecisionAction.MATCH)
                            .selectedTargetFamilyId(dbFam.getFamilyId())
                            .candidates(List.of(exactMatch))
                            .build();
                }
            }
        }

        // 2. Resolve GEDCOM references using user's individual decisions
        Long resolvedHusbandId = resolveMatchedPersonId(gedFam.getHusbandGedRefId(), personDecisions);
        Long resolvedWifeId = resolveMatchedPersonId(gedFam.getWifeGedRefId(), personDecisions);

        Set<Long> resolvedChildIds = gedFam.getChildren() == null ? Set.of() :
                gedFam.getChildren().stream()
                        .map(c -> resolveMatchedPersonId(c.getChildGedRefId(), personDecisions))
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());

        // If neither spouse was matched to an existing DB person, this is a brand-new family
        if (resolvedHusbandId == null && resolvedWifeId == null) {
            return FamilyMatchResultDto.builder()
                    .gedcomFamily(gedFam)
                    .classification(MatchClassification.NEW)
                    .selectedAction(DecisionAction.CREATE_NEW)
                    .selectedTargetFamilyId(null)
                    .candidates(List.of())
                    .build();
        }

        Integer gedWeddingYear = extractYear(gedFam.getWeddingDate());

        // 3. Score candidate DB families
        List<FamilyMatchCandidateDto> scoredCandidates = new ArrayList<>();
        for (DbFamilyCandidateContext dbFam : dbFamilies) {
            FamilyMatchCandidateDto scored = scoreFamilyCandidate(
                    gedFam, resolvedHusbandId, resolvedWifeId, resolvedChildIds, gedWeddingYear, dbFam
            );
            if (scored.getConfidenceScore() >= MIN_CANDIDATE_SCORE) {
                scoredCandidates.add(scored);
            }
        }

        scoredCandidates.sort(
                Comparator.comparingInt(FamilyMatchCandidateDto::getConfidenceScore).reversed()
                        .thenComparingLong(FamilyMatchCandidateDto::getFamilyId)
        );

        if (scoredCandidates.isEmpty()) {
            return FamilyMatchResultDto.builder()
                    .gedcomFamily(gedFam)
                    .classification(MatchClassification.NEW)
                    .selectedAction(DecisionAction.CREATE_NEW)
                    .selectedTargetFamilyId(null)
                    .candidates(List.of())
                    .build();
        }

        FamilyMatchCandidateDto top = scoredCandidates.getFirst();
        boolean hasAmbiguousRunnerUp = scoredCandidates.size() > 1
                && scoredCandidates.get(1).getConfidenceScore() >= AMBIGUOUS_SECOND_CANDIDATE_THRESHOLD;

        if (top.getConfidenceScore() >= AUTO_MATCH_THRESHOLD && !hasAmbiguousRunnerUp) {
            return FamilyMatchResultDto.builder()
                    .gedcomFamily(gedFam)
                    .classification(MatchClassification.AUTO_MATCH)
                    .selectedAction(DecisionAction.MATCH)
                    .selectedTargetFamilyId(top.getFamilyId())
                    .candidates(scoredCandidates)
                    .build();
        }

        return FamilyMatchResultDto.builder()
                .gedcomFamily(gedFam)
                .classification(MatchClassification.NEEDS_REVIEW)
                .selectedAction(null)
                .selectedTargetFamilyId(null)
                .candidates(scoredCandidates)
                .build();
    }

    private FamilyMatchCandidateDto scoreFamilyCandidate(
            ParsedGedcomFamilyDto gedFam,
            Long resolvedHusbandId,
            Long resolvedWifeId,
            Set<Long> resolvedChildIds,
            Integer gedWeddingYear,
            DbFamilyCandidateContext dbFam
    ) {
        int score = 0;
        List<String> reasons = new ArrayList<>();

        boolean husbandMatches = resolvedHusbandId != null && resolvedHusbandId.equals(dbFam.getHusbandPersonId());
        boolean wifeMatches = resolvedWifeId != null && resolvedWifeId.equals(dbFam.getWifePersonId());

        boolean bothSpousesPresentAndMatch = husbandMatches && wifeMatches;
        boolean singleHusbandMatches = husbandMatches && gedFam.getWifeGedRefId() == null && dbFam.getWifePersonId() == null;
        boolean singleWifeMatches = wifeMatches && gedFam.getHusbandGedRefId() == null && dbFam.getHusbandPersonId() == null;

        if (bothSpousesPresentAndMatch) {
            score += 95;
            reasons.add("Both spouses match existing family");
        } else if (singleHusbandMatches || singleWifeMatches) {
            score += 80;
            reasons.add("Single parent matches existing single-parent family");
        } else if (husbandMatches || wifeMatches) {
            score += 50;
            reasons.add("One spouse matches existing family");

            // Check if the other spouse is explicitly present on both sides and is a different person
            boolean otherSpouseConflicts =
                    (husbandMatches && gedFam.getWifeGedRefId() != null && dbFam.getWifePersonId() != null)
                            || (wifeMatches && gedFam.getHusbandGedRefId() != null && dbFam.getHusbandPersonId() != null);
            if (otherSpouseConflicts) {
                score -= 20;
            }
        } else {
            return toCandidateDto(dbFam, 0, reasons);
        }

        // Shared children bonus
        if (!resolvedChildIds.isEmpty() && dbFam.getChildPersonIds() != null) {
            boolean hasCommonChild = resolvedChildIds.stream().anyMatch(dbFam.getChildPersonIds()::contains);
            if (hasCommonChild) {
                score += (bothSpousesPresentAndMatch ? 5 : 25);
                reasons.add("Matching children in family");
            }
        }

        // Wedding year bonus
        if (gedWeddingYear != null && dbFam.getWeddingYear() != null) {
            if (gedWeddingYear.equals(dbFam.getWeddingYear())) {
                score += (bothSpousesPresentAndMatch ? 5 : 10);
                reasons.add("Matching wedding year");
            }
        }

        // Bonus for matching GEDCOM XREF ID if base score already meets threshold
        if (score >= MIN_CANDIDATE_SCORE
                && gedFam.getGedRefId() != null
                && gedFam.getGedRefId().equals(dbFam.getLastGedRefId())) {
            score += 10;
            reasons.add("Matching GEDCOM reference ID");
        }

        int clampedScore = Math.clamp(score, 0, 100);
        return toCandidateDto(dbFam, clampedScore, reasons);
    }

    private Long resolveMatchedPersonId(String gedRefId, Map<String, IndividualDecisionDto> personDecisions) {
        if (gedRefId == null || personDecisions == null) {
            return null;
        }
        IndividualDecisionDto decision = personDecisions.get(gedRefId);
        if (decision != null && decision.getAction() == DecisionAction.MATCH) {
            return decision.getTargetPersonId();
        }
        return null;
    }

    private Integer extractYear(String rawDate) {
        if (rawDate == null || rawDate.isBlank()) {
            return null;
        }
        DateDescriptor dd = dateParser.parse(rawDate).getStartDate();
        return dd != null ? dd.getStartYear() : null;
    }

    private FamilyMatchCandidateDto toCandidateDto(
            DbFamilyCandidateContext dbFam,
            int score,
            List<String> reasons
    ) {
        return FamilyMatchCandidateDto.builder()
                .familyId(dbFam.getFamilyId())
                .husbandName(dbFam.getHusbandName())
                .wifeName(dbFam.getWifeName())
                .weddingYear(dbFam.getWeddingYear())
                .confidenceScore(score)
                .matchReasons(reasons)
                .build();
    }
}