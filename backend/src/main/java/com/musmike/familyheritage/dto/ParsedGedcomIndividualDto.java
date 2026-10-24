package com.musmike.familyheritage.dto;

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
public class ParsedGedcomIndividualDto {
    private String gedRefId;
    private String gedUid;
    private String givenName;
    private String surname;
    private String sex;
    private boolean deathIndicated;
    private String birthDate;
    private String birthPlace;
    private String deathDate;
    private String deathPlace;
    private String causeOfDeath;
    private String burialPlace;

    @Builder.Default
    private Set<String> parentGivenNames = new HashSet<>();

    @Builder.Default
    private Set<String> spouseGivenNames = new HashSet<>();
}