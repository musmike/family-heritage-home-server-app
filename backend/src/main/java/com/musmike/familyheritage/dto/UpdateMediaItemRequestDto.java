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
    private String description;

    // "MANUAL", "METADATA", "EVENT", "UNDATED"
    private String dateSourceMode;
    private Long contextEventId;

    private String dateQualifier;
    private Integer year;
    private Integer month;
    private Integer day;
    private String timeQualifier;
    private Integer hour;
    private Integer minute;
    private Integer second;

    private List<Long> personIds;
    private Long setAsAvatarForPersonId;
    private Integer avatarCropX;
    private Integer avatarCropY;
    private Double avatarCropZoom;
    private Long setAsPrimaryForGraveId;
}