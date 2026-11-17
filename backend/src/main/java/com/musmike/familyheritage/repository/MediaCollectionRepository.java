package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.MediaCollection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MediaCollectionRepository extends JpaRepository<MediaCollection, Long> {
    Optional<MediaCollection> findBySlug(String slug);
}