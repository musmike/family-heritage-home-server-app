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
public class BurialPersonItemDto {
    private Long burialId;
    private Long graveId;
    private Long cemeteryId;
    private String cemeteryName;
    private boolean current;
    private String placeDescription;

    private Integer burialYear;
    private String burialDateText;

    private Long personId;
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
    private String causeOfDeath;

    private Integer age;
    private boolean ageApproximate;
}
