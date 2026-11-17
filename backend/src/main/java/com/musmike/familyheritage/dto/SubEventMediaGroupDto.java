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
public class SubEventMediaGroupDto {
    private Long subEventId;
    private String subEventLabel;
    private String dateText;

    @Builder.Default
    private List<MediaItemDto> media = new ArrayList<>();
}