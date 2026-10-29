package com.musmike.familyheritage.dto;

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
public class GraveGroupDto {
    private Long graveId;
    private Long cemeteryId;
    private String cemeteryName;

    private String section;
    private String sector;
    private String rowNumber;
    private String graveNumber;
    private String graveType;
    private String graveTypeLabel;
    private String description;
    private String epitaph;

    @Builder.Default
    private List<BurialPersonItemDto> burials = new ArrayList<>();
}
