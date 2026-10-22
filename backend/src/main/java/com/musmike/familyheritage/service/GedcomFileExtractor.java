package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.ParsedGedcomChildLinkDto;
import com.musmike.familyheritage.dto.ParsedGedcomFamilyDto;
import com.musmike.familyheritage.dto.ParsedGedcomFileDto;
import com.musmike.familyheritage.dto.ParsedGedcomIndividualDto;
import com.musmike.familyheritage.model.enums.FamilyStatus;
import com.musmike.familyheritage.util.GedcomUtils;
import org.gedcom4j.model.*;
import org.gedcom4j.model.enumerations.FamilyEventType;
import org.gedcom4j.model.enumerations.IndividualEventType;
import org.gedcom4j.parser.GedcomParser;
import org.springframework.stereotype.Service;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.util.*;

@Service
public class GedcomFileExtractor {

    public ParsedGedcomFileDto extract(InputStream inputStream) throws Exception {
        String sanitizedGedcom = new String(inputStream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)
                .lines()
                .map(String::stripLeading)
                .filter(line -> !line.isBlank())
                .collect(java.util.stream.Collectors.joining("\n"));

        GedcomParser gp = new GedcomParser();
        gp.load(new BufferedInputStream(
                new java.io.ByteArrayInputStream(sanitizedGedcom.getBytes(java.nio.charset.StandardCharsets.UTF_8))
        ));
        Gedcom gedcom = gp.getGedcom();

        String sourceSystem = extractSourceSystem(gedcom);

        List<ParsedGedcomIndividualDto> individuals = new ArrayList<>();
        for (Individual indi : gedcom.getIndividuals().values()) {
            if (isDummy(indi)) {
                continue;
            }
            individuals.add(extractIndividual(indi));
        }

        List<ParsedGedcomFamilyDto> families = new ArrayList<>();
        for (Family fam : gedcom.getFamilies().values()) {
            families.add(extractFamily(fam));
        }

        return ParsedGedcomFileDto.builder()
                .sourceSystem(sourceSystem)
                .individuals(individuals)
                .families(families)
                .build();
    }

    private String extractSourceSystem(Gedcom gedcom) {
        if (gedcom.getHeader() != null
                && gedcom.getHeader().getSourceSystem() != null
                && gedcom.getHeader().getSourceSystem().getSystemId() != null) {
            return gedcom.getHeader().getSourceSystem().getSystemId();
        }
        return "UNKNOWN";
    }

    private boolean isDummy(Individual indi) {
        return (indi.getNames() == null || indi.getNames().isEmpty())
                && (indi.getEvents() == null || indi.getEvents().isEmpty())
                && indi.getSex() == null;
    }

    private ParsedGedcomIndividualDto extractIndividual(Individual indi) {
        List<PersonalName> names = indi.getNames() != null ? indi.getNames() : Collections.emptyList();
        String fullName = names.isEmpty() ? "" : names.getFirst().getBasic();
        NameParts parts = parseGedcomName(fullName);

        String rawSex = indi.getSex() != null ? indi.getSex().getValue() : null;
        if (rawSex != null && rawSex.length() > 1) {
            rawSex = rawSex.substring(0, 1);
        }

        String birthDate = null;
        String birthPlace = null;
        List<IndividualEvent> births = indi.getEventsOfType(IndividualEventType.BIRTH);
        if (!births.isEmpty()) {
            IndividualEvent b = births.getFirst();
            birthDate = b.getDate() != null ? b.getDate().getValue() : null;
            birthPlace = b.getPlace() != null ? b.getPlace().getPlaceName() : null;
        }

        List<IndividualEvent> deaths = indi.getEventsOfType(IndividualEventType.DEATH);
        boolean deathIndicated = !deaths.isEmpty();
        String deathDate = null;
        String deathPlace = null;
        String causeOfDeath = null;
        if (deathIndicated) {
            IndividualEvent d = deaths.getFirst();
            deathDate = d.getDate() != null ? d.getDate().getValue() : null;
            deathPlace = d.getPlace() != null ? d.getPlace().getPlaceName() : null;
            causeOfDeath = d.getCause() != null ? d.getCause().getValue() : null;
        }

        String burialPlace = null;
        List<IndividualEvent> burials = indi.getEventsOfType(IndividualEventType.BURIAL);
        if (!burials.isEmpty()) {
            IndividualEvent bur = burials.getFirst();
            burialPlace = bur.getPlace() != null ? bur.getPlace().getPlaceName() : null;
        }

        Set<String> parentGivenNames = extractParentGivenNames(indi);
        Set<String> spouseGivenNames = extractSpouseGivenNames(indi);

        return ParsedGedcomIndividualDto.builder()
                .gedRefId(indi.getXref())
                .gedUid(GedcomUtils.getCustomFact(indi, "_UID"))
                .givenName(parts.givenName())
                .surname(parts.surname())
                .sex(rawSex)
                .deathIndicated(deathIndicated)
                .birthDate(birthDate)
                .birthPlace(birthPlace)
                .deathDate(deathDate)
                .deathPlace(deathPlace)
                .causeOfDeath(causeOfDeath)
                .burialPlace(burialPlace)
                .parentGivenNames(parentGivenNames)
                .spouseGivenNames(spouseGivenNames)
                .build();
    }

    private Set<String> extractParentGivenNames(Individual indi) {
        Set<String> result = new HashSet<>();
        if (indi.getFamiliesWhereChild() == null) {
            return result;
        }
        for (FamilyChild fc : indi.getFamiliesWhereChild()) {
            Family fam = fc.getFamily();
            if (fam == null) continue;
            addGivenNameIfPresent(result, fam.getHusband());
            addGivenNameIfPresent(result, fam.getWife());
        }
        return result;
    }

    private Set<String> extractSpouseGivenNames(Individual indi) {
        Set<String> result = new HashSet<>();
        if (indi.getFamiliesWhereSpouse() == null) {
            return result;
        }
        for (FamilySpouse fs : indi.getFamiliesWhereSpouse()) {
            Family fam = fs.getFamily();
            if (fam == null) continue;
            if (fam.getHusband() != null && fam.getHusband().getIndividual() != indi) {
                addGivenNameIfPresent(result, fam.getHusband());
            }
            if (fam.getWife() != null && fam.getWife().getIndividual() != indi) {
                addGivenNameIfPresent(result, fam.getWife());
            }
        }
        return result;
    }

    private void addGivenNameIfPresent(Set<String> target, IndividualReference ref) {
        if (ref == null || ref.getIndividual() == null || ref.getIndividual().getNames() == null
                || ref.getIndividual().getNames().isEmpty()) {
            return;
        }
        String basic = ref.getIndividual().getNames().getFirst().getBasic();
        String given = parseGedcomName(basic).givenName();
        if (!given.isBlank()) {
            target.add(given);
        }
    }

    private ParsedGedcomFamilyDto extractFamily(Family gedFam) {
        String husbRef = gedFam.getHusband() != null && gedFam.getHusband().getIndividual() != null
                ? gedFam.getHusband().getIndividual().getXref() : null;
        String wifeRef = gedFam.getWife() != null && gedFam.getWife().getIndividual() != null
                ? gedFam.getWife().getIndividual().getXref() : null;

        String weddingDate = null;
        String weddingPlace = null;
        List<FamilyEvent> marriages = gedFam.getEvents() == null ? Collections.emptyList() :
                gedFam.getEvents().stream().filter(e -> e.getType() == FamilyEventType.MARRIAGE).toList();
        if (!marriages.isEmpty()) {
            FamilyEvent marr = marriages.getFirst();
            weddingDate = marr.getDate() != null ? marr.getDate().getValue() : null;
            weddingPlace = marr.getPlace() != null ? marr.getPlace().getPlaceName() : null;
        }

        List<ParsedGedcomChildLinkDto> children = new ArrayList<>();
        if (gedFam.getChildren() != null) {
            for (IndividualReference ref : gedFam.getChildren()) {
                if (ref.getIndividual() != null) {
                    String pedi = extractPedigree(ref.getIndividual(), gedFam.getXref());
                    String adoptedBy = extractAdoptedBy(ref.getIndividual(), gedFam.getXref());
                    children.add(new ParsedGedcomChildLinkDto(ref.getIndividual().getXref(), pedi, adoptedBy));
                }
            }
        }

        return ParsedGedcomFamilyDto.builder()
                .gedRefId(gedFam.getXref())
                .gedUid(GedcomUtils.getCustomFact(gedFam, "_UID"))
                .husbandGedRefId(husbRef)
                .wifeGedRefId(wifeRef)
                .weddingDate(weddingDate)
                .weddingPlace(weddingPlace)
                .statusCode(detectFamilyStatusCode(gedFam))
                .children(children)
                .build();
    }

    private String detectFamilyStatusCode(Family gedFam) {
        List<FamilyEvent> famEvents = gedFam.getEvents() != null ? gedFam.getEvents() : Collections.emptyList();

        for (FamilyEvent event : famEvents) {
            if ((event.getType() == FamilyEventType.EVENT || event.getType() == FamilyEventType.MARRIAGE)
                    && event.getSubType() != null) {
                String typeValue = event.getSubType().getValue();
                if (typeValue != null) {
                    if (typeValue.startsWith("MYHERITAGE:REL_")) {
                        String statusSuffix = typeValue.substring("MYHERITAGE:REL_".length());
                        try {
                            return FamilyStatus.valueOf(statusSuffix).name();
                        } catch (IllegalArgumentException ignored) {
                            // Ignore unknown vendor-specific status suffix
                        }
                    } else if (typeValue.equalsIgnoreCase("Separation")) {
                        return FamilyStatus.SEPARATED.name();
                    } else if (typeValue.equalsIgnoreCase("Death of Spouse")) {
                        return FamilyStatus.WIDOWED.name();
                    }
                }
            }
        }

        if (famEvents.stream().anyMatch(e -> e.getType() == FamilyEventType.DIVORCE)) {
            return FamilyStatus.DIVORCED.name();
        }
        if (famEvents.stream().anyMatch(e -> e.getType() == FamilyEventType.ANNULMENT)) {
            return FamilyStatus.ANNULLED.name();
        }
        if (famEvents.stream().anyMatch(e -> e.getType() == FamilyEventType.ENGAGEMENT)) {
            return FamilyStatus.ENGAGED.name();
        }
        if (famEvents.stream().anyMatch(e -> e.getType() == FamilyEventType.MARRIAGE)) {
            return FamilyStatus.MARRIED.name();
        }

        return FamilyStatus.UNKNOWN.name();
    }

    private String extractPedigree(Individual child, String familyXref) {
        if (child.getFamiliesWhereChild() != null) {
            for (FamilyChild link : child.getFamiliesWhereChild()) {
                if (link.getFamily() != null && link.getFamily().getXref().equals(familyXref)) {
                    if (link.getPedigree() != null) {
                        return link.getPedigree().getValue();
                    }
                }
            }
        }
        return null;
    }

    private String extractAdoptedBy(Individual child, String familyXref) {
        // 1. Check standard GEDCOM 1 ADOP -> 2 FAMC @F1@ -> 3 ADOP <HUSB|WIFE|BOTH>
        List<IndividualEvent> adoptions = child.getEventsOfType(IndividualEventType.ADOPTION);
        for (IndividualEvent adop : adoptions) {
            FamilyChild fc = adop.getFamily();
            if (fc != null && fc.getFamily() != null && familyXref.equals(fc.getFamily().getXref())) {
                if (fc.getAdoptedBy() != null && fc.getAdoptedBy().getValue() != null) {
                    return fc.getAdoptedBy().getValue().toString().trim();
                }
                return "BOTH";
            }
        }

        // 2. Fallback: check if adoptedBy was attached directly to 1 FAMC @F1@
        if (child.getFamiliesWhereChild() != null) {
            for (FamilyChild link : child.getFamiliesWhereChild()) {
                if (link.getFamily() != null && familyXref.equals(link.getFamily().getXref())) {
                    if (link.getAdoptedBy() != null && link.getAdoptedBy().getValue() != null) {
                        return link.getAdoptedBy().getValue().toString().trim();
                    }
                }
            }
        }
        return null;
    }

    private record NameParts(String givenName, String surname) {}

    private NameParts parseGedcomName(String fullName) {
        if (fullName == null || fullName.isEmpty()) {
            return new NameParts("", "");
        }
        int start = fullName.indexOf('/');
        int end = fullName.lastIndexOf('/');
        if (start != -1 && end != -1 && start < end) {
            String surname = fullName.substring(start + 1, end).trim();
            String givenName = (fullName.substring(0, start) + fullName.substring(end + 1)).trim();
            return new NameParts(givenName, surname);
        }
        return new NameParts(fullName.trim(), "");
    }
}