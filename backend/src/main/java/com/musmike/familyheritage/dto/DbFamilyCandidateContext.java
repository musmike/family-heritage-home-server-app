package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashSet;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DbFamilyCandidateContext {
    private Long familyId;
    private Long husbandPersonId;
    private String husbandName;
    private Long wifePersonId;
    private String wifeName;
    private Integer weddingYear;
    private String lastGedRefId;

    @Builder.Default
    private Set<String> externalUids = new HashSet<>();

    @Builder.Default
    private Set<Long> childPersonIds = new HashSet<>();
}