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
public class SaveMediaPersonLinkRequestDto {
    private Long personId;
    private String personText;
    private PersonSex personSex;
    // "DEPICTED", "RELATED", "AUTHOR"
    private String linkType;
}