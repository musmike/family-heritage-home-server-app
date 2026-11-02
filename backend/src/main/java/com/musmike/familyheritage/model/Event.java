package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "events")
@Getter
@Setter
@NoArgsConstructor
public class Event {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "type_id", nullable = false)
    private UserCode eventType;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "event_assigned_types",
            joinColumns = @JoinColumn(name = "event_id"),
            inverseJoinColumns = @JoinColumn(name = "user_code_id")
    )
    private Set<UserCode> assignedTypes = new HashSet<>();

    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_event_id")
    private Event parentEvent;

    @OneToMany(mappedBy = "parentEvent", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Event> subEvents = new HashSet<>();

    private LocalDateTime cachedStartSortDateTime;
    private LocalDateTime cachedEndSortDateTime;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "start_date_id")
    private DateDescriptor startDate;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "end_date_id")
    private DateDescriptor endDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "main_location_id")
    private Location mainLocation;

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<EventParticipant> participants = new HashSet<>();

    public void addParticipant(EventParticipant participant) {
        participants.add(participant);
        participant.setEvent(this);
    }

    public Set<UserCode> getAllEventTypes() {
        Set<UserCode> all = new LinkedHashSet<>();
        if (eventType != null) {
            all.add(eventType);
        }
        if (assignedTypes != null) {
            all.addAll(assignedTypes);
        }
        return all;
    }
}