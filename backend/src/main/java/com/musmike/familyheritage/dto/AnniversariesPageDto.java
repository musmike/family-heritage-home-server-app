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
public class AnniversariesPageDto {
    @Builder.Default
    private List<AnniversaryItemDto> content = new ArrayList<>();
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
}