package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveCemeteryRequestDto {
    private String name;
    private String managementType;
    private String denomination;
    private String locationName;
    private String description;
}
