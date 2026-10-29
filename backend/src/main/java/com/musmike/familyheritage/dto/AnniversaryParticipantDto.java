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
public class AnniversaryParticipantDto {
    private Long personId;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
}