package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.DbPersonCandidateContext;
import com.musmike.familyheritage.dto.IndividualMatchResultDto;
import com.musmike.familyheritage.dto.ParsedGedcomIndividualDto;
import com.musmike.familyheritage.dto.PersonMatchCandidateDto;
import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.MatchClassification;
import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GedcomPersonMatcher {

    private static final int MIN_CANDIDATE_SCORE = 40;
    private static final int AUTO_MATCH_THRESHOLD = 90;
    private static final int AMBIGUOUS_SECOND_CANDIDATE_THRESHOLD = 75;

    private final GedcomDateParser dateParser;

    public IndividualMatchResultDto matchIndividual(
            ParsedGedcomIndividualDto gedIndi,
            List<DbPersonCandidateContext> dbCandidates
    ) {
        // 1. Check for exact external UID match first
        if (gedIndi.getGedUid() != null && !gedIndi.getGedUid().isBlank()) {
            for (DbPersonCandidateContext candidate : dbCandidates) {
                if (candidate.getExternalUids() != null && candidate.getExternalUids().contains(gedIndi.getGedUid())) {
                    PersonMatchCandidateDto exactMatch = toCandidateDto(
                            candidate, 100, List.of("Exact external UID match")
                    );
                    return IndividualMatchResultDto.builder()
                            .gedcomIndividual(gedIndi)
                            .classification(MatchClassification.AUTO_MATCH)
                            .selectedAction(DecisionAction.MATCH)
                            .selectedTargetPersonId(candidate.getPersonId())
                            .candidates(List.of(exactMatch))
                            .build();
                }
            }
        }

        // 2. Heuristic scoring across all DB candidates
        DateDescriptor parsedBirth = parseDateOrNull(gedIndi.getBirthDate());
        DateDescriptor parsedDeath = parseDateOrNull(gedIndi.getDeathDate());
        PersonSex gedSex = mapSex(gedIndi.getSex());

        List<PersonMatchCandidateDto> scoredCandidates = new ArrayList<>();
        for (DbPersonCandidateContext dbCandidate : dbCandidates) {
            PersonMatchCandidateDto scored = scoreCandidate(gedIndi, parsedBirth, parsedDeath, gedSex, dbCandidate);
            if (scored.getConfidenceScore() >= MIN_CANDIDATE_SCORE) {
                scoredCandidates.add(scored);
            }
        }

        scoredCandidates.sort(
                Comparator.comparingInt(PersonMatchCandidateDto::getConfidenceScore).reversed()
                        .thenComparingLong(PersonMatchCandidateDto::getPersonId)
        );

        // 3. Classify result
        if (scoredCandidates.isEmpty()) {
            return IndividualMatchResultDto.builder()
                    .gedcomIndividual(gedIndi)
                    .classification(MatchClassification.NEW)
                    .selectedAction(DecisionAction.CREATE_NEW)
                    .selectedTargetPersonId(null)
                    .candidates(List.of())
                    .build();
        }

        PersonMatchCandidateDto top = scoredCandidates.getFirst();
        boolean hasAmbiguousRunnerUp = scoredCandidates.size() > 1
                && scoredCandidates.get(1).getConfidenceScore() >= AMBIGUOUS_SECOND_CANDIDATE_THRESHOLD;

        if (top.getConfidenceScore() >= AUTO_MATCH_THRESHOLD && !hasAmbiguousRunnerUp) {
            return IndividualMatchResultDto.builder()
                    .gedcomIndividual(gedIndi)
                    .classification(MatchClassification.AUTO_MATCH)
                    .selectedAction(DecisionAction.MATCH)
                    .selectedTargetPersonId(top.getPersonId())
                    .candidates(scoredCandidates)
                    .build();
        }

        return IndividualMatchResultDto.builder()
                .gedcomIndividual(gedIndi)
                .classification(MatchClassification.NEEDS_REVIEW)
                .selectedAction(null)
                .selectedTargetPersonId(null)
                .candidates(scoredCandidates)
                .build();
    }

    private PersonMatchCandidateDto scoreCandidate(
            ParsedGedcomIndividualDto gedIndi,
            DateDescriptor parsedBirth,
            DateDescriptor parsedDeath,
            PersonSex gedSex,
            DbPersonCandidateContext dbCandidate
    ) {
        int score = 0;
        List<String> reasons = new ArrayList<>();

        // Name comparison
        String gedGiven = normalizeText(gedIndi.getGivenName());
        String gedSurname = normalizeText(gedIndi.getSurname());
        String dbGiven = normalizeText(dbCandidate.getGivenName());
        String dbSurname = normalizeText(dbCandidate.getSurname());

        boolean exactGiven = !gedGiven.isEmpty() && gedGiven.equals(dbGiven);
        boolean exactSurname = !gedSurname.isEmpty() && gedSurname.equals(dbSurname);
        boolean similarGiven = !gedGiven.isEmpty() && !dbGiven.isEmpty() && levenshteinDistance(gedGiven, dbGiven) <= 2;
        boolean similarSurname = !gedSurname.isEmpty() && !dbSurname.isEmpty() && levenshteinDistance(gedSurname, dbSurname) <= 2;

        if (exactGiven && exactSurname) {
            score += 40;
            reasons.add("Exact given name and surname match");
        } else if (exactGiven && similarSurname) {
            score += 32;
            reasons.add("Exact given name and similar surname");
        } else if (similarGiven && exactSurname) {
            score += 30;
            reasons.add("Similar given name and exact surname");
        } else if (exactGiven) {
            score += 20;
            reasons.add("Matching given name");
        }

        // Birth date & place
        if (parsedBirth != null && parsedBirth.getStartYear() != null && dbCandidate.getBirthYear() != null) {
            int yearDiff = Math.abs(parsedBirth.getStartYear() - dbCandidate.getBirthYear());
            if (yearDiff == 0) {
                if (parsedBirth.getStartMonth() != null && parsedBirth.getStartDay() != null
                        && parsedBirth.getStartMonth().equals(dbCandidate.getBirthMonth())
                        && parsedBirth.getStartDay().equals(dbCandidate.getBirthDay())) {
                    score += 25;
                    reasons.add("Exact birth date match");
                } else {
                    score += 15;
                    reasons.add("Matching birth year");
                }
            } else if (yearDiff > 5) {
                score -= 30;
            }
        }

        if (placesMatch(gedIndi.getBirthPlace(), dbCandidate.getBirthPlace())) {
            score += 5;
            reasons.add("Matching birth place");
        }

        // Death date & place
        if (parsedDeath != null && parsedDeath.getStartYear() != null && dbCandidate.getDeathYear() != null) {
            int yearDiff = Math.abs(parsedDeath.getStartYear() - dbCandidate.getDeathYear());
            if (yearDiff == 0) {
                score += 10;
                reasons.add("Matching death date/year");
            } else if (yearDiff > 5) {
                score -= 20;
            }
        }

        if (placesMatch(gedIndi.getDeathPlace(), dbCandidate.getDeathPlace())) {
            score += 5;
            reasons.add("Matching death place");
        }

        // Family context (parents & spouses)
        if (hasCommonNormalizedName(gedIndi.getParentGivenNames(), dbCandidate.getParentGivenNames())) {
            score += 10;
            reasons.add("Matching parent given name");
        }

        if (hasCommonNormalizedName(gedIndi.getSpouseGivenNames(), dbCandidate.getSpouseGivenNames())) {
            score += 5;
            reasons.add("Matching spouse given name");
        }

        // Sex contradiction penalty
        if (gedSex != PersonSex.UNKNOWN
                && dbCandidate.getSex() != null
                && dbCandidate.getSex() != PersonSex.UNKNOWN
                && gedSex != dbCandidate.getSex()) {
            score -= 40;
        }

        // Bonus for GEDCOM XREF ID only if personal data already reached threshold
        if (score >= MIN_CANDIDATE_SCORE
                && gedIndi.getGedRefId() != null
                && gedIndi.getGedRefId().equals(dbCandidate.getLastGedRefId())) {
            score += 10;
            reasons.add("Matching GEDCOM reference ID");
        }

        int clampedScore = Math.clamp(score, 0, 100);
        return toCandidateDto(dbCandidate, clampedScore, reasons);
    }

    private PersonMatchCandidateDto toCandidateDto(
            DbPersonCandidateContext dbCandidate,
            int score,
            List<String> reasons
    ) {
        return PersonMatchCandidateDto.builder()
                .personId(dbCandidate.getPersonId())
                .givenName(dbCandidate.getGivenName())
                .surname(dbCandidate.getSurname())
                .birthYear(dbCandidate.getBirthYear())
                .deathYear(dbCandidate.getDeathYear())
                .archived(dbCandidate.isArchived())
                .confidenceScore(score)
                .matchReasons(reasons)
                .build();
    }

    private DateDescriptor parseDateOrNull(String rawDate) {
        if (rawDate == null || rawDate.isBlank()) {
            return null;
        }
        return dateParser.parse(rawDate).getStartDate();
    }

    private PersonSex mapSex(String rawSex) {
        if (rawSex == null) {
            return PersonSex.UNKNOWN;
        }
        return switch (rawSex.trim().toUpperCase()) {
            case "M" -> PersonSex.MALE;
            case "F" -> PersonSex.FEMALE;
            default -> PersonSex.UNKNOWN;
        };
    }

    private boolean placesMatch(String place1, String place2) {
        String norm1 = normalizeText(place1);
        String norm2 = normalizeText(place2);
        if (norm1.isEmpty() || norm2.isEmpty()) {
            return false;
        }
        return norm1.equals(norm2) || norm1.contains(norm2) || norm2.contains(norm1);
    }

    private boolean hasCommonNormalizedName(Set<String> names1, Set<String> names2) {
        if (names1 == null || names2 == null || names1.isEmpty() || names2.isEmpty()) {
            return false;
        }
        Set<String> norm1 = names1.stream()
                .map(this::normalizeText)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        return names2.stream()
                .map(this::normalizeText)
                .filter(s -> !s.isEmpty())
                .anyMatch(norm1::contains);
    }

    private String normalizeText(String input) {
        if (input == null) {
            return "";
        }
        String lower = input.trim().toLowerCase()
                .replace('ł', 'l');
        String decomposed = Normalizer.normalize(lower, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
    }

    private int levenshteinDistance(String s1, String s2) {
        int[] prev = new int[s2.length() + 1];
        int[] curr = new int[s2.length() + 1];

        for (int j = 0; j <= s2.length(); j++) {
            prev[j] = j;
        }

        for (int i = 1; i <= s1.length(); i++) {
            curr[0] = i;
            for (int j = 1; j <= s2.length(); j++) {
                int cost = (s1.charAt(i - 1) == s2.charAt(j - 1)) ? 0 : 1;
                curr[j] = Math.min(
                        Math.min(curr[j - 1] + 1, prev[j] + 1),
                        prev[j - 1] + cost
                );
            }
            int[] temp = prev;
            prev = curr;
            curr = temp;
        }
        return prev[s2.length()];
    }
}