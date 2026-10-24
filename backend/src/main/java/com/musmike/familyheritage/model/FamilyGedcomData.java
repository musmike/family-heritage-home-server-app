package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "family_gedcom_data")
@Data
@NoArgsConstructor
public class FamilyGedcomData {
    @Id
    private Long familyId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "family_id")
    private Family family;

    @Column(length = 100)
    private String gedUid;   // MyHeritage _UID

    @Column(nullable = false, length = 100)
    private String gedRefId; // @F1@

    @Column(length = 100)
    private String rawHusbandRefId;

    @Column(length = 100)
    private String rawWifeRefId;

    private String rawWeddingDate;

    private String rawWeddingPlace;

    @Column(length = 100)
    private String rawStatus;

    private LocalDateTime lastImportedAt;

    @OneToMany(mappedBy = "familyGedcomData", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<FamilyChildGedcomData> children = new HashSet<>();

    public void addChild(FamilyChildGedcomData child) {
        children.add(child);
        child.setFamilyGedcomData(this);
    }

    public void removeChild(FamilyChildGedcomData child) {
        children.remove(child);
        child.setFamilyGedcomData(null);
    }
}