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
public class CemeteryGroupDto {
    private Long cemeteryId;
    private String groupName;
    private String managementType;
    private String managementTypeLabel;
    private String denomination;
    private String denominationLabel;
    private String locationName;
    private String description;
    private boolean otherGroup;
    private int totalBurialsCount;

    @Builder.Default
    private List<GraveGroupDto> graves = new ArrayList<>();
}
