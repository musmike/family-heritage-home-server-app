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
public class ParsedGedcomFamilyDto {
    private String gedRefId;
    private String gedUid;
    private String husbandGedRefId;
    private String wifeGedRefId;
    private String weddingDate;
    private String weddingPlace;
    private String statusCode;

    @Builder.Default
    private List<ParsedGedcomChildLinkDto> children = new ArrayList<>();
}