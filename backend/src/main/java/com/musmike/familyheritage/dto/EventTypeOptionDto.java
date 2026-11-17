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
public class EventTypeOptionDto {
    private String code;
    private String label;
    private boolean system;

    @Builder.Default
    private List<String> allowedRoleCodes = new ArrayList<>();
}