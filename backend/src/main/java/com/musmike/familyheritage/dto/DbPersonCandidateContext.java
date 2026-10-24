package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashSet;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DbPersonCandidateContext {
    private Long personId;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private boolean archived;
    private String lastGedRefId;

    @Builder.Default
    private Set<String> externalUids = new HashSet<>();

    private Integer birthYear;
    private Integer birthMonth;
    private Integer birthDay;
    private String birthPlace;

    private Integer deathYear;
    private Integer deathMonth;
    private Integer deathDay;
    private String deathPlace;

    @Builder.Default
    private Set<String> parentGivenNames = new HashSet<>();

    @Builder.Default
    private Set<String> spouseGivenNames = new HashSet<>();
}