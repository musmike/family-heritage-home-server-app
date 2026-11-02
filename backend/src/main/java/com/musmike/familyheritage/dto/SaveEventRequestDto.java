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
public class SaveEventRequestDto {
    @Builder.Default
    private List<String> typeCodes = new ArrayList<>();

    private String title;
    private String description;
    private Long parentEventId;
    private String locationName;

    private String startQualifier;
    private Integer startYear;
    private Integer startMonth;
    private Integer startDay;
    private String startTimeQualifier;
    private Integer startHour;
    private Integer startMinute;

    private Boolean isRange;
    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;
    private String endTimeQualifier;
    private Integer endHour;
    private Integer endMinute;

    @Builder.Default
    private List<SaveEventParticipantRequestDto> participants = new ArrayList<>();
}