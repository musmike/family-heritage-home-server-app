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
public class UpdateEventDetailsRequestDto {
    private String title;
    private String description;
    private String folderSlug;
    private Long parentEventId;
    private List<Long> parentEventIds;
}