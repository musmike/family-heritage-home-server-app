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
public class SpouseFamilyDto {
    private Long familyId;
    private RelatedPersonDto spouse;
    private String statusCode;
    private String weddingDateText;
    private String weddingPlace;

    @Builder.Default
    private List<ChildInFamilyDto> children = new ArrayList<>();
}