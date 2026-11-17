package com.musmike.familyheritage.dto;

import com.musmike.familyheritage.model.enums.PersonSex;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaPersonLinkDto {
    private Long linkId;
    private Long personId;
    private String personText;
    private String displayName;
    private PersonSex sex;
    private String linkType;
}