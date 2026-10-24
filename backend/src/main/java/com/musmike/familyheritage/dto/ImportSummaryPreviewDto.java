package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSummaryPreviewDto {
    private int individualsToCreate;
    private int individualsToUpdate;
    private int individualsUnchanged;
    private int familiesToCreate;
    private int familiesToUpdate;
    private int familiesUnchanged;
    private int familiesToDelete;
    private int absentPersonsCount;
}