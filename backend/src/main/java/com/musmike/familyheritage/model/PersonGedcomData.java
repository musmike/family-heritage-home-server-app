package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "person_gedcom_data")
@Data
@NoArgsConstructor
public class PersonGedcomData {
    @Id
    private Long personId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "person_id")
    private Person person;

    @Column(length = 100)
    private String gedUid;   // MyHeritage _UID

    @Column(nullable = false, length = 100)
    private String gedRefId; // @I1@

    private String rawGivenName;
    private String rawSurname;

    @Column(length = 1)
    private String rawSex;

    private Boolean rawDeathIndicated = false;

    private String rawBirthDate;
    private String rawBirthPlace;
    private String rawDeathDate;
    private String rawDeathPlace;
    private String rawCauseOfDeath;
    private String rawBurialPlace;

    private LocalDateTime lastImportedAt;
}