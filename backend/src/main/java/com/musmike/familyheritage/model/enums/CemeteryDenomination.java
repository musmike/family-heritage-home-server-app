package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum CemeteryDenomination {
    SECULAR("Świecki / Wielowyznaniowy"),
    ROMAN_CATHOLIC("Rzymskokatolicki"),
    GREEK_CATHOLIC("Greckokatolicki"),
    ORTHODOX("Prawosławny"),
    PROTESTANT("Ewangelicki"),
    JEWISH("Żydowski"),
    MUSLIM("Muzułmański"),
    OTHER("Inny");

    private final String label;

    CemeteryDenomination(String label) {
        this.label = label;
    }
}
