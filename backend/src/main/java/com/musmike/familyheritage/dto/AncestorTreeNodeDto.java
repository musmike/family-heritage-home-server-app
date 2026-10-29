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
    private Long burialGraveId;

    private String weddingDateText;
    private String weddingPlace;

    private Integer age;
    private boolean ageApproximate;

    private boolean hasMoreAncestors;

    private AncestorTreeNodeDto father;
    private AncestorTreeNodeDto mother;

    @Builder.Default
    private List<RelatedPersonDto> children = new ArrayList<>();
}
