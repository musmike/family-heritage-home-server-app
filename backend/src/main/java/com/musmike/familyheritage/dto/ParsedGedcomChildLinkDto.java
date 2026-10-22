package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParsedGedcomChildLinkDto {
    private String childGedRefId;
    private String rawPedigree;
    private String rawAdoptedBy;
}