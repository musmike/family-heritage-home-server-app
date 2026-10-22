package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.ImportSessionStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "gedcom_import_sessions")
@Getter
@Setter
@NoArgsConstructor
public class GedcomImportSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "file_name")
    private String fileName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ImportSessionStatus status;

    @Column(name = "source_system", length = 100)
    private String sourceSystem;

    @Column(name = "session_data", nullable = false, columnDefinition = "TEXT")
    private String sessionData;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}