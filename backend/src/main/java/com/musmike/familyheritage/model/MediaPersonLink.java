package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.MediaPersonLinkType;
import com.musmike.familyheritage.model.enums.PersonSex;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "media_person_links")
@Getter
@Setter
@NoArgsConstructor
public class MediaPersonLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private MediaItem mediaItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "person_id")
    private Person person;

    @Column(name = "person_text")
    private String personText;

    @Enumerated(EnumType.STRING)
    @Column(name = "person_sex", length = 20)
    private PersonSex personSex;

    @Enumerated(EnumType.STRING)
    @Column(name = "link_type", nullable = false, length = 30)
    private MediaPersonLinkType linkType = MediaPersonLinkType.DEPICTED;

    public MediaPersonLink(MediaItem mediaItem, Person person, MediaPersonLinkType linkType) {
        this.mediaItem = mediaItem;
        this.person = person;
        this.linkType = linkType;
    }

    public MediaPersonLink(
            MediaItem mediaItem,
            String personText,
            PersonSex personSex,
            MediaPersonLinkType linkType
    ) {
        this.mediaItem = mediaItem;
        this.personText = personText;
        this.personSex = personSex;
        this.linkType = linkType;
    }
}