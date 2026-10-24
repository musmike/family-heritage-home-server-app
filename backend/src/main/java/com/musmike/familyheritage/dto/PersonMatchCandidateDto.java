package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonMatchCandidateDto {
    private Long personId;
    private String givenName;
    private String surname;
    private String sex;
    private Integer birthYear;
    private String birthDate;
    private String birthPlace;
    private Integer deathYear;
    private String deathDate;
    private String deathPlace;
    private boolean archived;
    private int confidenceScore;

    @Builder.Default
    private Set<String> parentGivenNames = new HashSet<>();

    @Builder.Default
    private Set<String> spouseGivenNames = new HashSet<>();

    @Builder.Default
    private List<String> matchReasons = new ArrayList<>();
}
