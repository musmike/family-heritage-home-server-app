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

    @Builder.Default
    private List<String> assignedTypeCodes = new ArrayList<>();

    @Builder.Default
    private List<String> assignedTypeLabels = new ArrayList<>();

    private String title;
    private String description;
    private Long parentEventId;
    private String parentEventLabel;

    private Integer year;
    private String dateText;
    private String locationName;

    // Raw date & time fields for editing
    private String startDateType;
    private String startQualifier;
    private Integer startYear;
    private Integer startMonth;
    private Integer startDay;
    private String startTimeQualifier;
    private Integer startHour;
    private Integer startMinute;

    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;
    private String endTimeQualifier;
    private Integer endHour;
    private Integer endMinute;

    @Builder.Default
    private List<EventParticipantItemDto> participants = new ArrayList<>();

    @Builder.Default
    private List<EventAttributeItemDto> attributes = new ArrayList<>();

    @Builder.Default
    private List<TimelineEventDto> subEvents = new ArrayList<>();
}