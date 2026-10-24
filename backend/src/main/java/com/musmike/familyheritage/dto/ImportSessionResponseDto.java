package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSessionResponseDto {
    private Long sessionId;
    private String fileName;
    private ImportSessionStatus status;
    private String sourceSystem;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Builder.Default
    private List<IndividualMatchResultDto> individualMatches = new ArrayList<>();

    @Builder.Default
    private List<FamilyMatchResultDto> familyMatches = new ArrayList<>();

    @Builder.Default
    private List<AbsentPersonReviewDto> absentPeople = new ArrayList<>();

    private ImportSummaryPreviewDto summaryPreview;
}