package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ActivityLogItemDto {
    private Long id;
    private String actionType;
    private String actionLabel;
    private String actorUsername;
    private String actorDisplayName;
    private String description;
    private String targetType;
    private Long targetId;
    private String ipAddress;
    private boolean adminOnly;
    private LocalDateTime createdAt;
}