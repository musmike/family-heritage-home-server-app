package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.FamilyChildRelationshipType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "family_children", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"family_id", "child_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class FamilyChild {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "family_id", nullable = false)
    private Family family;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "child_id", nullable = false)
    private Person child;

    @Enumerated(EnumType.STRING)
    @Column(name = "father_relationship_type", nullable = false, length = 50)
    private FamilyChildRelationshipType fatherRelationshipType;

    @Enumerated(EnumType.STRING)
    @Column(name = "mother_relationship_type", nullable = false, length = 50)
    private FamilyChildRelationshipType motherRelationshipType;

    public FamilyChild(
            Family family,
            Person child,
            FamilyChildRelationshipType fatherRelationshipType,
            FamilyChildRelationshipType motherRelationshipType
    ) {
        this.family = family;
        this.child = child;
        this.fatherRelationshipType = fatherRelationshipType;
        this.motherRelationshipType = motherRelationshipType;
    }
}