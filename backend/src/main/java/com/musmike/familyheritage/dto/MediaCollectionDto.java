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

    // Start DateDescriptor
    private String startDateType;
    private String startQualifier;
    private Integer startYear;
    private Integer startMonth;
    private Integer startDay;
    private String startTimeQualifier;
    private Integer startHour;
    private Integer startMinute;
    private Integer startSecond;

    // Range / End DateDescriptor
    private Boolean isRange;
    private String endQualifier;
    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;
    private String endTimeQualifier;
    private Integer endHour;
    private Integer endMinute;
    private Integer endSecond;
}
