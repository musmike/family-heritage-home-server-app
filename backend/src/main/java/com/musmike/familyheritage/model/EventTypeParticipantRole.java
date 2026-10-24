package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_type_participant_roles", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"event_type_id", "participant_role_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class EventTypeParticipantRole {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "event_type_id", nullable = false)
    private UserCode eventType;

    @ManyToOne
    @JoinColumn(name = "participant_role_id", nullable = false)
    private UserCode participantRole;

    public EventTypeParticipantRole(UserCode eventType, UserCode participantRole) {
        this.eventType = eventType;
        this.participantRole = participantRole;
    }
}