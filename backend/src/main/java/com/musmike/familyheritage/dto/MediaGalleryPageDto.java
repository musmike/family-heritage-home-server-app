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
public class MediaGalleryPageDto {
    @Builder.Default
    private List<MediaItemDto> content = new ArrayList<>();
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;

    private long totalImagesCount;
    private long totalVideosCount;
    private long totalAudiosCount;

    @Builder.Default
    private List<MediaCollectionDto> collections = new ArrayList<>();
}