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

    // "NO_CHANGE", "MANUAL", "METADATA", "EVENT", "UNDATED"
    private String dateSourceMode;
    private String dateQualifier;
    private Integer year;
    private Integer month;
    private Integer day;
    private String timeQualifier;
    private Integer hour;
    private Integer minute;
    private Integer second;
}