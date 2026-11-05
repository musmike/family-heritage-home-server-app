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
public class BulkUpdateMediaRequestDto {
    @Builder.Default
    private List<Long> mediaIds = new ArrayList<>();

    private String baseFileNameStem;
    private String customFolderName;
    private Long contextEventId;
    private Long targetCollectionId;
    private List<Long> targetCollectionIds;

    // "NO_CHANGE", "REGULAR", "PORTRAIT_SINGLE", "PORTRAIT_GROUP", "UNKNOWN"
    private String categoryMode;

    private String title;
    private String sourceText;
    private String inscriptionText;
    private String description;
    private List<SaveMediaPersonLinkRequestDto> personLinks;

    // "NO_CHANGE", "MANUAL", "METADATA", "EVENT", "UNDATED"
    private String dateSourceMode;
    private String selectedMetadataSourceTag;

    private Boolean isBetweenRange;
    private String dateQualifier;
    private Integer year;
    private Integer month;
    private Integer day;
    private String timeQualifier;
    private Integer hour;
    private Integer minute;
    private Integer second;

    private String rangeEndQualifier;
    private Integer rangeEndYear;
    private Integer rangeEndMonth;
    private Integer rangeEndDay;
    private String rangeEndTimeQualifier;
    private Integer rangeEndHour;
    private Integer rangeEndMinute;
    private Integer rangeEndSecond;
}