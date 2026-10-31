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
public class TimelineEventDto {
    private Long eventId;
    private String typeCode;
    private String typeLabel;
    private boolean systemType;

    private String title;
    private String description;
    private Long parentEventId;
    private String parentEventLabel;

    private Integer year;
    private String dateText;
    private String locationName;

    @Builder.Default
    private List<EventParticipantItemDto> participants = new ArrayList<>();

    @Builder.Default
    private List<EventAttributeItemDto> attributes = new ArrayList<>();

    @Builder.Default
    private List<TimelineEventDto> subEvents = new ArrayList<>();
}