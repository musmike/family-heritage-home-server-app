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
public class GraveGroupDto {
    private Long graveId;
    private Long cemeteryLocationId;
    private String cemeteryName;

    @Builder.Default
    private List<BurialPersonItemDto> burials = new ArrayList<>();
}