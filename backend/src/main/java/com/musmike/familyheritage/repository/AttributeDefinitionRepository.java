package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.AttributeDefinition;
import com.musmike.familyheritage.model.UserCode;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AttributeDefinitionRepository extends JpaRepository<AttributeDefinition, Long> {
    Optional<AttributeDefinition> findByUserCodeAndCode(UserCode userCode, String code);
}
