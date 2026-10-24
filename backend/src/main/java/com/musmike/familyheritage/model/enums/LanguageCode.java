package com.musmike.familyheritage.model.enums;

public enum LanguageCode {
    PL_PL("pl-PL"),
    EN_US("en-US");

    private final String code;

    LanguageCode(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
