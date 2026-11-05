package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateMediaItemRequestDto {
    private String fileName;
    private String customFolderName;
    private String title;
    private String inscriptionText;
    private String description;
    private String sourceText;
    private Boolean portrait;
    private Boolean groupPortrait;
    private Boolean unknownMedia;
    private Long collectionId;
    private List<Long> collectionIds;

    // "MANUAL", "METADATA", "EVENT", "UNDATED"
    private String dateSourceMode;
    private String selectedMetadataSourceTag;
    private Long contextEventId;

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

    private List<Long> personIds;
    private List<SaveMediaPersonLinkRequestDto> personLinks;

    private Long setAsAvatarForPersonId;
    private Integer avatarCropX;
    private Integer avatarCropY;
    private Double avatarCropZoom;
    private Long setAsPrimaryForGraveId;
}