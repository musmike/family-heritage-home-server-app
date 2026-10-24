package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "family_external_ids", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"source_system", "uid_value"})
})
@Getter
@Setter
@NoArgsConstructor
public class FamilyExternalId {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "family_id", nullable = false)
    private Family family;

    @Column(name = "uid_value", nullable = false, length = 100)
    private String uidValue;

    @Column(name = "source_system", nullable = false, length = 100)
    private String sourceSystem;

    public FamilyExternalId(Family family, String uidValue, String sourceSystem) {
        this.family = family;
        this.uidValue = uidValue;
        this.sourceSystem = sourceSystem;
    }
}
