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
public class LinkExistingMediaRequestDto {
    @Builder.Default
    private List<Long> mediaIds = new ArrayList<>();
    private Long graveId;
    private Long personId;
    private Long eventId;
    private Long collectionId;
    private List<Long> collectionIds;
}