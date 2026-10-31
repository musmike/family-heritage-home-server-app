package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveMediaCollectionRequestDto {
    private String name;
    private String customSlug;
    private String description;
    private Long founderPersonId;
}