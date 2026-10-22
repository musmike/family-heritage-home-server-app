package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.AbsentPersonAction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AbsentPersonDecisionDto {
    private Long personId;
    private AbsentPersonAction action;
}