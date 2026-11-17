package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum MediaVersionType {
    ORIGINAL("Oryginał"),
    RESTORED("Wersja odnowiona"),
    COLORIZED("Wersja w kolorze"),
    ENHANCED("Wersja wyostrzona / poprawiona"),
    REVERSE("Strona odwrotna (Rewers)"),
    OTHER("Inna wersja");

    private final String defaultLabel;

    MediaVersionType(String defaultLabel) {
        this.defaultLabel = defaultLabel;
    }
}