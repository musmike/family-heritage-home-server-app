package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveGraveRequestDto {
    private Long cemeteryId;
    private String section;
    private String sector;
    private String rowNumber;
    private String graveNumber;
    private String graveType;
    private String description;
    private String epitaph;
    private Long initialPersonId;
}
