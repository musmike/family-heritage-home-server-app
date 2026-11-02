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
    private String relativePath;
    private String directoryPath;
    private String fileName;
    private String mimeType;
    private Long fileSize;
    private String title;
    private String description;

    // Effective Date & Time
    private String dateQualifier;
    private Integer year;
    private Integer month;
    private Integer day;
    private String timeQualifier;
    private Integer hour;
    private Integer minute;
    private Integer second;
    private String dateText;
    private LocalDateTime sortDateTime;

    // Original File Metadata Date & Time (from 2nd DateDescriptor + source tag)
    private Integer metadataYear;
    private Integer metadataMonth;
    private Integer metadataDay;
    private Integer metadataHour;
    private Integer metadataMinute;
    private Integer metadataSecond;
    private String metadataDateText;
    private String metadataDateSource;

    private Long collectionId;
    private String collectionName;
    private LocalDateTime createdAt;

    @Builder.Default
    private List<Long> personIds = new ArrayList<>();

    @Builder.Default
    private List<String> personNames = new ArrayList<>();

    @Builder.Default
    private List<Long> graveIds = new ArrayList<>();

    @Builder.Default
    private List<String> cemeteryNames = new ArrayList<>();

    @Builder.Default
    private List<Long> eventIds = new ArrayList<>();

    @Builder.Default
    private List<String> eventLabels = new ArrayList<>();
}