package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum CemeteryDenomination {
    SECULAR("Świecki / Wielowyznaniowy"),
    ROMAN_CATHOLIC("Rzymskokatolickie"),
    GREEK_CATHOLIC("Greckokatolickie"),
    ORTHODOX("Prawosławne"),
    PROTESTANT("Ewangelickie"),
    JEWISH("Żydowskie"),
    MUSLIM("Muzułmańskie"),
    OTHER("Inne");

    private final String label;

    CemeteryDenomination(String label) {
        this.label = label;
    }
}
