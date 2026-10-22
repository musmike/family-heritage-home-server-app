package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.DecisionAction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IndividualDecisionDto {
    private String gedRefId;
    private DecisionAction action;
    private Long targetPersonId;
}