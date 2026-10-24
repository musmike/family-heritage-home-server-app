package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.AttributeDefinition;
import com.musmike.familyheritage.model.AttributeDictionaryValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface AttributeDictionaryValueRepository extends JpaRepository<AttributeDictionaryValue, Long> {
    Optional<AttributeDictionaryValue> findByAttributeDefinitionAndCode(AttributeDefinition definition, String code);

    @Modifying
    @Query(value = "DELETE FROM attribute_dictionary_values adv WHERE NOT EXISTS " +
            "(SELECT 1 FROM event_attribute_values eav " +
            "WHERE eav.attribute_dictionary_value_id = adv.id)", nativeQuery = true)
    void deleteOrphanValues();
}
