package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.LifeState;
import com.musmike.familyheritage.model.enums.PersonSex;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "people")
@Getter
@Setter
@NoArgsConstructor
public class Person {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String cachedGivenName;
    private String cachedSurname;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private PersonSex sex;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private LifeState lifeState = LifeState.UNKNOWN;

    @Column(name = "is_archived", nullable = false)
    private Boolean isArchived = false;

    @OneToOne(mappedBy = "person", cascade = CascadeType.ALL, orphanRemoval = true)
    private PersonGedcomData gedcomData;

    @OneToMany(mappedBy = "person", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<PersonExternalId> externalIds = new HashSet<>();

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "birth_event_id")
    private Event birthEvent;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "death_event_id")
    private Event deathEvent;

    public void addExternalId(String uidValue, String sourceSystem) {
        if (uidValue == null || uidValue.isBlank()) {
            return;
        }
        String normalizedSource = (sourceSystem == null || sourceSystem.isBlank())
                ? "UNKNOWN"
                : sourceSystem.trim();
        boolean alreadyExists = externalIds.stream()
                .anyMatch(ext -> uidValue.equals(ext.getUidValue())
                        && normalizedSource.equalsIgnoreCase(ext.getSourceSystem()));
        if (!alreadyExists) {
            externalIds.add(new PersonExternalId(this, uidValue, normalizedSource));
        }
    }

}