package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "person_external_ids")
@Getter
@Setter
@NoArgsConstructor
public class PersonExternalId {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @Column(name = "uid_value", nullable = false, unique = true, length = 100)
    private String uidValue;

    @Column(name = "source_system", length = 100)
    private String sourceSystem;

    public PersonExternalId(Person person, String uidValue, String sourceSystem) {
        this.person = person;
        this.uidValue = uidValue;
        this.sourceSystem = sourceSystem;
    }
}