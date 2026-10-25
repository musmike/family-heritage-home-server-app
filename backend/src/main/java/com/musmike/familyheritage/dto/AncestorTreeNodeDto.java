package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.LifeState;
import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AncestorTreeNodeDto {
    private Long id;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
    private boolean privateRecord;

    private Integer birthYear;
    private String birthDateText;
    private String birthPlace;

    private Integer deathYear;
    private String deathDateText;
    private String deathPlace;
    private String causeOfDeath;
    private String burialPlace;

    private String weddingDateText;
    private String weddingPlace;

    private Integer age;
    private boolean ageApproximate;

    private AncestorTreeNodeDto father;
    private AncestorTreeNodeDto mother;
}