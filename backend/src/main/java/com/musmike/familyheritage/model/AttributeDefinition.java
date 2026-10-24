package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "attribute_definitions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_code_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
public class AttributeDefinition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_code_id")
    private UserCode userCode;

    @Column(nullable = false, length = 100)
    private String code;

    @Column(nullable = false, length = 30)
    private String dataType;

    @Column(name = "is_system", nullable = false)
    private Boolean isSystem = false;
}