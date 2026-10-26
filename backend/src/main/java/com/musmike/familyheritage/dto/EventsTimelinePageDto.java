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
public class EventsTimelinePageDto {
    private int page;
    private int size;
    private long totalEvents;
    private int totalPages;
    private Integer minAvailableYear;
    private Integer maxAvailableYear;

    @Builder.Default
    private List<EventTypeOptionDto> availableTypes = new ArrayList<>();

    @Builder.Default
    private List<TimelineDecadeGroupDto> decades = new ArrayList<>();

    @Builder.Default
    private List<TimelineEventDto> undatedEvents = new ArrayList<>();
}