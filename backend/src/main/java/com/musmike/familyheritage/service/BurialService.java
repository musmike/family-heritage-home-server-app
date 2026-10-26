package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import com.musmike.familyheritage.model.enums.LifeState;
import com.musmike.familyheritage.model.enums.PersonSex;
import com.musmike.familyheritage.repository.BurialRepository;
import com.musmike.familyheritage.repository.EventAttributeValueRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Period;
import java.util.*;

@Service
@RequiredArgsConstructor
public class BurialService {

    private final BurialRepository burialRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;

    @Transactional
    public BurialsOverviewDto getBurialsOverview(
            String search,
            PersonSex sex,
            boolean includeNonCurrent,
            boolean includeArchived,
            String sortBy,
            boolean isGuest
    ) {
        String normSearch = search != null ? search.trim().toLowerCase() : "";

        // 1. Base scope (before sex/search filters) determines which cemeteries have >= 2 burials overall
        List<Burial> baseBurials = burialRepository.findAll().stream()
                .filter(b -> includeNonCurrent || Boolean.TRUE.equals(b.getIsCurrent()))
                .filter(b -> b.getPerson() != null)
                .filter(b -> includeArchived || !Boolean.TRUE.equals(b.getPerson().getIsArchived()))
                .filter(b -> !isGuest || b.getPerson().getLifeState() == LifeState.DECEASED)
                .toList();

        Map<Long, Integer> totalCountPerCemetery = new HashMap<>();
        for (Burial b : baseBurials) {
            Grave g = b.getGrave();
            Location loc = (g != null && g.getCemeteryLocation() != null)
                    ? g.getCemeteryLocation()
                    : (b.getBurialEvent() != null ? b.getBurialEvent().getMainLocation() : null);
            if (loc != null && loc.getId() != null) {
                totalCountPerCemetery.merge(loc.getId(), 1, Integer::sum);
            }
        }

        // 2. Apply sex and search filters
        List<BurialPersonItemDto> filteredItems = baseBurials.stream()
                .filter(b -> sex == null || b.getPerson().getSex() == sex)
                .map(this::toBurialItemDto)
                .filter(item -> matchesSearch(item, normSearch))
                .sorted(buildComparator(sortBy))
                .toList();

        // 3. Group by cemeteryLocationId using the stable >= 2 threshold from totalCountPerCemetery
        Map<Long, List<BurialPersonItemDto>> byLocationId = new LinkedHashMap<>();
        List<BurialPersonItemDto> otherBucket = new ArrayList<>();

        for (BurialPersonItemDto item : filteredItems) {
            Long locId = item.getCemeteryLocationId();
            if (locId != null && totalCountPerCemetery.getOrDefault(locId, 0) >= 2) {
                byLocationId.computeIfAbsent(locId, k -> new ArrayList<>()).add(item);
            } else {
                otherBucket.add(item);
            }
        }

        List<CemeteryGroupDto> mainCemeteryGroups = new ArrayList<>();
        for (Map.Entry<Long, List<BurialPersonItemDto>> entry : byLocationId.entrySet()) {
            List<BurialPersonItemDto> locItems = entry.getValue();
            String cemeteryName = locItems.getFirst().getCemeteryName();
            List<GraveGroupDto> graves = groupByGraveId(locItems);
            mainCemeteryGroups.add(CemeteryGroupDto.builder()
                    .cemeteryLocationId(entry.getKey())
                    .groupName(cemeteryName != null ? cemeteryName : "Nieznany cmentarz")
                    .otherGroup(false)
                    .totalBurialsCount(locItems.size())
                    .graves(graves)
                    .build());
        }

        mainCemeteryGroups.sort(
                Comparator.comparing(CemeteryGroupDto::getGroupName, String.CASE_INSENSITIVE_ORDER)
        );

        List<CemeteryGroupDto> allGroups = new ArrayList<>(mainCemeteryGroups);
        if (!otherBucket.isEmpty()) {
            otherBucket.sort(buildComparator(sortBy));
            List<GraveGroupDto> otherGraves = groupByGraveId(otherBucket);
            allGroups.add(CemeteryGroupDto.builder()
                    .cemeteryLocationId(null)
                    .groupName("Inne")
                    .otherGroup(true)
                    .totalBurialsCount(otherBucket.size())
                    .graves(otherGraves)
                    .build());
        }

        int totalGraves = allGroups.stream()
                .mapToInt(g -> g.getGraves().size())
                .sum();

        return BurialsOverviewDto.builder()
                .totalBurialsCount(filteredItems.size())
                .totalGravesCount(totalGraves)
                .cemeteryGroups(allGroups)
                .build();
    }

    private List<GraveGroupDto> groupByGraveId(List<BurialPersonItemDto> items) {
        Map<Long, List<BurialPersonItemDto>> byGrave = new LinkedHashMap<>();
        for (BurialPersonItemDto item : items) {
            byGrave.computeIfAbsent(item.getGraveId(), k -> new ArrayList<>()).add(item);
        }

        List<GraveGroupDto> result = new ArrayList<>();
        for (Map.Entry<Long, List<BurialPersonItemDto>> entry : byGrave.entrySet()) {
            BurialPersonItemDto first = entry.getValue().getFirst();
            result.add(GraveGroupDto.builder()
                    .graveId(entry.getKey())
                    .cemeteryLocationId(first.getCemeteryLocationId())
                    .cemeteryName(first.getCemeteryName())
                    .burials(entry.getValue())
                    .build());
        }
        return result;
    }

    private BurialPersonItemDto toBurialItemDto(Burial burial) {
        Person person = burial.getPerson();
        Grave grave = burial.getGrave();
        Location cemLoc = (grave != null && grave.getCemeteryLocation() != null)
                ? grave.getCemeteryLocation()
                : (burial.getBurialEvent() != null ? burial.getBurialEvent().getMainLocation() : null);

        DateDescriptor burialStart = burial.getBurialEvent() != null ? burial.getBurialEvent().getStartDate() : null;
        DateDescriptor burialEnd = burial.getBurialEvent() != null ? burial.getBurialEvent().getEndDate() : null;

        DateDescriptor birthStart = person.getBirthEvent() != null ? person.getBirthEvent().getStartDate() : null;
        DateDescriptor birthEnd = person.getBirthEvent() != null ? person.getBirthEvent().getEndDate() : null;
        DateDescriptor deathStart = person.getDeathEvent() != null ? person.getDeathEvent().getStartDate() : null;
        DateDescriptor deathEnd = person.getDeathEvent() != null ? person.getDeathEvent().getEndDate() : null;

        String causeOfDeath = person.getDeathEvent() == null ? null :
                eventAttrValueRepository.findByEvent(person.getDeathEvent()).stream()
                        .map(eav -> eav.getAttributeDictionaryValue().getCode())
                        .findFirst()
                        .orElse(null);

        AgeResult ageResult = calculateAge(person.getLifeState(), birthStart, deathStart);

        return BurialPersonItemDto.builder()
                .burialId(burial.getId())
                .graveId(grave != null ? grave.getId() : burial.getId())
                .cemeteryLocationId(cemLoc != null ? cemLoc.getId() : null)
                .cemeteryName(cemLoc != null ? cemLoc.getName() : "Nieznany cmentarz")
                .current(Boolean.TRUE.equals(burial.getIsCurrent()))
                .burialYear(burialStart != null ? burialStart.getStartYear() : null)
                .burialDateText(formatEventDates(burialStart, burialEnd))
                .personId(person.getId())
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
                .causeOfDeath(causeOfDeath)
                .age(ageResult.age())
                .ageApproximate(ageResult.approximate())
                .build();
    }

    private boolean matchesSearch(BurialPersonItemDto item, String normSearch) {
        if (normSearch.isEmpty()) {
            return true;
        }
        String combined = ((item.getGivenName() != null ? item.getGivenName() : "") + " "
                + (item.getSurname() != null ? item.getSurname() : "") + " "
                + (item.getCemeteryName() != null ? item.getCemeteryName() : "") + " "
                + (item.getBirthPlace() != null ? item.getBirthPlace() : "") + " "
                + (item.getDeathPlace() != null ? item.getDeathPlace() : "") + " "
                + (item.getCauseOfDeath() != null ? item.getCauseOfDeath() : "")).toLowerCase();
        return combined.contains(normSearch);
    }

    private Comparator<BurialPersonItemDto> buildComparator(String sortBy) {
        String mode = sortBy != null ? sortBy.trim().toUpperCase() : "SURNAME_ASC";
        Comparator<String> nullSafeStr = Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER);
        Comparator<Integer> nullSafeIntAsc = Comparator.nullsLast(Integer::compareTo);
        Comparator<Integer> nullSafeIntDesc = Comparator.nullsLast(Comparator.reverseOrder());

        return switch (mode) {
            case "SURNAME_DESC" -> Comparator
                    .comparing(BurialPersonItemDto::getSurname, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER.reversed()))
                    .thenComparing(BurialPersonItemDto::getGivenName, nullSafeStr);
            case "DEATH_DATE_ASC" -> Comparator
                    .comparing(BurialPersonItemDto::getDeathYear, nullSafeIntAsc)
                    .thenComparing(BurialPersonItemDto::getSurname, nullSafeStr);
            case "DEATH_DATE_DESC" -> Comparator
                    .comparing(BurialPersonItemDto::getDeathYear, nullSafeIntDesc)
                    .thenComparing(BurialPersonItemDto::getSurname, nullSafeStr);
            case "BURIAL_DATE_ASC" -> Comparator
                    .comparing(BurialPersonItemDto::getBurialYear, nullSafeIntAsc)
                    .thenComparing(BurialPersonItemDto::getSurname, nullSafeStr);
            case "BURIAL_DATE_DESC" -> Comparator
                    .comparing(BurialPersonItemDto::getBurialYear, nullSafeIntDesc)
                    .thenComparing(BurialPersonItemDto::getSurname, nullSafeStr);
            default -> Comparator
                    .comparing(BurialPersonItemDto::getSurname, nullSafeStr)
                    .thenComparing(BurialPersonItemDto::getGivenName, nullSafeStr)
                    .thenComparingLong(BurialPersonItemDto::getBurialId);
        };
    }

    private record AgeResult(Integer age, boolean approximate) {}

    private AgeResult calculateAge(LifeState lifeState, DateDescriptor birth, DateDescriptor death) {
        if (birth == null || birth.getStartYear() == null || lifeState != LifeState.DECEASED) {
            return new AgeResult(null, false);
        }
        if (death == null || death.getStartYear() == null || death.getStartYear() < birth.getStartYear()) {
            return new AgeResult(null, false);
        }

        boolean birthExact = birth.getDateType() == DateType.SINGLE
                && birth.getStartQualifier() == DateQualifier.EXACT
                && birth.getStartMonth() != null
                && birth.getStartDay() != null;
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