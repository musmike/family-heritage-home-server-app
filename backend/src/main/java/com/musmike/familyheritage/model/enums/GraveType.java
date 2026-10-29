package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum GraveType {
    SINGLE("Pojedynczy"),
    FAMILY("Rodzinny"),
    EARTH("Ziemny"),
    VAULT("Murowany / Grobowiec"),
    URN("Urnowy"),
    COLUMBARIUM("Kolumbarium"),
    CATACOMB("Katakumby"),
    SYMBOLIC("Symboliczny"),
    MASS("Zbiorowy"),
    OTHER("Inny");

    private final String label;

    GraveType(String label) {
        this.label = label;
    }
}
