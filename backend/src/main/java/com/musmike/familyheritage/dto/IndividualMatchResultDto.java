package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.DecisionAction;
import com.musmike.familyheritage.model.enums.MatchClassification;
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
public class IndividualMatchResultDto {
    private ParsedGedcomIndividualDto gedcomIndividual;
    private MatchClassification classification;
    private DecisionAction selectedAction;
    private Long selectedTargetPersonId;

    @Builder.Default
    private List<PersonMatchCandidateDto> candidates = new ArrayList<>();
}