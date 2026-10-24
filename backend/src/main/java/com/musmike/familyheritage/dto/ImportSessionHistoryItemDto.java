package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSessionHistoryItemDto {
    private Long sessionId;
    private String fileName;
    private ImportSessionStatus status;
    private String sourceSystem;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private ImportSummaryPreviewDto summaryPreview;
}