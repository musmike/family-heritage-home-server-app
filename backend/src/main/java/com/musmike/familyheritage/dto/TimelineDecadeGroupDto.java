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
public class TimelineDecadeGroupDto {
    private Integer decadeStart;
    private String decadeLabel;
    private int eventsCount;

    @Builder.Default
    private List<TimelineYearGroupDto> years = new ArrayList<>();
}