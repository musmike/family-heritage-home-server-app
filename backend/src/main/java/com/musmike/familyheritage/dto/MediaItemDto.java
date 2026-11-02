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
    private String fileName;
    private String mimeType;
    private Long fileSize;
    private String title;
    private String description;

    private Integer year;
    private Integer month;
    private Integer day;
    private Integer hour;
    private Integer minute;
    private String dateText;

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