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
public class BurialsOverviewDto {
    private int totalBurialsCount;
    private int totalGravesCount;

    @Builder.Default
    private List<CemeteryGroupDto> cemeteryGroups = new ArrayList<>();
}