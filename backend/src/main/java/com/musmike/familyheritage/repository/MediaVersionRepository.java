package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.MediaVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MediaVersionRepository extends JpaRepository<MediaVersion, Long> {
    List<MediaVersion> findByMediaItemIdOrderByIdAsc(Long mediaId);
    boolean existsByRelativePath(String relativePath);
}