package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "attribute_dictionary_values", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"attribute_definition_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
public class AttributeDictionaryValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "attribute_definition_id", nullable = false)
    private AttributeDefinition attributeDefinition;

    @Column(nullable = false, length = 100)
    private String code;

    @Column(name = "is_system", nullable = false)
    private Boolean isSystem = false;
}