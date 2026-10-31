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
    private String title;
    private String description;
    private List<Long> personIds;
    private Long setAsAvatarForPersonId;
    private Integer avatarCropX;
    private Integer avatarCropY;
    private Double avatarCropZoom;
    private Long setAsPrimaryForGraveId;
}