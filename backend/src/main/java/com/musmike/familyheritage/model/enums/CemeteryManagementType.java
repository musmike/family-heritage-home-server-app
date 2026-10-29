package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum CemeteryManagementType {
    PARISH("Parafialny"),
    MUNICIPAL("Komunalny"),
    MILITARY("Wojskowy"),
    DENOMINATIONAL("Wyznaniowy (gminy wyznaniowej)"),
    PRIVATE("Prywatny / Rodzinny"),
    STATE("Państwowy"),
    OTHER("Inny");

    private final String label;

    CemeteryManagementType(String label) {
        this.label = label;
    }
}
