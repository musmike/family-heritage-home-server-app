package com.musmike.familyheritage.model.enums;

import lombok.Getter;

@Getter
public enum ActivityActionType {
    USER_LOGIN("Logowanie użytkownika", true),
    USER_CREATED("Utworzenie użytkownika", true),
    USER_UPDATED("Edycja użytkownika", true),
    USER_DELETED("Usunięcie użytkownika", true),

    GEDCOM_IMPORT("Import pliku GEDCOM", false),
    GEDCOM_RESTORE("Przywrócenie importu GEDCOM", false),
    TREE_RESET("Wyczyszczenie drzewa", false),
    DEFAULT_PROBAND_SET("Ustawienie głównego probanta", false),

    PERSON_CREATED("Dodanie osoby", false),
    PERSON_UPDATED("Aktualizacja osoby", false),
    PERSON_ARCHIVED("Archiwizacja osoby", false),
    PERSON_DELETED("Usunięcie osoby", false),

    EVENT_CREATED("Dodanie wydarzenia", false),
    EVENT_UPDATED("Aktualizacja wydarzenia", false),
    EVENT_DELETED("Usunięcie wydarzenia", false),

    GRAVE_CREATED("Dodanie grobu", false),
    GRAVE_UPDATED("Aktualizacja grobu", false),
    GRAVE_DELETED("Usunięcie grobu", false);

    private final String label;
    private final boolean adminOnly;

    ActivityActionType(String label, boolean adminOnly) {
        this.label = label;
        this.adminOnly = adminOnly;
    }
}