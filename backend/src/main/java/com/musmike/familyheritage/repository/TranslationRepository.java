package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Translation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TranslationRepository extends JpaRepository<Translation, Long> {
    List<Translation> findByTableNameAndLanguageCode(String tableName, String languageCode);
}