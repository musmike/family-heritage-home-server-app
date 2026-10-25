package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PersonBiographyService {

    private final PersonRepository personRepository;
    private final PersonNameRepository personNameRepository;
    private final FamilyRepository familyRepository;
    private final FamilyChildRepository familyChildRepository;
    private final BurialRepository burialRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;

    @Transactional
    public BiographyPageDto listPeople(
            String search,
            PersonSex sex,
            LifeState lifeState,
            boolean includeArchived,
            String sortBy,
            int page,
            int size,
            boolean isGuest
    ) {
        String normSearch = search != null ? search.trim().toLowerCase() : "";

        List<PersonListItemDto> filtered = personRepository.findAll().stream()
                .filter(p -> includeArchived || !Boolean.TRUE.equals(p.getIsArchived()))
                .filter(p -> !isGuest || p.getLifeState() == LifeState.DECEASED)
                .filter(p -> sex == null || p.getSex() == sex)
                .filter(p -> lifeState == null || p.getLifeState() == lifeState)
                .map(this::toListItemDto)
                .filter(item -> matchesSearch(item, normSearch))
                .sorted(buildComparator(sortBy))
                .toList();

        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        int totalElements = filtered.size();
        int totalPages = (int) Math.ceil((double) totalElements / safeSize);

        int fromIndex = Math.min(safePage * safeSize, totalElements);
        int toIndex = Math.min(fromIndex + safeSize, totalElements);
        List<PersonListItemDto> pageContent = filtered.subList(fromIndex, toIndex);

        return BiographyPageDto.builder()
                .content(pageContent)
                .page(safePage)
                .size(safeSize)
                .totalElements(totalElements)
                .totalPages(totalPages)
                .build();
    }

    @Transactional
    public PersonBiographyDto getBiography(Long personId, boolean isGuest, boolean isAdmin) {
        Person person = personRepository.findById(personId)
                .orElseThrow(() -> new IllegalArgumentException("Person not found: " + personId));

        if (isGuest && person.getLifeState() != LifeState.DECEASED) {
            throw new AccessDeniedException("Guests are only permitted to view deceased individuals.");
        }

        DateDescriptor birthStart = person.getBirthEvent() != null ? person.getBirthEvent().getStartDate() : null;
        DateDescriptor birthEnd = person.getBirthEvent() != null ? person.getBirthEvent().getEndDate() : null;
        String birthPlace = extractLocationName(person.getBirthEvent());

        DateDescriptor deathStart = person.getDeathEvent() != null ? person.getDeathEvent().getStartDate() : null;
        DateDescriptor deathEnd = person.getDeathEvent() != null ? person.getDeathEvent().getEndDate() : null;
        String deathPlace = extractLocationName(person.getDeathEvent());

        String causeOfDeath = person.getDeathEvent() == null ? null :
                eventAttrValueRepository.findByEvent(person.getDeathEvent()).stream()
                        .map(eav -> eav.getAttributeDictionaryValue().getCode())
                        .findFirst()
                        .orElse(null);

        String burialPlace = burialRepository.findByPerson(person).stream()
                .map(b -> {
                    if (b.getGrave() != null && b.getGrave().getCemeteryLocation() != null) {
                        return b.getGrave().getCemeteryLocation().getName();
                    }
                    return extractLocationName(b.getBurialEvent());
                })
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);

        AgeResult ageResult = calculateAge(person.getLifeState(), birthStart, deathStart);

        List<PersonNameDto> names = personNameRepository.findByPerson(person).stream()
                .map(n -> PersonNameDto.builder()
                        .id(n.getId())
                        .type(n.getType())
                        .givenName(n.getGivenName())
                        .surname(n.getSurname())
                        .current(Boolean.TRUE.equals(n.getIsCurrent()))
                        .build())
                .toList();

        // Origin families (parents & siblings)
        List<OriginFamilyDto> originFamilies = new ArrayList<>();
        for (FamilyChild fc : familyChildRepository.findByChild(person)) {
            Family fam = fc.getFamily();
            List<RelatedPersonDto> siblings = fam.getChildren().stream()
                    .map(FamilyChild::getChild)
                    .filter(c -> !c.getId().equals(person.getId()))
                    .sorted(Comparator.comparing(Person::getId))
                    .map(s -> toRelatedPersonDto(s, isGuest))
                    .toList();

            originFamilies.add(OriginFamilyDto.builder()
                    .familyId(fam.getId())
                    .father(toRelatedPersonDto(fam.getHusband(), isGuest))
                    .fatherRelationshipType(fc.getFatherRelationshipType())
                    .mother(toRelatedPersonDto(fam.getWife(), isGuest))
                    .motherRelationshipType(fc.getMotherRelationshipType())
                    .siblings(siblings)
                    .build());
        }

        // Spouse families (partners & children)
        List<SpouseFamilyDto> spouseFamilies = new ArrayList<>();
        for (Family fam : familyRepository.findByHusbandOrWife(person, person)) {
            Person spouse = (fam.getHusband() != null && fam.getHusband().getId().equals(person.getId()))
                    ? fam.getWife()
                    : fam.getHusband();

            Event wedding = fam.getPrimaryWedding();
            String weddingDateText = wedding != null
                    ? formatEventDates(wedding.getStartDate(), wedding.getEndDate())
                    : null;
            String weddingPlace = extractLocationName(wedding);

            List<ChildInFamilyDto> children = fam.getChildren().stream()
                    .sorted(Comparator.comparing(c -> c.getChild().getId()))
                    .map(fc -> ChildInFamilyDto.builder()
                            .person(toRelatedPersonDto(fc.getChild(), isGuest))
                            .fatherRelationshipType(fc.getFatherRelationshipType())
                            .motherRelationshipType(fc.getMotherRelationshipType())
                            .build())
                    .toList();

            spouseFamilies.add(SpouseFamilyDto.builder()
                    .familyId(fam.getId())
                    .spouse(toRelatedPersonDto(spouse, isGuest))
                    .statusCode(fam.getStatus() != null ? fam.getStatus().getCode() : null)
                    .weddingDateText(weddingDateText)
                    .weddingPlace(weddingPlace)
                    .children(children)
                    .build());
        }

        RawGedcomPersonViewDto rawGedcomView = isAdmin ? buildRawGedcomView(person) : null;

        return PersonBiographyDto.builder()
                .id(person.getId())
                .givenName(person.getCachedGivenName())
                .surname(person.getCachedSurname())
                .sex(person.getSex())
                .lifeState(person.getLifeState())
                .archived(Boolean.TRUE.equals(person.getIsArchived()))
                .birthYear(birthStart != null ? birthStart.getStartYear() : null)
                .birthDateText(formatEventDates(birthStart, birthEnd))
                .birthPlace(birthPlace)
                .deathYear(deathStart != null ? deathStart.getStartYear() : null)
                .deathDateText(formatEventDates(deathStart, deathEnd))
                .deathPlace(deathPlace)
                .causeOfDeath(causeOfDeath)
                .burialPlace(burialPlace)
                .age(ageResult.age())
                .ageApproximate(ageResult.approximate())
                .names(names)
                .originFamilies(originFamilies)
                .spouseFamilies(spouseFamilies)
                .rawGedcomData(rawGedcomView)
                .build();
    }

    private PersonListItemDto toListItemDto(Person person) {
        DateDescriptor birthStart = person.getBirthEvent() != null ? person.getBirthEvent().getStartDate() : null;
        DateDescriptor birthEnd = person.getBirthEvent() != null ? person.getBirthEvent().getEndDate() : null;
        DateDescriptor deathStart = person.getDeathEvent() != null ? person.getDeathEvent().getStartDate() : null;
        DateDescriptor deathEnd = person.getDeathEvent() != null ? person.getDeathEvent().getEndDate() : null;

        AgeResult ageResult = calculateAge(person.getLifeState(), birthStart, deathStart);

        return PersonListItemDto.builder()
                .id(person.getId())
                .givenName(person.getCachedGivenName())
                .surname(person.getCachedSurname())
                .sex(person.getSex())
                .lifeState(person.getLifeState())
                .archived(Boolean.TRUE.equals(person.getIsArchived()))
                .birthYear(birthStart != null ? birthStart.getStartYear() : null)
                .birthDateText(formatEventDates(birthStart, birthEnd))
                .birthPlace(extractLocationName(person.getBirthEvent()))
                .deathYear(deathStart != null ? deathStart.getStartYear() : null)
                .deathDateText(formatEventDates(deathStart, deathEnd))
                .deathPlace(extractLocationName(person.getDeathEvent()))
                .age(ageResult.age())
                .ageApproximate(ageResult.approximate())
                .build();
    }

    private RelatedPersonDto toRelatedPersonDto(Person person, boolean isGuest) {
        if (person == null) {
            return null;
        }
        if (isGuest && person.getLifeState() != LifeState.DECEASED) {
            return RelatedPersonDto.builder()
                    .id(null)
                    .givenName("<Prywatne>")
                    .surname(person.getCachedSurname())
                    .sex(person.getSex())
                    .lifeState(person.getLifeState())
                    .birthYear(null)
                    .deathYear(null)
                    .archived(Boolean.TRUE.equals(person.getIsArchived()))
                    .privateRecord(true)
                    .build();
        }
        DateDescriptor birthStart = person.getBirthEvent() != null ? person.getBirthEvent().getStartDate() : null;
        DateDescriptor deathStart = person.getDeathEvent() != null ? person.getDeathEvent().getStartDate() : null;

        return RelatedPersonDto.builder()
                .id(person.getId())
                .givenName(person.getCachedGivenName())
                .surname(person.getCachedSurname())
                .sex(person.getSex())
                .lifeState(person.getLifeState())
                .birthYear(birthStart != null ? birthStart.getStartYear() : null)
                .deathYear(deathStart != null ? deathStart.getStartYear() : null)
                .archived(Boolean.TRUE.equals(person.getIsArchived()))
                .privateRecord(false)
                .build();
    }

    private RawGedcomPersonViewDto buildRawGedcomView(Person person) {
        PersonGedcomData gd = person.getGedcomData();
        List<ExternalIdDto> extIds = person.getExternalIds().stream()
                .sorted(Comparator.comparing(PersonExternalId::getSourceSystem))
                .map(e -> new ExternalIdDto(e.getSourceSystem(), e.getUidValue()))
                .toList();

        if (gd == null && extIds.isEmpty()) {
            return null;
        }

        return RawGedcomPersonViewDto.builder()
                .gedRefId(gd != null ? gd.getGedRefId() : null)
                .gedUid(gd != null ? gd.getGedUid() : null)
                .rawGivenName(gd != null ? gd.getRawGivenName() : null)
                .rawSurname(gd != null ? gd.getRawSurname() : null)
                .rawSex(gd != null ? gd.getRawSex() : null)
                .rawDeathIndicated(gd != null ? gd.getRawDeathIndicated() : null)
                .rawBirthDate(gd != null ? gd.getRawBirthDate() : null)
                .rawBirthPlace(gd != null ? gd.getRawBirthPlace() : null)
                .rawDeathDate(gd != null ? gd.getRawDeathDate() : null)
                .rawDeathPlace(gd != null ? gd.getRawDeathPlace() : null)
                .rawCauseOfDeath(gd != null ? gd.getRawCauseOfDeath() : null)
                .rawBurialPlace(gd != null ? gd.getRawBurialPlace() : null)
                .lastImportedAt(gd != null ? gd.getLastImportedAt() : null)
                .externalIds(extIds)
                .build();
    }

    private boolean matchesSearch(PersonListItemDto item, String normSearch) {
        if (normSearch.isEmpty()) {
            return true;
        }
        String full = ((item.getGivenName() != null ? item.getGivenName() : "") + " "
                + (item.getSurname() != null ? item.getSurname() : "") + " "
                + (item.getBirthPlace() != null ? item.getBirthPlace() : "") + " "
                + (item.getDeathPlace() != null ? item.getDeathPlace() : "")).toLowerCase();
        return full.contains(normSearch);
    }

    private Comparator<PersonListItemDto> buildComparator(String sortBy) {
        String mode = sortBy != null ? sortBy.trim().toUpperCase() : "SURNAME_ASC";
        Comparator<String> nullSafeStr = Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER);
        Comparator<Integer> nullSafeIntAsc = Comparator.nullsLast(Integer::compareTo);
        Comparator<Integer> nullSafeIntDesc = Comparator.nullsLast(Comparator.reverseOrder());

        return switch (mode) {
            case "SURNAME_DESC" -> Comparator
                    .comparing(PersonListItemDto::getSurname, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER.reversed()))
                    .thenComparing(PersonListItemDto::getGivenName, nullSafeStr);
            case "GIVEN_NAME_ASC" -> Comparator
                    .comparing(PersonListItemDto::getGivenName, nullSafeStr)
                    .thenComparing(PersonListItemDto::getSurname, nullSafeStr);
            case "BIRTH_DATE_ASC" -> Comparator
                    .comparing(PersonListItemDto::getBirthYear, nullSafeIntAsc)
                    .thenComparing(PersonListItemDto::getSurname, nullSafeStr);
            case "BIRTH_DATE_DESC" -> Comparator
                    .comparing(PersonListItemDto::getBirthYear, nullSafeIntDesc)
                    .thenComparing(PersonListItemDto::getSurname, nullSafeStr);
            case "DEATH_DATE_ASC" -> Comparator
                    .comparing(PersonListItemDto::getDeathYear, nullSafeIntAsc)
                    .thenComparing(PersonListItemDto::getSurname, nullSafeStr);
            case "DEATH_DATE_DESC" -> Comparator
                    .comparing(PersonListItemDto::getDeathYear, nullSafeIntDesc)
                    .thenComparing(PersonListItemDto::getSurname, nullSafeStr);
            default -> Comparator
                    .comparing(PersonListItemDto::getSurname, nullSafeStr)
                    .thenComparing(PersonListItemDto::getGivenName, nullSafeStr)
                    .thenComparingLong(PersonListItemDto::getId);
        };
    }

    private record AgeResult(Integer age, boolean approximate) {}

    private AgeResult calculateAge(LifeState lifeState, DateDescriptor birth, DateDescriptor death) {
        if (birth == null || birth.getStartYear() == null) {
            return new AgeResult(null, false);
        }

        boolean birthExact = birth.getDateType() == DateType.SINGLE
                && birth.getStartQualifier() == DateQualifier.EXACT
                && birth.getStartMonth() != null
                && birth.getStartDay() != null;

        if (lifeState == LifeState.DECEASED) {
            if (death == null || death.getStartYear() == null || death.getStartYear() < birth.getStartYear()) {
                return new AgeResult(null, false);
            }
            boolean deathExact = death.getDateType() == DateType.SINGLE
                    && death.getStartQualifier() == DateQualifier.EXACT
                    && death.getStartMonth() != null
                    && death.getStartDay() != null;

            if (birthExact && deathExact) {
                LocalDate bDate = LocalDate.of(birth.getStartYear(), birth.getStartMonth(), birth.getStartDay());
                LocalDate dDate = LocalDate.of(death.getStartYear(), death.getStartMonth(), death.getStartDay());
                if (!dDate.isBefore(bDate)) {
                    return new AgeResult(Period.between(bDate, dDate).getYears(), false);
                }
            }
            boolean isApprox = (birth.getStartQualifier() != null && birth.getStartQualifier() != DateQualifier.EXACT)
                    || (death.getStartQualifier() != null && death.getStartQualifier() != DateQualifier.EXACT)
                    || birth.getDateType() == DateType.RANGE
                    || death.getDateType() == DateType.RANGE;
            return new AgeResult(death.getStartYear() - birth.getStartYear(), isApprox);
        }

        if (lifeState == LifeState.LIVING) {
            LocalDate today = LocalDate.now();
            if (birth.getStartYear() > today.getYear()) {
                return new AgeResult(null, false);
            }
            if (birthExact) {
                LocalDate bDate = LocalDate.of(birth.getStartYear(), birth.getStartMonth(), birth.getStartDay());
                if (!today.isBefore(bDate)) {
                    return new AgeResult(Period.between(bDate, today).getYears(), false);
                }
            }
            boolean isApprox = birth.getStartQualifier() != null && birth.getStartQualifier() != DateQualifier.EXACT;
            return new AgeResult(today.getYear() - birth.getStartYear(), isApprox);
        }

        return new AgeResult(null, false);
    }

    private String formatEventDates(DateDescriptor start, DateDescriptor end) {
        if (start == null && end == null) {
            return null;
        }
        if (start != null && end != null) {
            return "od " + formatSingleDescriptor(start) + " do " + formatSingleDescriptor(end);
        }
        if (start != null) {
            return formatSingleDescriptor(start);
        }
        return "do " + formatSingleDescriptor(end);
    }

    private String formatSingleDescriptor(DateDescriptor dd) {
        if (dd.getDateType() == DateType.FREE_TEXT) {
            return dd.getFreeText();
        }
        if (dd.getDateType() == DateType.RANGE) {
            String d1 = formatYmd(dd.getStartYear(), dd.getStartMonth(), dd.getStartDay());
            String d2 = formatYmd(dd.getEndYear(), dd.getEndMonth(), dd.getEndDay());
            return "między " + d1 + " a " + d2;
        }
        String base = formatYmd(dd.getStartYear(), dd.getStartMonth(), dd.getStartDay());
        if (base.isEmpty()) {
            return null;
        }
        if (dd.getStartQualifier() == null || dd.getStartQualifier() == DateQualifier.EXACT) {
            return base;
        }
        return switch (dd.getStartQualifier()) {
            case ABOUT, ESTIMATED, CALCULATED -> "ok. " + base;
            case BEFORE -> "przed " + base;
            case AFTER -> "po " + base;
            case EXACT -> base;
        };
    }

    private String formatYmd(Integer y, Integer m, Integer d) {
        if (y == null) return "";
        if (m != null && d != null) {
            return String.format("%02d.%02d.%d", d, m, y);
        }
        if (m != null) {
            return String.format("%02d.%d", m, y);
        }
        return String.valueOf(y);
    }

    private String extractLocationName(Event event) {
        if (event == null || event.getMainLocation() == null) {
            return null;
        }
        return event.getMainLocation().getName();
    }
}