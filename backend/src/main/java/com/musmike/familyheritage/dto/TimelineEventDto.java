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
    private String folderSlug;
    private String suggestedFolderSlug;

    private Long parentEventId;
    private String parentEventLabel;

    @Builder.Default
    private List<ParentEventSummaryDto> parentEvents = new ArrayList<>();

    private Integer year;
    private String dateText;
    private String locationName;

    // Start DateDescriptor (SINGLE or RANGE "between A and B")
    private String startDateType;
    private String startQualifier;
    private Integer startYear;
    private Integer startMonth;
    private Integer startDay;
    private String startTimeQualifier;
    private Integer startHour;
    private Integer startMinute;
    private Integer startSecond;

    private String startRangeEndQualifier;
    private Integer startRangeEndYear;
    private Integer startRangeEndMonth;
    private Integer startRangeEndDay;
    private String startRangeEndTimeQualifier;
    private Integer startRangeEndHour;
    private Integer startRangeEndMinute;
    private Integer startRangeEndSecond;

    // End DateDescriptor (when event spans a period "from ... to ...")
    private boolean hasEndDate;
    private String endDateType;
    private String endQualifier;
    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;
    private String endTimeQualifier;
    private Integer endHour;
    private Integer endMinute;
    private Integer endSecond;

    private String endRangeEndQualifier;
    private Integer endRangeEndYear;
    private Integer endRangeEndMonth;
    private Integer endRangeEndDay;
    private String endRangeEndTimeQualifier;
    private Integer endRangeEndHour;
    private Integer endRangeEndMinute;
    private Integer endRangeEndSecond;

    @Builder.Default
    private List<EventParticipantItemDto> participants = new ArrayList<>();

    @Builder.Default
    private List<EventAttributeItemDto> attributes = new ArrayList<>();

    @Builder.Default
    private List<TimelineEventDto> subEvents = new ArrayList<>();
}