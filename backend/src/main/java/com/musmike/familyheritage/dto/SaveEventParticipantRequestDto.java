package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveEventParticipantRequestDto {
    private Long personId;
    private String participantText;
    private PersonSex participantSex;
    private String roleCode;
}