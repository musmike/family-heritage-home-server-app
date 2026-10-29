package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnniversaryItemDto {
    private String id;
    private String type;
    private String typeLabel;
    private Integer month;
    private Integer day;
    private Integer originalYear;
    private String dateText;
    private String annualDateText;
    private LocalDate nextOccurrenceDate;
    private int daysUntil;
    private Integer yearsCount;
    private String locationName;
    private String targetType;
    private Long targetId;
    private Long eventId;

    @Builder.Default
    private List<AnniversaryParticipantDto> participants = new ArrayList<>();
}