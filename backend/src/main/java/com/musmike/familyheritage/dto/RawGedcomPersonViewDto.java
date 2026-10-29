package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RawGedcomPersonViewDto {
    private String gedRefId;
    private String gedUid;
    private String rawGivenName;
    private String rawSurname;
    private String rawSex;
    private Boolean rawDeathIndicated;
    private String rawBirthDate;
    private String rawBirthPlace;
    private String rawDeathDate;
    private String rawDeathPlace;
    private String rawCauseOfDeath;
    private String rawBurialPlace;
    private LocalDateTime lastImportedAt;

    @Builder.Default
    private List<ExternalIdDto> externalIds = new ArrayList<>();
}