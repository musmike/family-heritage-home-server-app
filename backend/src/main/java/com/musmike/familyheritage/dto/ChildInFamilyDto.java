package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.FamilyChildRelationshipType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChildInFamilyDto {
    private RelatedPersonDto person;
    private FamilyChildRelationshipType fatherRelationshipType;
    private FamilyChildRelationshipType motherRelationshipType;
}