package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStatsDto {
    private long peopleCount;
    private long familiesCount;
    private int generationsCount;
    private long eventsCount;
    private long gravesCount;
    private long documentsCount;
    private long mediaCount;
    private long memoriesCount;
    private long heirloomsCount;
    private long placesCount;
}