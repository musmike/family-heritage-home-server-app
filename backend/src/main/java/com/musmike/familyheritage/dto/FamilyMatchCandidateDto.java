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
public class FamilyMatchCandidateDto {
    private Long familyId;
    private String husbandName;
    private String wifeName;
    private Integer weddingYear;
    private int confidenceScore;

    @Builder.Default
    private List<String> matchReasons = new ArrayList<>();
}