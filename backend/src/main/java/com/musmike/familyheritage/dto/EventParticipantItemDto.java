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
    private Long participantId;
    private Long personId;
    private String participantText;
    private String givenName;
    private String surname;
    private PersonSex sex;
    private LifeState lifeState;
    private boolean archived;
    private boolean privateRecord;
    private String roleCode;
    private String roleLabel;
    private Integer ageAtEvent;
    private boolean ageApproximate;

    private Long avatarMediaId;
    private String avatarMediaType;
    private Integer avatarCropX;
    private Integer avatarCropY;
    private Double avatarCropZoom;

    @Builder.Default
    private List<String> parentNames = new ArrayList<>();
}