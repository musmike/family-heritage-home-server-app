package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaCollectionDto {
    private Long id;
    private String name;
    private String slug;
    private String description;
    private Long parentCollectionId;
    private String parentCollectionName;
    private boolean datedCollection;
    private String dateText;
    private Long founderPersonId;
    private String founderPersonName;
    private Long previewMediaId;
    private long mediaCount;
    private LocalDateTime createdAt;

    // Start Date Descriptor
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

    // End Date Descriptor
    private Boolean isRange;
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
}