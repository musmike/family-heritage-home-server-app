package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.MatchClassification;
import com.musmike.familyheritage.service.GedcomDateParser;
import com.musmike.familyheritage.service.GedcomFamilyMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GedcomFamilyMatcherTest {

    private GedcomFamilyMatcher familyMatcher;

    @BeforeEach
    void setUp() {
        familyMatcher = new GedcomFamilyMatcher(new GedcomDateParser());
    }

    @Test
    void shouldAutoMatchWith100ConfidenceWhenExternalUidMatches() {
        // GIVEN
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F1@")
                .gedUid("fam-uid-gramps-99")
                .husbandGedRefId("@I1@")
                .build();

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(50L)
                .husbandPersonId(10L)
                .husbandName("Jan Kowalski")
                .externalUids(Set.of("fam-uid-mh-11", "fam-uid-gramps-99"))
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L)
        );

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(result.getSelectedTargetFamilyId()).isEqualTo(50L);
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(100);
        assertThat(result.getCandidates().getFirst().getMatchReasons())
                .contains("Exact external UID match");
    }

    @Test
    void shouldAutoMatchWhenBothSpousesMatchExistingDbFamily() {
        // GIVEN
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F1@")
                .husbandGedRefId("@I1@")
                .wifeGedRefId("@I2@")
                .weddingDate("10 JUN 1950")
                .children(List.of(new ParsedGedcomChildLinkDto("@I3@", null, null)))
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, 20L),
                "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.MATCH, 30L)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(100L)
                .husbandPersonId(10L)
                .husbandName("Jan Kowalski")
                .wifePersonId(20L)
                .wifeName("Anna Nowak")
                .weddingYear(1950)
                .childPersonIds(Set.of(30L))
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(result.getSelectedTargetFamilyId()).isEqualTo(100L);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(100);
        assertThat(result.getCandidates().getFirst().getMatchReasons()).contains(
                "Both spouses match existing family",
                "Matching children in family",
                "Matching wedding year"
        );
    }

    @Test
    void shouldAutoMatchSingleParentFamilyWhenChildrenMatch() {
        // GIVEN - only husband in GEDCOM and only husband in DB + same child
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F2@")
                .husbandGedRefId("@I1@")
                .children(List.of(new ParsedGedcomChildLinkDto("@I3@", null, null)))
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.MATCH, 30L)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(101L)
                .husbandPersonId(10L)
                .wifePersonId(null)
                .lastGedRefId("@F2@")
                .childPersonIds(Set.of(30L))
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(result.getSelectedTargetFamilyId()).isEqualTo(101L);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(100);
    }

    @Test
    void shouldClassifyAsNeedsReviewWhenOneSpouseWasRemovedFromFamily() {
        // GIVEN - DB family had Husband (10) + Wife (20) + Child (30),
        // new GEDCOM family has only Husband (10) + Child (30) (wife removed)
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F5@")
                .husbandGedRefId("@I1@")
                .wifeGedRefId(null)
                .children(List.of(new ParsedGedcomChildLinkDto("@I3@", null, null)))
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.MATCH, 30L)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(102L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .childPersonIds(Set.of(30L))
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN - 50 (one spouse) + 25 (shared child) = 75 -> NEEDS_REVIEW
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getSelectedAction()).isNull();
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(75);
    }

    @Test
    void shouldClassifySecondMarriageWithDifferentSpouseAndNoSharedChildrenAsNew() {
        // GIVEN - DB has Jan (10) + Anna (20). GEDCOM has Jan (10) + Zofia (CREATE_NEW) with no shared children.
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F2@")
                .husbandGedRefId("@I1@")
                .wifeGedRefId("@I9@")
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I9@", new IndividualDecisionDto("@I9@", DecisionAction.CREATE_NEW, null)
        );

        DbFamilyCandidateContext firstMarriageInDb = DbFamilyCandidateContext.builder()
                .familyId(100L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(firstMarriageInDb));

        // THEN - 50 (husband matches) - 20 (wife is a different person) = 30 (< 40) -> NEW family!
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEW);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.CREATE_NEW);
        assertThat(result.getCandidates()).isEmpty();
    }

    @Test
    void shouldClassifyMarriageWithDifferentSpouseButSharedChildrenAsNeedsReview() {
        // GIVEN - DB has Jan (10) + Anna (20) + Child (30).
        // GEDCOM has Jan (10) + Zofia (25) + Child (30).
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F1@")
                .husbandGedRefId("@I1@")
                .wifeGedRefId("@I2@")
                .children(List.of(new ParsedGedcomChildLinkDto("@I3@", null, null)))
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, 25L),
                "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.MATCH, 30L)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(100L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .childPersonIds(Set.of(30L))
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN - 50 (husband) - 20 (different wife) + 25 (shared child) = 55 -> NEEDS_REVIEW
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(55);
    }

    @Test
    void shouldClassifyAsNeedsReviewWhenSameCoupleHasTwoMarriagesInDb() {
        // GIVEN - Jan (10) and Anna (20) married twice in DB
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F1@")
                .husbandGedRefId("@I1@")
                .wifeGedRefId("@I2@")
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, 10L),
                "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, 20L)
        );

        DbFamilyCandidateContext marriage1 = DbFamilyCandidateContext.builder()
                .familyId(100L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .build();

        DbFamilyCandidateContext marriage2 = DbFamilyCandidateContext.builder()
                .familyId(101L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(marriage1, marriage2));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getSelectedAction()).isNull();
        assertThat(result.getCandidates()).hasSize(2);
    }

    @Test
    void shouldClassifyAsNewWhenBothSpousesAreNewPeople() {
        // GIVEN
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F9@")
                .husbandGedRefId("@I8@")
                .wifeGedRefId("@I9@")
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I8@", new IndividualDecisionDto("@I8@", DecisionAction.CREATE_NEW, null),
                "@I9@", new IndividualDecisionDto("@I9@", DecisionAction.CREATE_NEW, null)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(100L)
                .husbandPersonId(10L)
                .wifePersonId(20L)
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEW);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.CREATE_NEW);
        assertThat(result.getSelectedTargetFamilyId()).isNull();
        assertThat(result.getCandidates()).isEmpty();
    }

    @Test
    void shouldAutoMatchSingleMotherFamilyWhenGedRefIdMatches() {
        // GIVEN - only wife in GEDCOM and only wife in DB + matching @F3@
        ParsedGedcomFamilyDto gedFam = ParsedGedcomFamilyDto.builder()
                .gedRefId("@F3@")
                .wifeGedRefId("@I2@")
                .build();

        Map<String, IndividualDecisionDto> decisions = Map.of(
                "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, 20L)
        );

        DbFamilyCandidateContext dbFam = DbFamilyCandidateContext.builder()
                .familyId(200L)
                .husbandPersonId(null)
                .wifePersonId(20L)
                .lastGedRefId("@F3@")
                .build();

        // WHEN
        FamilyMatchResultDto result = familyMatcher.matchFamily(gedFam, decisions, List.of(dbFam));

        // THEN - 80 (single mother) + 10 (gedRefId) = 90 -> AUTO_MATCH
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedTargetFamilyId()).isEqualTo(200L);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(90);
    }
}