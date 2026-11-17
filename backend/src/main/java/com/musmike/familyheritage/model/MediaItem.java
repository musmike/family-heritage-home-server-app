package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.MediaPrimaryContext;
import com.musmike.familyheritage.model.enums.MediaType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.*;

@Entity
@Table(name = "media_items")
@Getter
@Setter
@NoArgsConstructor
public class MediaItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "media_type", nullable = false, length = 30)
    private MediaType mediaType;

    @Enumerated(EnumType.STRING)
    @Column(name = "primary_context", nullable = false, length = 50)
    private MediaPrimaryContext primaryContext;

    @Column(name = "is_portrait", nullable = false)
    private Boolean isPortrait = false;

    @Column(name = "is_unknown", nullable = false)
    private Boolean isUnknown = false;

    @Column(name = "relative_path", nullable = false, unique = true, length = 700)
    private String relativePath;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    private String title;

    @Column(name = "inscription_text", columnDefinition = "TEXT")
    private String inscriptionText;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "source_text", length = 500)
    private String sourceText;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "date_descriptor_id")
    private DateDescriptor dateDescriptor;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "metadata_date_descriptor_id")
    private DateDescriptor metadataDateDescriptor;

    @Column(name = "metadata_date_source", length = 120)
    private String metadataDateSource;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "collection_id")
    private MediaCollection collection;

    @OneToMany(mappedBy = "mediaItem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    private List<MediaCollectionLink> collectionLinks = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @ManyToMany
    @JoinTable(
            name = "media_persons",
            joinColumns = @JoinColumn(name = "media_id"),
            inverseJoinColumns = @JoinColumn(name = "person_id")
    )
    private Set<Person> persons = new HashSet<>();

    @OneToMany(mappedBy = "mediaItem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<MediaPersonLink> personLinks = new ArrayList<>();

    @OneToMany(mappedBy = "mediaItem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<MediaVersion> versions = new ArrayList<>();

    @ManyToMany
    @JoinTable(
            name = "media_graves",
            joinColumns = @JoinColumn(name = "media_id"),
            inverseJoinColumns = @JoinColumn(name = "grave_id")
    )
    private Set<Grave> graves = new HashSet<>();

    @ManyToMany
    @JoinTable(
            name = "media_events",
            joinColumns = @JoinColumn(name = "media_id"),
            inverseJoinColumns = @JoinColumn(name = "event_id")
    )
    private Set<Event> events = new HashSet<>();

    public List<MediaCollection> getOrderedCollections() {
        List<MediaCollection> ordered = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();
        if (collectionLinks != null) {
            List<MediaCollectionLink> sorted = new ArrayList<>(collectionLinks);
            sorted.sort(Comparator
                    .comparing(MediaCollectionLink::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                    .thenComparing(MediaCollectionLink::getId, Comparator.nullsLast(Long::compareTo)));
            for (MediaCollectionLink link : sorted) {
                MediaCollection c = link.getCollection();
                if (c != null && (c.getId() == null || seenIds.add(c.getId()))) {
                    ordered.add(c);
                }
            }
        }
        if (collection != null && (collection.getId() == null || seenIds.add(collection.getId()))) {
            ordered.addFirst(collection);
        }
        return ordered;
    }

    public MediaCollection getPrimaryCollection() {
        List<MediaCollection> cols = getOrderedCollections();
        return cols.isEmpty() ? null : cols.getFirst();
    }
}