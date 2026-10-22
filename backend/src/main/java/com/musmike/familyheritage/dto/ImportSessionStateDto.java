package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSessionStateDto {
    private ParsedGedcomFileDto parsedFile;

    @Builder.Default
    private List<IndividualMatchResultDto> individualMatches = new ArrayList<>();

    @Builder.Default
    private List<FamilyMatchResultDto> familyMatches = new ArrayList<>();

    @Builder.Default
    private List<AbsentPersonReviewDto> absentPeople = new ArrayList<>();

    private ImportSummaryPreviewDto summaryPreview;

    @Builder.Default
    private Map<String, Long> resolvedPersonIds = new HashMap<>();

    @Builder.Default
    private Map<String, Long> resolvedFamilyIds = new HashMap<>();
}