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
public class PersonMatchCandidateDto {
    private Long personId;
    private String givenName;
    private String surname;
    private Integer birthYear;
    private Integer deathYear;
    private boolean archived;
    private int confidenceScore;

    @Builder.Default
    private List<String> matchReasons = new ArrayList<>();
}