package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaCollectionDto {
    private Long id;
    private String name;
    private String slug;
    private String description;
    private Long founderPersonId;
    private String founderPersonName;
    private long mediaCount;
    private LocalDateTime createdAt;
}