package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.LifeState;
import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonBiographyDto {
    private Long id;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
    private boolean defaultProband;

    private Integer birthYear;
    private String birthDateText;
    private String birthPlace;

    private Integer deathYear;
    private String deathDateText;
    private String deathPlace;
    private String causeOfDeath;
    private String burialPlace;
    private Long burialGraveId;

    private Integer age;
    private boolean ageApproximate;

    private String biographyContent;

    @Builder.Default
    private List<PersonNameDto> names = new ArrayList<>();

    @Builder.Default
    private List<OriginFamilyDto> originFamilies = new ArrayList<>();

    @Builder.Default
    private List<SpouseFamilyDto> spouseFamilies = new ArrayList<>();

    private RawGedcomPersonViewDto rawGedcomData;
}