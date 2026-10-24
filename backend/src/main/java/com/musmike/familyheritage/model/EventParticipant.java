package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_participants", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"event_id", "person_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class EventParticipant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_type_participant_role_id", nullable = false)
    private EventTypeParticipantRole role;

    public EventParticipant(Event event, Person person, EventTypeParticipantRole role) {
        this.event = event;
        this.person = person;
        this.role = role;
    }
}