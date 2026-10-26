package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "translations", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"table_name", "record_id", "field_name", "language_code"})
})
@Getter
@Setter
@NoArgsConstructor
public class Translation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "table_name", nullable = false, length = 70)
    private String tableName;

    @Column(name = "record_id", nullable = false)
    private Long recordId;

    @Column(name = "field_name", nullable = false, length = 70)
    private String fieldName;

    @Column(name = "language_code", nullable = false, length = 10)
    private String languageCode;

    @Column(name = "value", nullable = false)
    private String value;

    public Translation(String tableName, Long recordId, String fieldName, String languageCode, String value) {
        this.tableName = tableName;
        this.recordId = recordId;
        this.fieldName = fieldName;
        this.languageCode = languageCode;
        this.value = value;
    }
}