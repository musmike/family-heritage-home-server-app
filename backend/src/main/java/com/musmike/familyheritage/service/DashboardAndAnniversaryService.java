package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardAndAnniversaryService {

    private static final String[] POLISH_MONTHS_GENITIVE = {
            "",
            "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
            "lipca", "sierpnia", "września", "października", "listopada", "grudnia"
    };

    private final PersonRepository personRepository;
    private final FamilyRepository familyRepository;
    private final EventRepository eventRepository;
    private final GraveRepository graveRepository;

    @Transactional
    public DashboardStatsDto getDashboardStats() {
        List<Person> activePeople = personRepository.findByIsArchivedFalse();
        Set<Long> activePersonIds = activePeople.stream()
                .map(Person::getId)
                .collect(Collectors.toSet());

        List<Family> allFamilies = familyRepository.findAll();

        int generationsCount = calculateGenerationsCount(activePersonIds, allFamilies);

        long eventsCount = eventRepository.findAll().stream()
                .filter(e -> !e.getParticipants().isEmpty())
                .filter(e -> e.getParticipants().stream()
                        .anyMatch(ep -> !Boolean.TRUE.equals(ep.getPerson().getIsArchived())))
                .count();

        long gravesCount = graveRepository.count();

        return DashboardStatsDto.builder()
                .peopleCount(activePeople.size())
                .familiesCount(allFamilies.size())
                .generationsCount(generationsCount)
                .eventsCount(eventsCount)
                .gravesCount(gravesCount)
                .documentsCount(0L)
                .mediaCount(0L)
                .memoriesCount(0L)
                .heirloomsCount(0L)
                .placesCount(0L)
                .build();
    }

    @Transactional
    public AnniversariesPageDto getAnniversaries(
            String search,
            List<String> types,
            Integer month,
            boolean includeArchived,
            String sortBy,
            int page,
            int size
    ) {
        LocalDate today = LocalDate.now();

        Set<String> selectedTypes = (types == null || types.isEmpty())
                ? Set.of()
                : types.stream()
                .filter(Objects::nonNull)
                .map(s -> s.trim().toUpperCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());

        String normSearch = search != null ? search.trim().toLowerCase() : "";

        List<AnniversaryItemDto> allItems = new ArrayList<>();

        // 1. BIRTH and DEATH anniversaries from people
        for (Person person : personRepository.findAll()) {
            boolean isArchived = Boolean.TRUE.equals(person.getIsArchived());
            if (!includeArchived && isArchived) {
                continue;
            }

            // BIRTH: only LIVING or UNKNOWN
            if ((selectedTypes.isEmpty() || selectedTypes.contains("BIRTH"))
                    && person.getLifeState() != LifeState.DECEASED
                    && person.getBirthEvent() != null
                    && isExactDayAndMonth(person.getBirthEvent().getStartDate())) {
                allItems.add(buildPersonAnniversary(
                        "BIRTH",
                        "Rocznica urodzin",
                        person,
                        person.getBirthEvent(),
                        today
                ));
            }

            // DEATH: any person with an exact death date
            if ((selectedTypes.isEmpty() || selectedTypes.contains("DEATH"))
                    && person.getDeathEvent() != null
                    && isExactDayAndMonth(person.getDeathEvent().getStartDate())) {
                allItems.add(buildPersonAnniversary(
                        "DEATH",
                        "Rocznica śmierci",
                        person,
                        person.getDeathEvent(),
                        today
                ));
            }
        }

        // 2. WEDDING anniversaries: MARRIED status and both spouses alive/unknown
        if (selectedTypes.isEmpty() || selectedTypes.contains("WEDDING")) {
            for (Family fam : familyRepository.findAll()) {
                if (fam.getStatus() == null
                        || !FamilyStatus.MARRIED.name().equals(fam.getStatus().getCode())) {
                    continue;
                }
                Person husband = fam.getHusband();
                Person wife = fam.getWife();
                if (husband == null || wife == null) {
                    continue;
                }
                if (husband.getLifeState() == LifeState.DECEASED
                        || wife.getLifeState() == LifeState.DECEASED) {
                    continue;
                }
                if (!includeArchived
                        && (Boolean.TRUE.equals(husband.getIsArchived())
                        || Boolean.TRUE.equals(wife.getIsArchived()))) {
                    continue;
                }
                Event wedding = fam.getPrimaryWedding();
                if (wedding != null && isExactDayAndMonth(wedding.getStartDate())) {
                    allItems.add(buildWeddingAnniversary(fam, wedding, husband, wife, today));
                }
            }
        }

        List<AnniversaryItemDto> filtered = allItems.stream()
                .filter(item -> month == null || Objects.equals(item.getMonth(), month))
                .filter(item -> matchesSearch(item, normSearch))
                .sorted(buildComparator(sortBy))
                .toList();

        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        int totalElements = filtered.size();
        int totalPages = (int) Math.ceil((double) totalElements / safeSize);

        int fromIndex = Math.min(safePage * safeSize, totalElements);
        int toIndex = Math.min(fromIndex + safeSize, totalElements);
        List<AnniversaryItemDto> pageContent = filtered.subList(fromIndex, toIndex);

        return AnniversariesPageDto.builder()
                .content(pageContent)
                .page(safePage)
                .size(safeSize)
                .totalElements(totalElements)
                .totalPages(totalPages)
                .build();
    }

    private int calculateGenerationsCount(Set<Long> activePersonIds, List<Family> allFamilies) {
        if (activePersonIds.isEmpty()) {
            return 0;
        }

        Map<Long, Set<Long>> childrenByParent = new HashMap<>();
        for (Family fam : allFamilies) {
            Long husbId = (fam.getHusband() != null && activePersonIds.contains(fam.getHusband().getId()))
                    ? fam.getHusband().getId()
                    : null;
            Long wifeId = (fam.getWife() != null && activePersonIds.contains(fam.getWife().getId()))
                    ? fam.getWife().getId()
                    : null;

            for (FamilyChild fc : fam.getChildren()) {
                Long childId = fc.getChild().getId();
                if (!activePersonIds.contains(childId)) {
                    continue;
                }
                if (husbId != null) {
                    childrenByParent.computeIfAbsent(husbId, k -> new HashSet<>()).add(childId);
                }
                if (wifeId != null) {
                    childrenByParent.computeIfAbsent(wifeId, k -> new HashSet<>()).add(childId);
                }
            }
        }

        Map<Long, Integer> memo = new HashMap<>();
        Set<Long> visiting = new HashSet<>();
        int maxDepth = 1;

        for (Long personId : activePersonIds) {
            int depth = computeMaxDepthDfs(personId, childrenByParent, memo, visiting);
            if (depth > maxDepth) {
                maxDepth = depth;
            }
        }
        return maxDepth;
    }

    private int computeMaxDepthDfs(
            Long personId,
            Map<Long, Set<Long>> childrenByParent,
            Map<Long, Integer> memo,
            Set<Long> visiting
    ) {
        if (memo.containsKey(personId)) {
            return memo.get(personId);
        }
        if (!visiting.add(personId)) {
            return 1;
        }

        int maxChildDepth = 0;
        Set<Long> children = childrenByParent.getOrDefault(personId, Set.of());
        for (Long childId : children) {
            int childDepth = computeMaxDepthDfs(childId, childrenByParent, memo, visiting);
            if (childDepth > maxChildDepth) {
                maxChildDepth = childDepth;
            }
        }

        visiting.remove(personId);
        int result = 1 + maxChildDepth;
        memo.put(personId, result);
        return result;
    }

    private boolean isExactDayAndMonth(DateDescriptor dd) {
        return dd != null
                && dd.getDateType() == DateType.SINGLE
                && dd.getStartQualifier() == DateQualifier.EXACT
                && dd.getStartMonth() != null
                && dd.getStartMonth() >= 1
                && dd.getStartMonth() <= 12
                && dd.getStartDay() != null
                && dd.getStartDay() >= 1
                && dd.getStartDay() <= 31;
    }

    private AnniversaryItemDto buildPersonAnniversary(
            String type,
            String typeLabel,
            Person person,
            Event event,
            LocalDate today
    ) {
        DateDescriptor dd = event.getStartDate();
        int m = dd.getStartMonth();
        int d = dd.getStartDay();
        Integer origYear = dd.getStartYear();

        LocalDate nextDate = calculateNextOccurrence(today, m, d);
        int daysUntil = (int) ChronoUnit.DAYS.between(today, nextDate);
        Integer yearsCount = (origYear != null && nextDate.getYear() >= origYear)
                ? (nextDate.getYear() - origYear)
                : null;

        return AnniversaryItemDto.builder()
                .id(type + "-" + person.getId())
                .type(type)
                .typeLabel(typeLabel)
                .month(m)
                .day(d)
                .originalYear(origYear)
                .dateText(formatExactDate(origYear, m, d))
                .annualDateText(formatAnnualDate(m, d))
                .nextOccurrenceDate(nextDate)
                .daysUntil(daysUntil)
                .yearsCount(yearsCount)
                .locationName(event.getMainLocation() != null ? event.getMainLocation().getName() : null)
                .targetType("PERSON")
                .targetId(person.getId())
                .eventId(event.getId())
                .participants(List.of(toParticipantDto(person)))
                .build();
    }

    private AnniversaryItemDto buildWeddingAnniversary(
            Family fam,
            Event wedding,
            Person husband,
            Person wife,
            LocalDate today
    ) {
        DateDescriptor dd = wedding.getStartDate();
        int m = dd.getStartMonth();
        int d = dd.getStartDay();
        Integer origYear = dd.getStartYear();

        LocalDate nextDate = calculateNextOccurrence(today, m, d);
        int daysUntil = (int) ChronoUnit.DAYS.between(today, nextDate);
        Integer yearsCount = (origYear != null && nextDate.getYear() >= origYear)
                ? (nextDate.getYear() - origYear)
                : null;

        return AnniversaryItemDto.builder()
                .id("WEDDING-" + fam.getId())
                .type("WEDDING")
                .typeLabel("Rocznica ślubu")
                .month(m)
                .day(d)
                .originalYear(origYear)
                .dateText(formatExactDate(origYear, m, d))
                .annualDateText(formatAnnualDate(m, d))
                .nextOccurrenceDate(nextDate)
                .daysUntil(daysUntil)
                .yearsCount(yearsCount)
                .locationName(wedding.getMainLocation() != null ? wedding.getMainLocation().getName() : null)
                .targetType("EVENT")
                .targetId(wedding.getId())
                .eventId(wedding.getId())
                .participants(List.of(toParticipantDto(husband), toParticipantDto(wife)))
                .build();
    }

    private AnniversaryParticipantDto toParticipantDto(Person p) {
        return AnniversaryParticipantDto.builder()
                .personId(p.getId())
                .givenName(p.getCachedGivenName())
                .surname(p.getCachedSurname())
                .sex(p.getSex())
                .lifeState(p.getLifeState())
                .archived(Boolean.TRUE.equals(p.getIsArchived()))
                .build();
    }

    private LocalDate calculateNextOccurrence(LocalDate today, int month, int day) {
        LocalDate thisYearDate = safeLocalDate(today.getYear(), month, day);
        if (!thisYearDate.isBefore(today)) {
            return thisYearDate;
        }
        return safeLocalDate(today.getYear() + 1, month, day);
    }

    private LocalDate safeLocalDate(int year, int month, int day) {
        int maxDay = YearMonth.of(year, month).lengthOfMonth();
        return LocalDate.of(year, month, Math.min(day, maxDay));
    }

    private String formatExactDate(Integer year, int month, int day) {
        if (year != null) {
            return String.format("%02d.%02d.%d", day, month, year);
        }
        return String.format("%02d.%02d", day, month);
    }

    private String formatAnnualDate(int month, int day) {
        String monthName = (month >= 1 && month <= 12) ? POLISH_MONTHS_GENITIVE[month] : String.valueOf(month);
        return day + " " + monthName;
    }

    private boolean matchesSearch(AnniversaryItemDto item, String normSearch) {
        if (normSearch.isEmpty()) {
            return true;
        }
        StringBuilder sb = new StringBuilder();
        if (item.getTypeLabel() != null) sb.append(item.getTypeLabel()).append(' ');
        if (item.getLocationName() != null) sb.append(item.getLocationName()).append(' ');
        if (item.getAnnualDateText() != null) sb.append(item.getAnnualDateText()).append(' ');
        if (item.getDateText() != null) sb.append(item.getDateText()).append(' ');
        for (AnniversaryParticipantDto p : item.getParticipants()) {
            if (p.getGivenName() != null) sb.append(p.getGivenName()).append(' ');
            if (p.getSurname() != null) sb.append(p.getSurname()).append(' ');
        }
        return sb.toString().toLowerCase().contains(normSearch);
    }

    private Comparator<AnniversaryItemDto> buildComparator(String sortBy) {
        String mode = sortBy != null ? sortBy.trim().toUpperCase() : "UPCOMING";
        Comparator<Integer> nullSafeIntAsc = Comparator.nullsLast(Integer::compareTo);
        Comparator<Integer> nullSafeIntDesc = Comparator.nullsLast(Comparator.reverseOrder());

        return switch (mode) {
            case "CALENDAR_ASC" -> Comparator
                    .comparing(AnniversaryItemDto::getMonth, nullSafeIntAsc)
                    .thenComparing(AnniversaryItemDto::getDay, nullSafeIntAsc)
                    .thenComparing(AnniversaryItemDto::getId);
            case "CALENDAR_DESC" -> Comparator
                    .comparing(AnniversaryItemDto::getMonth, nullSafeIntDesc)
                    .thenComparing(AnniversaryItemDto::getDay, nullSafeIntDesc)
                    .thenComparing(AnniversaryItemDto::getId);
            case "YEARS_DESC" -> Comparator
                    .comparing(AnniversaryItemDto::getYearsCount, nullSafeIntDesc)
                    .thenComparingInt(AnniversaryItemDto::getDaysUntil)
                    .thenComparing(AnniversaryItemDto::getId);
            case "YEARS_ASC" -> Comparator
                    .comparing(AnniversaryItemDto::getYearsCount, nullSafeIntAsc)
                    .thenComparingInt(AnniversaryItemDto::getDaysUntil)
                    .thenComparing(AnniversaryItemDto::getId);
            case "SURNAME_ASC" -> Comparator
                    .comparing(this::extractPrimaryParticipantSortName, String.CASE_INSENSITIVE_ORDER)
                    .thenComparingInt(AnniversaryItemDto::getDaysUntil);
            default -> Comparator
                    .comparingInt(AnniversaryItemDto::getDaysUntil)
                    .thenComparing(AnniversaryItemDto::getMonth, nullSafeIntAsc)
                    .thenComparing(AnniversaryItemDto::getDay, nullSafeIntAsc)
                    .thenComparing(AnniversaryItemDto::getId);
        };
    }

    private String extractPrimaryParticipantSortName(AnniversaryItemDto item) {
        if (item.getParticipants() == null || item.getParticipants().isEmpty()) {
            return "";
        }
        AnniversaryParticipantDto first = item.getParticipants().getFirst();
        return ((first.getSurname() != null ? first.getSurname() : "") + " "
                + (first.getGivenName() != null ? first.getGivenName() : "")).trim();
    }
}