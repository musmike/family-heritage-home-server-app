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
public class RelatedPersonDto {
    private Long id;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private Integer birthYear;
    private Integer deathYear;
    private boolean archived;
    private boolean privateRecord;
}