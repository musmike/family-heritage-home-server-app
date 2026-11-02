package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.PersonSex;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_participants")
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
    @JoinColumn(name = "person_id")
    private Person person;

    @Column(name = "participant_text")
    private String participantText;

    @Enumerated(EnumType.STRING)
    @Column(name = "participant_sex", length = 20)
    private PersonSex participantSex;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_type_participant_role_id", nullable = false)
    private EventTypeParticipantRole role;

    public EventParticipant(Event event, Person person, EventTypeParticipantRole role) {
        this.event = event;
        this.person = person;
        this.role = role;
    }

    public EventParticipant(
            Event event,
            String participantText,
            PersonSex participantSex,
            EventTypeParticipantRole role
    ) {
        this.event = event;
        this.participantText = participantText;
        this.participantSex = participantSex;
        this.role = role;
    }
}