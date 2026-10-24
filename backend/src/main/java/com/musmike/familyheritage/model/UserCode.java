package com.musmike.familyheritage.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import jakarta.persistence.*;

@Entity
@Table(name = "user_codes", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"category", "code"})
})
@Getter
@Setter
@NoArgsConstructor
public class UserCode {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String category;

    @Column(nullable = false, length = 100)
    private String code;

    @Column(name = "is_system", nullable = false)
    private Boolean isSystem = false;

    public UserCode(String category, String code, Boolean isSystem) {
        this.category = category;
        this.code = code;
        this.isSystem = isSystem;
    }
}