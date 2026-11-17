package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.MediaVersionType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "media_versions")
@Getter
@Setter
@NoArgsConstructor
public class MediaVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private MediaItem mediaItem;

    @Enumerated(EnumType.STRING)
    @Column(name = "version_type", nullable = false, length = 40)
    private MediaVersionType versionType = MediaVersionType.ORIGINAL;

    @Column(name = "version_label", nullable = false, length = 150)
    private String versionLabel;

    @Column(name = "relative_path", nullable = false, unique = true, length = 700)
    private String relativePath;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "is_main", nullable = false)
    private Boolean isMain = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}