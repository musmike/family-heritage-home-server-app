package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "person_names")
@Getter
@Setter
@NoArgsConstructor
public class PersonName {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @Column(nullable = false, length = 50)
    private String type;

    private String givenName;

    private String surname;

    @Column(name = "is_current", nullable = false)
    private Boolean isCurrent = false;

    public PersonName(Person person, String type, String givenName,
                      String surname, Boolean isCurrent) {
        this.person = person;
        this.type = type;
        this.givenName = givenName;
        this.surname = surname;
        this.isCurrent = isCurrent;
    }
}