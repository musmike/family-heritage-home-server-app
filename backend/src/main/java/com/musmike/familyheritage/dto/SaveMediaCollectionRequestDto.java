package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveMediaCollectionRequestDto {
    private String name;
    private String customSlug;
    private String description;
    private Long parentCollectionId;
    private Boolean datedCollection;
    private Long founderPersonId;

    // Start Date Descriptor (SINGLE or RANGE "between A and B")
    private Boolean isStartBetweenRange;
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

    // End Date Descriptor (when dated album spans a period "from ... to ...")
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
}