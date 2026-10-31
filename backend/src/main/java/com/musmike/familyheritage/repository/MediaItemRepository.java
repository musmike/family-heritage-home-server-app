package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.MediaItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MediaItemRepository extends JpaRepository<MediaItem, Long> {
    Optional<MediaItem> findByRelativePath(String relativePath);
    boolean existsByRelativePath(String relativePath);
    List<MediaItem> findByGravesIdOrderByIdAsc(Long graveId);
    List<MediaItem> findByPersonsIdOrderByIdAsc(Long personId);
    List<MediaItem> findByEventsIdOrderByIdAsc(Long eventId);
    List<MediaItem> findByCollectionId(Long collectionId);
    long countByCollectionId(Long collectionId);
}