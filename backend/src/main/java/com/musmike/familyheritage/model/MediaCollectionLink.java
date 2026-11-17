package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "media_collection_links", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"media_id", "collection_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class MediaCollectionLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private MediaItem mediaItem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "collection_id", nullable = false)
    private MediaCollection collection;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public MediaCollectionLink(MediaItem mediaItem, MediaCollection collection, Integer sortOrder) {
        this.mediaItem = mediaItem;
        this.collection = collection;
        this.sortOrder = sortOrder;
    }
}