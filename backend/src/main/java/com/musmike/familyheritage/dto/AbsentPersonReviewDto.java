package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.AbsentPersonAction;
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
public class AbsentPersonReviewDto {
    private Long personId;
    private String givenName;
    private String surname;
    private Integer birthYear;
    private Integer deathYear;
    private AbsentPersonAction selectedAction;

    @Builder.Default
    private boolean canBeDeleted = true;

    @Builder.Default
    private List<String> deletionBlockReasons = new ArrayList<>();
}