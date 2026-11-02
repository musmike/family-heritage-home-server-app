package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_parent_links", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"child_event_id", "parent_event_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class EventParentLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "child_event_id", nullable = false)
    private Event childEvent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parent_event_id", nullable = false)
    private Event parentEvent;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public EventParentLink(Event childEvent, Event parentEvent, Integer sortOrder) {
        this.childEvent = childEvent;
        this.parentEvent = parentEvent;
        this.sortOrder = sortOrder;
    }
}