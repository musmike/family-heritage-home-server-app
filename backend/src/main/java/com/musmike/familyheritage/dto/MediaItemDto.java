package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.MediaPrimaryContext;
import com.musmike.familyheritage.model.enums.MediaType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaItemDto {
    private Long id;
    private MediaType mediaType;
    private MediaPrimaryContext primaryContext;
    private boolean portrait;
    private boolean unknownMedia;
    private String relativePath;
    private String directoryPath;
    private String fileName;
    private String mimeType;
    private Long fileSize;
    private String title;
    private String inscriptionText;
    private String description;
    private String sourceText;

    // Effective Date & Time
    private String dateType;
    private boolean betweenRange;
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

    private String dateText;
    private LocalDateTime sortDateTime;

    // Primary stored Metadata Date & Time (always EXACT)
    private Integer metadataYear;
    private Integer metadataMonth;
    private Integer metadataDay;
    private Integer metadataHour;
    private Integer metadataMinute;
    private Integer metadataSecond;
    private String metadataDateText;
    private String metadataDateSource;

    @Builder.Default
    private List<MetadataDateOptionDto> availableMetadataDates = new ArrayList<>();

    private Long collectionId;
    private String collectionName;
    private boolean datedCollectionItem;
    private Integer collectionStartYear;
    private LocalDateTime createdAt;

    @Builder.Default
    private List<Long> personIds = new ArrayList<>();

    @Builder.Default
    private List<String> personNames = new ArrayList<>();

    @Builder.Default
    private List<MediaPersonLinkDto> depictedPersons = new ArrayList<>();

    @Builder.Default
    private List<MediaPersonLinkDto> relatedPersons = new ArrayList<>();

    @Builder.Default
    private List<MediaPersonLinkDto> authors = new ArrayList<>();

    @Builder.Default
    private List<MediaVersionDto> versions = new ArrayList<>();

    @Builder.Default
    private List<Long> graveIds = new ArrayList<>();

    @Builder.Default
    private List<String> cemeteryNames = new ArrayList<>();

    @Builder.Default
    private List<Long> graveCemeteryIds = new ArrayList<>();

    @Builder.Default
    private List<String> graveLabels = new ArrayList<>();

    @Builder.Default
    private List<Long> eventIds = new ArrayList<>();

    @Builder.Default
    private List<String> eventLabels = new ArrayList<>();

    @Builder.Default
    private List<Integer> eventStartYears = new ArrayList<>();

    @Builder.Default
    private List<Long> rootEventIds = new ArrayList<>();

    @Builder.Default
    private List<String> rootEventLabels = new ArrayList<>();

    @Builder.Default
    private List<Integer> rootEventStartYears = new ArrayList<>();

    private Long subEventId;
    private String subEventLabel;
}