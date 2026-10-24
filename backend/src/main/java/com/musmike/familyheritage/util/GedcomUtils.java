package com.musmike.familyheritage.util;

import org.gedcom4j.model.CustomFact;
import org.gedcom4j.model.Family;
import org.gedcom4j.model.Individual;
import org.gedcom4j.model.StringWithCustomFacts;
import java.util.Objects;

public class GedcomUtils {

    private GedcomUtils() {}

    public static String getCustomFact(Individual indi, String tag) {
        if (indi.getCustomFacts() == null) return null;

        return indi.getCustomFacts().stream()
                .filter(fact -> tag.equals(fact.getTag()))
                .map(CustomFact::getDescription)
                .filter(Objects::nonNull)
                .map(StringWithCustomFacts::getValue)
                .findFirst()
                .orElse(null);
    }

    public static String getCustomFact(Family fam, String tag) {
        if (fam.getCustomFacts() == null) return null;

        return fam.getCustomFacts().stream()
                .filter(fact -> tag.equals(fact.getTag()))
                .map(CustomFact::getDescription)
                .filter(Objects::nonNull)
                .map(StringWithCustomFacts::getValue)
                .findFirst()
                .orElse(null);
    }
}
