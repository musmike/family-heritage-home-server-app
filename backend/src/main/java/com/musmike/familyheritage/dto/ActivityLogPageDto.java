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
public class ActivityLogPageDto {
    @Builder.Default
    private List<ActivityLogItemDto> content = new ArrayList<>();
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;

    @Builder.Default
    private List<ActivityTypeOptionDto> availableTypes = new ArrayList<>();

    @Builder.Default
    private List<String> availableActors = new ArrayList<>();
}