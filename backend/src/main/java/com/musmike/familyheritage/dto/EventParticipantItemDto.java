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
public class EventParticipantItemDto {
    private Long personId;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
    private boolean privateRecord;
    private String roleCode;
    private Integer ageAtEvent;
    private boolean ageApproximate;

    @Builder.Default
    private List<String> parentNames = new ArrayList<>();
}