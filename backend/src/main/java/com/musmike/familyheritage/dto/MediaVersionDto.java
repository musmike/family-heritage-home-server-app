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
public class MediaVersionDto {
    private Long id;
    private Long mediaId;
    private String versionType;
    private String versionLabel;
    private String relativePath;
    private String fileName;
    private String mimeType;
    private Long fileSize;
    private boolean main;
    private boolean reverseSide;
    private LocalDateTime createdAt;
}