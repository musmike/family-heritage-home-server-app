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
public class EventMediaOverviewDto {
    @Builder.Default
    private List<MediaItemDto> directMedia = new ArrayList<>();

    @Builder.Default
    private List<SubEventMediaGroupDto> subEventGroups = new ArrayList<>();
}