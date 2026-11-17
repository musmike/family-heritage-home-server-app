package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_collection_links", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"event_id", "collection_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class EventCollectionLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "collection_id", nullable = false)
    private MediaCollection collection;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public EventCollectionLink(Event event, MediaCollection collection, Integer sortOrder) {
        this.event = event;
        this.collection = collection;
        this.sortOrder = sortOrder;
    }
}