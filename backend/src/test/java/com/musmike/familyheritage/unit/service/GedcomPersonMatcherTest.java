package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.dto.DbPersonCandidateContext;
import com.musmike.familyheritage.dto.IndividualMatchResultDto;
import com.musmike.familyheritage.dto.ParsedGedcomIndividualDto;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.MatchClassification;
import com.musmike.familyheritage.model.enums.PersonSex;
import com.musmike.familyheritage.service.GedcomDateParser;
import com.musmike.familyheritage.service.GedcomPersonMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GedcomPersonMatcherTest {

    private GedcomPersonMatcher matcher;

    @BeforeEach
    void setUp() {
        matcher = new GedcomPersonMatcher(new GedcomDateParser());
    }

    @Test
    void shouldAutoMatchWith100ConfidenceWhenAnyExternalUidMatches() {
        // GIVEN - person in GEDCOM has UID from Gramps, DB person has UIDs from MyHeritage and Gramps
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I5@")
                .gedUid("uid-gramps-777")
                .givenName("Tomasz")
                .surname("Nowak")
                .sex("M")
                .build();

        DbPersonCandidateContext dbPerson = DbPersonCandidateContext.builder()
                .personId(10L)
                .givenName("Jan") // Even if name was edited in the source program
                .surname("Kowalski")
                .sex(PersonSex.MALE)
                .externalUids(Set.of("uid-myheritage-111", "uid-gramps-777"))
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(dbPerson));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(result.getSelectedTargetPersonId()).isEqualTo(10L);
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(100);
        assertThat(result.getCandidates().getFirst().getMatchReasons())
                .contains("Exact external UID match");
    }

    @Test
    void shouldAutoMatchHeuristicWhenScoreIsAtLeast90AndUnambiguous() {
        // GIVEN - no UID, but exact name (with diacritics normalization), exact birth date, place, death, parents, spouse
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I1@")
                .givenName("Łukasz")
                .surname("Żółkiewski")
                .sex("M")
                .birthDate("10 JAN 1920")
                .birthPlace("Warszawa, Polska")
                .deathDate("15 FEB 1990")
                .deathPlace("Kraków, Polska")
                .parentGivenNames(Set.of("Stanisław", "Maria"))
                .spouseGivenNames(Set.of("Zofia"))
                .build();

        DbPersonCandidateContext dbPerson = DbPersonCandidateContext.builder()
                .personId(25L)
                .givenName("Lukasz")
                .surname("Zolkiewski")
                .sex(PersonSex.MALE)
                .lastGedRefId("@I1@")
                .birthYear(1920)
                .birthMonth(1)
                .birthDay(10)
                .birthPlace("Warszawa")
                .deathYear(1990)
                .deathMonth(2)
                .deathDay(15)
                .deathPlace("Kraków")
                .parentGivenNames(Set.of("Stanisław"))
                .spouseGivenNames(Set.of("Zofia"))
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(dbPerson));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.AUTO_MATCH);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.MATCH);
        assertThat(result.getSelectedTargetPersonId()).isEqualTo(25L);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(100);
        assertThat(result.getCandidates().getFirst().getMatchReasons()).contains(
                "Exact given name and surname match",
                "Exact birth date match",
                "Matching birth place",
                "Exact death date match",
                "Matching death place",
                "Matching parent given name",
                "Matching spouse given name",
                "Matching GEDCOM reference ID"
        );
    }

    @Test
    void shouldClassifyAsNeedsReviewWhenScoreIsBetween40And89() {
        // GIVEN - exact name (+40) and birth year only (+15) = 55
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I2@")
                .givenName("Jan")
                .surname("Kowalski")
                .sex("M")
                .birthDate("1950")
                .build();

        DbPersonCandidateContext dbPerson = DbPersonCandidateContext.builder()
                .personId(30L)
                .givenName("Jan")
                .surname("Kowalski")
                .sex(PersonSex.MALE)
                .birthYear(1950)
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(dbPerson));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getSelectedAction()).isNull();
        assertThat(result.getSelectedTargetPersonId()).isNull();
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(55);
    }

    @Test
    void shouldClassifyAsNeedsReviewWhenTwoCandidatesHaveHighScores() {
        // GIVEN - two identical cousins in DB both scoring >= 90
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I1@")
                .givenName("Jan")
                .surname("Kowalski")
                .sex("M")
                .birthDate("10 JAN 1920")
                .birthPlace("Warszawa")
                .parentGivenNames(Set.of("Piotr"))
                .spouseGivenNames(Set.of("Anna"))
                .build();

        DbPersonCandidateContext candidate1 = DbPersonCandidateContext.builder()
                .personId(1L)
                .givenName("Jan")
                .surname("Kowalski")
                .sex(PersonSex.MALE)
                .lastGedRefId("@I1@")
                .birthYear(1920).birthMonth(1).birthDay(10)
                .birthPlace("Warszawa")
                .parentGivenNames(Set.of("Piotr"))
                .spouseGivenNames(Set.of("Anna"))
                .build();

        DbPersonCandidateContext candidate2 = DbPersonCandidateContext.builder()
                .personId(2L)
                .givenName("Jan")
                .surname("Kowalski")
                .sex(PersonSex.MALE)
                .birthYear(1920).birthMonth(1).birthDay(10)
                .birthPlace("Warszawa")
                .parentGivenNames(Set.of("Piotr"))
                .spouseGivenNames(Set.of("Anna"))
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(candidate1, candidate2));

        // THEN - must ask user instead of blind auto-match
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getSelectedAction()).isNull();
        assertThat(result.getCandidates()).hasSize(2);
    }

    @Test
    void shouldScoreSimilarNamesAndMaidenNameChanges() {
        // Case A: Exact given name + similar surname ("Kowalska" vs "Kowalski" -> +32) + birth year (+15) = 47
        ParsedGedcomIndividualDto indiA = ParsedGedcomIndividualDto.builder()
                .givenName("Anna")
                .surname("Kowalska")
                .sex("F")
                .birthDate("1980")
                .build();
        DbPersonCandidateContext candA = DbPersonCandidateContext.builder()
                .personId(1L)
                .givenName("Anna")
                .surname("Kowalski")
                .sex(PersonSex.FEMALE)
                .birthYear(1980)
                .build();

        IndividualMatchResultDto resA = matcher.matchIndividual(indiA, List.of(candA));
        assertThat(resA.getCandidates().getFirst().getConfidenceScore()).isEqualTo(47);
        assertThat(resA.getCandidates().getFirst().getMatchReasons())
                .contains("Exact given name and similar surname");

        // Case B: Similar given name ("Jan" vs "Janek" -> dist 2) + exact surname (+30) + birth year (+15) = 45
        ParsedGedcomIndividualDto indiB = ParsedGedcomIndividualDto.builder()
                .givenName("Jan")
                .surname("Nowak")
                .birthDate("1980")
                .build();
        DbPersonCandidateContext candB = DbPersonCandidateContext.builder()
                .personId(2L)
                .givenName("Janek")
                .surname("Nowak")
                .birthYear(1980)
                .build();

        IndividualMatchResultDto resB = matcher.matchIndividual(indiB, List.of(candB));
        assertThat(resB.getCandidates().getFirst().getConfidenceScore()).isEqualTo(45);
        assertThat(resB.getCandidates().getFirst().getMatchReasons())
                .contains("Similar given name and exact surname");

        // Case C: Exact given name + completely different married surname (+20) + exact birth date (+25) = 45
        ParsedGedcomIndividualDto indiC = ParsedGedcomIndividualDto.builder()
                .givenName("Anna")
                .surname("Wiśniewska")
                .birthDate("12 MAY 1985")
                .build();
        DbPersonCandidateContext candC = DbPersonCandidateContext.builder()
                .personId(3L)
                .givenName("Anna")
                .surname("Kowalska")
                .birthYear(1985).birthMonth(5).birthDay(12)
                .build();

        IndividualMatchResultDto resC = matcher.matchIndividual(indiC, List.of(candC));
        assertThat(resC.getCandidates().getFirst().getConfidenceScore()).isEqualTo(45);
        assertThat(resC.getCandidates().getFirst().getMatchReasons())
                .contains("Matching given name");
    }

    @Test
    void shouldApplyPenaltiesForConflictingDatesAndSexAndMarkAsNew() {
        // GIVEN - same name (+40), but birth year differs by 30 years (-30), death year differs by 20 years (-20),
        // and sex is opposite (-40). Also gedRefId is @I1@ which must NOT give bonus because score < 40.
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I1@")
                .givenName("Jan")
                .surname("Kowalski")
                .sex("F")
                .birthDate("1950")
                .deathDate("2010")
                .build();

        DbPersonCandidateContext dbPerson = DbPersonCandidateContext.builder()
                .personId(99L)
                .givenName("Jan")
                .surname("Kowalski")
                .sex(PersonSex.MALE)
                .lastGedRefId("@I1@")
                .birthYear(1920)
                .deathYear(1990)
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(dbPerson));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEW);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.CREATE_NEW);
        assertThat(result.getSelectedTargetPersonId()).isNull();
        assertThat(result.getCandidates()).isEmpty();
    }

    @Test
    void shouldClassifyAsNewWhenDatabaseIsEmptyOrNoCandidateReachesThreshold() {
        // GIVEN
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I9@")
                .givenName("Zygmunt")
                .surname("Waza")
                .sex("M")
                .build();

        DbPersonCandidateContext unrelated = DbPersonCandidateContext.builder()
                .personId(1L)
                .givenName("Anna")
                .surname("Nowak")
                .sex(PersonSex.FEMALE)
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(unrelated));

        // THEN
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEW);
        assertThat(result.getSelectedAction()).isEqualTo(DecisionAction.CREATE_NEW);
        assertThat(result.getCandidates()).isEmpty();
    }

    @Test
    void shouldMatchCandidateInNeedsReviewWhenFirstNameChangedAndBirthYearMissingButOtherDataMatches() {
        // GIVEN - "Janek Fitzgerald Kennedy" with unparseable French Republican birth date,
        // vs DB "John Fitzgerald Kennedy" with matching surname, middle name, places, death date, parents & spouse
        ParsedGedcomIndividualDto gedIndi = ParsedGedcomIndividualDto.builder()
                .gedRefId("@I1@")
                .givenName("Janek Fitzgerald")
                .surname("Kennedy")
                .sex("M")
                .birthDate("@#DFRENCH R@ AFT FRIM 9 125")
                .birthPlace("Brookline, Massachusetts")
                .deathDate("22 NOV 1963")
                .deathPlace("Dallas, Texas")
                .parentGivenNames(Set.of("Joseph Patrick", "Rose"))
                .spouseGivenNames(Set.of("Jacqueline Lee"))
                .build();

        DbPersonCandidateContext dbJfk = DbPersonCandidateContext.builder()
                .personId(73L)
                .givenName("John Fitzgerald")
                .surname("Kennedy")
                .sex(PersonSex.MALE)
                .birthYear(null)
                .birthPlace("Brookline, Massachusetts")
                .deathYear(1963).deathMonth(11).deathDay(22)
                .deathPlace("Dallas, Texas")
                .parentGivenNames(Set.of("Joseph Patrick", "Rose"))
                .spouseGivenNames(Set.of("Jacqueline Lee"))
                .build();

        // WHEN
        IndividualMatchResultDto result = matcher.matchIndividual(gedIndi, List.of(dbJfk));

        // THEN - 28 (surname + middle name) + 5 (birth place) + 15 (exact death date) + 5 (death place)
        // + 15 (both parents) + 10 (spouse) = 78 -> NEEDS_REVIEW!
        assertThat(result.getClassification()).isEqualTo(MatchClassification.NEEDS_REVIEW);
        assertThat(result.getCandidates()).hasSize(1);
        assertThat(result.getCandidates().getFirst().getPersonId()).isEqualTo(73L);
        assertThat(result.getCandidates().getFirst().getConfidenceScore()).isEqualTo(78);
    }
}