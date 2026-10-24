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
public class ParsedGedcomFileDto {
    private String sourceSystem;

    @Builder.Default
    private List<ParsedGedcomIndividualDto> individuals = new ArrayList<>();

    @Builder.Default
    private List<ParsedGedcomFamilyDto> families = new ArrayList<>();
}