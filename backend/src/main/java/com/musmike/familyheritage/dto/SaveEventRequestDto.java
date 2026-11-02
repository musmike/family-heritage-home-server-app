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
public class SaveEventRequestDto {
    @Builder.Default
    private List<String> typeCodes = new ArrayList<>();

    private String title;
    private String description;
    private String folderSlug;

    private Long parentEventId;

    @Builder.Default
    private List<Long> parentEventIds = new ArrayList<>();

    private String locationName;

    // Start DateDescriptor (SINGLE or RANGE "between A and B")
    private Boolean isStartBetweenRange;
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

    // End DateDescriptor (when event spans "from startDate to endDate", or legacy isRange)
    private Boolean isRange;
    private Boolean hasEndDate;
    private Boolean isEndBetweenRange;
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
    private List<SaveEventParticipantRequestDto> participants = new ArrayList<>();
}