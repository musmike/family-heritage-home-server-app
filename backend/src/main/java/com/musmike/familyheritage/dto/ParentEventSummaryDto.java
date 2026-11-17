package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParentEventSummaryDto {
    private Long eventId;
    private String label;
    private String typeLabel;
    private String title;
    private String dateText;
    private String locationName;
    private String participantsSummary;
    private boolean primaryFolderParent;
}