package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.GraveType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "graves")
@Getter
@Setter
@NoArgsConstructor
public class Grave {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cemetery_id")
    private Cemetery cemetery;

    @Column(length = 100)
    private String section;

    @Column(length = 100)
    private String sector;

    @Column(name = "row_number", length = 100)
    private String rowNumber;

    @Column(name = "grave_number", length = 100)
    private String graveNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "grave_type", length = 50)
    private GraveType graveType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "TEXT")
    private String epitaph;

    public boolean isCustomizedByAdmin() {
        return cemetery != null
                || hasText(section)
                || hasText(sector)
                || hasText(rowNumber)
                || hasText(graveNumber)
                || graveType != null
                || hasText(description)
                || hasText(epitaph);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
