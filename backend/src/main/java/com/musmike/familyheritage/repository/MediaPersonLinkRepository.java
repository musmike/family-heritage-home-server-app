package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.MediaPersonLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MediaPersonLinkRepository extends JpaRepository<MediaPersonLink, Long> {
    List<MediaPersonLink> findByMediaItemIdOrderByIdAsc(Long mediaId);
    List<MediaPersonLink> findByPersonIdOrderByIdAsc(Long personId);
}