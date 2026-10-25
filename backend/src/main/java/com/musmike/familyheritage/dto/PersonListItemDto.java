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
public class PersonListItemDto {
    private Long id;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
    private Integer birthYear;
    private String birthDateText;
    private String birthPlace;
    private Integer deathYear;
    private String deathDateText;
    private String deathPlace;
    private Integer age;
    private boolean ageApproximate;
}