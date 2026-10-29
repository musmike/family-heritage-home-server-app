package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EventTimelineService {

    private final EventRepository eventRepository;
    private final UserCodeRepository userCodeRepository;
    private final TranslationRepository translationRepository;
    private final FamilyChildRepository familyChildRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;

    private static final Map<String, String> DEFAULT_EVENT_TYPE_LABELS = Map.of(
            "BIRTH", "Narodziny",
            "WEDDING", "Ślub",
            "DEATH", "Śmierć",
            "BURIAL", "Pochówek"
    );

    @Transactional
    public EventsTimelinePageDto getEventsTimeline(
            String search,
            List<String> types,
            Integer yearFrom,
            Integer yearTo,
            boolean includeUndated,
            boolean includeArchived,
            String sortOrder,
            int page,
            int size
    ) {
        Map<Long, String> userCodeTranslations = translationRepository
                .findByTableNameAndLanguageCode("user_codes", LanguageCode.PL_PL.getCode())
                .stream()
                .collect(Collectors.toMap(Translation::getRecordId, Translation::getValue, (a, b) -> a));

        List<EventTypeOptionDto> availableTypes = userCodeRepository
                .findByCategoryOrderByCodeAsc(CodeCategory.EVENT_TYPE.name())
                .stream()
                .map(uc -> EventTypeOptionDto.builder()
                        .code(uc.getCode())
                        .label(resolveEventTypeLabel(uc, userCodeTranslations))
                        .system(Boolean.TRUE.equals(uc.getIsSystem()))
                        .build())
                .toList();

        Set<String> selectedTypes = (types == null || types.isEmpty())
                ? Set.of()
                : types.stream()
                .filter(Objects::nonNull)
                .map(s -> s.trim().toUpperCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());

        String normSearch = search != null ? search.trim().toLowerCase() : "";
        boolean descending = "DESC".equalsIgnoreCase(sortOrder);

        Map<Long, List<String>> parentNamesByChildId = buildParentNamesMap();

        List<Event> allEvents = eventRepository.findAll();
        Integer minAvailableYear = null;
        Integer maxAvailableYear = null;
        for (Event e : allEvents) {
            Integer y = extractEventYear(e);
            if (y != null) {
                minAvailableYear = (minAvailableYear == null) ? y : Math.min(minAvailableYear, y);
                maxAvailableYear = (maxAvailableYear == null) ? y : Math.max(maxAvailableYear, y);
            }
        }
        List<ScoredTimelineEvent> matchingEvents = new ArrayList<>();


        for (Event evt : allEvents) {
            String typeCode = evt.getEventType().getCode();
            if (!selectedTypes.isEmpty() && !selectedTypes.contains(typeCode.toUpperCase())) {
                continue;
            }

            List<EventParticipant> participants = new ArrayList<>(evt.getParticipants());
            if (participants.isEmpty()) {
                continue;
            }

            if (!includeArchived && participants.stream().allMatch(ep -> Boolean.TRUE.equals(ep.getPerson().getIsArchived()))) {
                continue;
            }

            Integer eventYear = extractEventYear(evt);
            if (eventYear == null && !includeUndated) {
                continue;
            }
            if (yearFrom != null && (eventYear == null || eventYear < yearFrom)) {
                continue;
            }
            if (yearTo != null && (eventYear == null || eventYear > yearTo)) {
                continue;
            }

            TimelineEventDto dto = toTimelineEventDto(evt, eventYear, userCodeTranslations, parentNamesByChildId);
            if (!matchesSearch(dto, normSearch)) {
                continue;
            }

            LocalDateTime sortKey = resolveSortDateTime(evt, eventYear);
            matchingEvents.add(new ScoredTimelineEvent(dto, sortKey));
        }

        // Sort dated events chronologically (and place undated events at the end)
        Comparator<LocalDateTime> baseOrder = LocalDateTime::compareTo;
        Comparator<LocalDateTime> dateTimeOrder = Comparator.nullsLast(
                descending ? baseOrder.reversed() : baseOrder
        );
        Comparator<ScoredTimelineEvent> datedComp = Comparator
                .comparing(ScoredTimelineEvent::sortDateTime, dateTimeOrder)
                .thenComparing(se -> se.dto().getEventId());

        matchingEvents.sort((a, b) -> {
            boolean aDated = a.dto().getYear() != null;
            boolean bDated = b.dto().getYear() != null;
            if (aDated != bDated) {
                return aDated ? -1 : 1;
            }
            return datedComp.compare(a, b);
        });

        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        int totalEvents = matchingEvents.size();
        int totalPages = (int) Math.ceil((double) totalEvents / safeSize);

        int fromIndex = Math.min(safePage * safeSize, totalEvents);
        int toIndex = Math.min(fromIndex + safeSize, totalEvents);
        List<TimelineEventDto> pageSlice = matchingEvents.subList(fromIndex, toIndex).stream()
                .map(ScoredTimelineEvent::dto)
                .toList();

        // Group pageSlice into Decades -> Years (and undatedEvents)
        Map<Integer, Map<Integer, List<TimelineEventDto>>> decadeYearMap = new LinkedHashMap<>();
        List<TimelineEventDto> undatedList = new ArrayList<>();

        for (TimelineEventDto item : pageSlice) {
            if (item.getYear() == null) {
                undatedList.add(item);
            } else {
                int decade = (item.getYear() / 10) * 10;
                decadeYearMap
                        .computeIfAbsent(decade, d -> new LinkedHashMap<>())
                        .computeIfAbsent(item.getYear(), y -> new ArrayList<>())
                        .add(item);
            }
        }

        List<TimelineDecadeGroupDto> decadeGroups = new ArrayList<>();
        for (Map.Entry<Integer, Map<Integer, List<TimelineEventDto>>> decEntry : decadeYearMap.entrySet()) {
            int decStart = decEntry.getKey();
            List<TimelineYearGroupDto> yearGroups = new ArrayList<>();
            int countInDecade = 0;

            for (Map.Entry<Integer, List<TimelineEventDto>> yrEntry : decEntry.getValue().entrySet()) {
                yearGroups.add(new TimelineYearGroupDto(yrEntry.getKey(), yrEntry.getValue()));
                countInDecade += yrEntry.getValue().size();
            }

            decadeGroups.add(TimelineDecadeGroupDto.builder()
                    .decadeStart(decStart)
                    .decadeLabel(String.format("Lata %d–%d", decStart, decStart + 9))
                    .eventsCount(countInDecade)
                    .years(yearGroups)
                    .build());
        }

        return EventsTimelinePageDto.builder()
                .page(safePage)
                .size(safeSize)
                .totalEvents(totalEvents)
                .totalPages(totalPages)
                .minAvailableYear(minAvailableYear)
                .maxAvailableYear(maxAvailableYear)
                .availableTypes(availableTypes)
                .decades(decadeGroups)
                .undatedEvents(undatedList)
                .build();
    }

    private record ScoredTimelineEvent(TimelineEventDto dto, LocalDateTime sortDateTime) {}

    private TimelineEventDto toTimelineEventDto(
            Event evt,
            Integer eventYear,
            Map<Long, String> userCodeTranslations,
            Map<Long, List<String>> parentNamesByChildId
    ) {
        UserCode typeUc = evt.getEventType();
        String typeCode = typeUc.getCode();
        String typeLabel = resolveEventTypeLabel(typeUc, userCodeTranslations);

        DateDescriptor startDd = evt.getStartDate();
        DateDescriptor endDd = evt.getEndDate();

        List<EventParticipantItemDto> participantDtos = evt.getParticipants().stream()
                .sorted(Comparator.comparing(ep -> ep.getPerson().getId()))
                .map(ep -> {
                    Person p = ep.getPerson();
                    DateDescriptor birthDd = p.getBirthEvent() != null ? p.getBirthEvent().getStartDate() : null;

                    AgeAtEventResult ageRes = !"BIRTH".equals(typeCode)
                            ? calculateAgeAtEvent(birthDd, startDd)
                            : new AgeAtEventResult(null, false);

                    List<String> parents = "BIRTH".equals(typeCode)
                            ? parentNamesByChildId.getOrDefault(p.getId(), List.of())
                            : List.of();

                    return EventParticipantItemDto.builder()
                            .personId(p.getId())
                            .givenName(p.getCachedGivenName())
                            .surname(p.getCachedSurname())
                            .sex(p.getSex())
                            .lifeState(p.getLifeState())
                            .archived(Boolean.TRUE.equals(p.getIsArchived()))
                            .privateRecord(false)
                            .roleCode(ep.getRole().getParticipantRole().getCode())
                            .ageAtEvent(ageRes.age())
                            .ageApproximate(ageRes.approximate())
                            .parentNames(parents)
                            .build();
                })
                .toList();

        List<EventAttributeItemDto> attributes = eventAttrValueRepository.findByEvent(evt).stream()
                .map(eav -> EventAttributeItemDto.builder()
                        .definitionCode(eav.getAttributeDictionaryValue().getAttributeDefinition().getCode())
                        .value(eav.getAttributeDictionaryValue().getCode())
                        .build())
                .toList();

        return TimelineEventDto.builder()
                .eventId(evt.getId())
                .typeCode(typeCode)
                .typeLabel(typeLabel)
                .systemType(Boolean.TRUE.equals(typeUc.getIsSystem()))
                .year(eventYear)
                .dateText(formatEventDates(startDd, endDd))
                .locationName(evt.getMainLocation() != null ? evt.getMainLocation().getName() : null)
                .participants(participantDtos)
                .attributes(attributes)
                .build();
    }

    private Map<Long, List<String>> buildParentNamesMap() {
        Map<Long, List<String>> map = new HashMap<>();
        for (FamilyChild fc : familyChildRepository.findAll()) {
            Long childId = fc.getChild().getId();
            Family fam = fc.getFamily();
            List<String> parents = map.computeIfAbsent(childId, k -> new ArrayList<>());
            if (fam.getHusband() != null) {
                parents.add(formatParentName(fam.getHusband()));
            }
            if (fam.getWife() != null) {
                parents.add(formatParentName(fam.getWife()));
            }
        }
        return map;
    }

    private String formatParentName(Person p) {
        return ((p.getCachedSurname() != null ? p.getCachedSurname() : "") + " "
                + (p.getCachedGivenName() != null ? p.getCachedGivenName() : "")).trim();
    }

    private String resolveEventTypeLabel(UserCode uc, Map<Long, String> translations) {
        if (uc.getId() != null && translations.containsKey(uc.getId())) {
            return translations.get(uc.getId());
        }
        return DEFAULT_EVENT_TYPE_LABELS.getOrDefault(uc.getCode(), uc.getCode());
    }

    private Integer extractEventYear(Event evt) {
        if (evt.getStartDate() != null && evt.getStartDate().getStartYear() != null) {
            return evt.getStartDate().getStartYear();
        }
        if (evt.getEndDate() != null && evt.getEndDate().getStartYear() != null) {
            return evt.getEndDate().getStartYear();
        }
        return null;
    }

    private LocalDateTime resolveSortDateTime(Event evt, Integer eventYear) {
        if (evt.getCachedStartSortDateTime() != null) {
            return evt.getCachedStartSortDateTime();
        }
        if (evt.getStartDate() != null && evt.getStartDate().getSortDateTimeMin() != null) {
            return evt.getStartDate().getSortDateTimeMin();
        }
        if (eventYear != null) {
            return LocalDateTime.of(eventYear, 1, 1, 0, 0);
        }
        return null;
    }

    private boolean matchesSearch(TimelineEventDto dto, String normSearch) {
        if (normSearch.isEmpty()) {
            return true;
        }
        StringBuilder sb = new StringBuilder();
        if (dto.getTypeLabel() != null) sb.append(dto.getTypeLabel()).append(' ');
        if (dto.getLocationName() != null) sb.append(dto.getLocationName()).append(' ');
        for (EventParticipantItemDto p : dto.getParticipants()) {
            if (p.getGivenName() != null) sb.append(p.getGivenName()).append(' ');
            if (p.getSurname() != null) sb.append(p.getSurname()).append(' ');
        }
        for (EventAttributeItemDto attr : dto.getAttributes()) {
            if (attr.getValue() != null) sb.append(attr.getValue()).append(' ');
        }
        return sb.toString().toLowerCase().contains(normSearch);
    }

    private record AgeAtEventResult(Integer age, boolean approximate) {}

    private AgeAtEventResult calculateAgeAtEvent(DateDescriptor birth, DateDescriptor target) {
        if (birth == null || birth.getStartYear() == null || target == null || target.getStartYear() == null) {
            return new AgeAtEventResult(null, false);
        }
        if (target.getStartYear() < birth.getStartYear()) {
            return new AgeAtEventResult(null, false);
        }

        boolean birthExact = birth.getDateType() == DateType.SINGLE
                && birth.getStartQualifier() == DateQualifier.EXACT
                && birth.getStartMonth() != null
                && birth.getStartDay() != null;
        boolean targetExact = target.getDateType() == DateType.SINGLE
                && target.getStartQualifier() == DateQualifier.EXACT
                && target.getStartMonth() != null
                && target.getStartDay() != null;

        if (birthExact && targetExact) {
            LocalDate bDate = LocalDate.of(birth.getStartYear(), birth.getStartMonth(), birth.getStartDay());
            LocalDate tDate = LocalDate.of(target.getStartYear(), target.getStartMonth(), target.getStartDay());
            if (!tDate.isBefore(bDate)) {
                return new AgeAtEventResult(Period.between(bDate, tDate).getYears(), false);
            }
        }
        boolean approx = (birth.getStartQualifier() != null && birth.getStartQualifier() != DateQualifier.EXACT)
                || (target.getStartQualifier() != null && target.getStartQualifier() != DateQualifier.EXACT)
                || birth.getDateType() == DateType.RANGE
                || target.getDateType() == DateType.RANGE;
        return new AgeAtEventResult(target.getStartYear() - birth.getStartYear(), approx);
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

    @Transactional
    public TimelineEventDto getEventById(Long eventId) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        Map<Long, String> userCodeTranslations = translationRepository
                .findByTableNameAndLanguageCode("user_codes", LanguageCode.PL_PL.getCode())
                .stream()
                .collect(Collectors.toMap(Translation::getRecordId, Translation::getValue, (a, b) -> a));

        Map<Long, List<String>> parentNamesByChildId = buildParentNamesMap();
        Integer eventYear = extractEventYear(evt);

        return toTimelineEventDto(evt, eventYear, userCodeTranslations, parentNamesByChildId);
    }
}