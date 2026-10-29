package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.CemeteryDenomination;
import com.musmike.familyheritage.model.enums.CemeteryManagementType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cemeteries")
@Getter
@Setter
@NoArgsConstructor
public class Cemetery {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "management_type", length = 50)
    private CemeteryManagementType managementType;

    @Enumerated(EnumType.STRING)
    @Column(name = "denomination", length = 50)
    private CemeteryDenomination denomination;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id")
    private Location location;
}
