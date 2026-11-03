package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EventTimelineService {

    private final EventRepository eventRepository;
    private final EventParentLinkRepository eventParentLinkRepository;
    private final UserCodeRepository userCodeRepository;
    private final TranslationRepository translationRepository;
    private final FamilyChildRepository familyChildRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;
    private final EventTypeParticipantRoleRepository etprRepository;
    private final LocationRepository locationRepository;
    private final EventLocationRepository eventLocationRepository;
    private final PersonRepository personRepository;
    private final MediaStorageService storageService;
    private final MediaService mediaService;
    private final ActivityLogService activityLogService;

    private static final Map<String, String> DEFAULT_EVENT_TYPE_LABELS = Map.of(
            "BIRTH", "Narodziny",
            "WEDDING", "Ślub",
            "WEDDING_CEREMONY", "Ceremonia ślubu",
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
        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        List<EventTypeOptionDto> availableTypes = buildAvailableTypes(userCodeTranslations);

        Set<String> selectedTypes = (types == null || types.isEmpty())
                ? Set.of()
                : types.stream()
                .filter(Objects::nonNull)
                .map(s -> s.trim().toUpperCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());

        String normSearch = search != null ? search.trim().toLowerCase(Locale.ROOT) : "";
        boolean descending = !"ASC".equalsIgnoreCase(sortOrder);

        Map<Long, List<String>> parentNamesByChildId = buildParentNamesMap();
        Map<Long, List<EventAttributeItemDto>> attrsByEventId = loadAllAttributesByEventId();

        List<Event> allEvents = eventRepository.findAllWithFullTimelineDetails();

        Map<Long, List<Event>> subEventsByParentId = new HashMap<>();
        for (Event e : allEvents) {
            for (Event parent : e.getOrderedParentEvents()) {
                if (parent.getId() != null) {
                    List<Event> list = subEventsByParentId.computeIfAbsent(parent.getId(), k -> new ArrayList<>());
                    if (list.stream().noneMatch(existing -> Objects.equals(existing.getId(), e.getId()))) {
                        list.add(e);
                    }
                }
            }
        }

        Integer minAvailableYear = null;
        Integer maxAvailableYear = null;
        for (Event e : allEvents) {
            if (e.hasAnyParentEvent()) {
                continue;
            }
            Integer y = extractEventYear(e);
            if (y != null) {
                minAvailableYear = (minAvailableYear == null) ? y : Math.min(minAvailableYear, y);
                maxAvailableYear = (maxAvailableYear == null) ? y : Math.max(maxAvailableYear, y);
            }
        }

        List<ScoredTimelineEvent> matchingEvents = new ArrayList<>();

        for (Event evt : allEvents) {
            if (evt.hasAnyParentEvent()) {
                continue;
            }

            List<EventParticipant> participants = new ArrayList<>(evt.getParticipants());
            List<Event> subEvents = subEventsByParentId.getOrDefault(evt.getId(), List.of());

            if (participants.isEmpty() && subEvents.isEmpty()) {
                continue;
            }

            if (!includeArchived && !participants.isEmpty() && participants.stream()
                    .allMatch(ep -> ep.getPerson() != null && Boolean.TRUE.equals(ep.getPerson().getIsArchived()))) {
                continue;
            }

            if (!selectedTypes.isEmpty() && !matchesSelectedTypes(evt, subEvents, selectedTypes)) {
                continue;
            }

            Integer eventYear = extractEventYear(evt);
            if (eventYear == null) {
                if (!includeUndated) {
                    continue;
                }
            } else {
                if (yearFrom != null && eventYear < yearFrom) {
                    continue;
                }
                if (yearTo != null && eventYear > yearTo) {
                    continue;
                }
            }

            TimelineEventDto dto = toTimelineEventDto(
                    evt,
                    eventYear,
                    userCodeTranslations,
                    parentNamesByChildId,
                    attrsByEventId,
                    subEvents
            );

            if (!matchesSearch(dto, normSearch)) {
                continue;
            }

            LocalDateTime sortKey = resolveSortDateTime(evt, eventYear);
            matchingEvents.add(new ScoredTimelineEvent(dto, sortKey));
        }

        Comparator<LocalDateTime> baseOrder = LocalDateTime::compareTo;
        Comparator<LocalDateTime> dateTimeOrder = Comparator.nullsLast(
                descending ? baseOrder.reversed() : baseOrder
        );
        Comparator<Long> idOrder = descending ? Comparator.reverseOrder() : Comparator.naturalOrder();
        Comparator<ScoredTimelineEvent> datedComp = Comparator
                .comparing(ScoredTimelineEvent::sortDateTime, dateTimeOrder)
                .thenComparing(se -> se.dto().getEventId(), idOrder);

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
        List<ScoredTimelineEvent> pageSlice = matchingEvents.subList(fromIndex, toIndex);

        Map<Integer, Map<Integer, List<ScoredTimelineEvent>>> decadeYearMap = new LinkedHashMap<>();
        List<TimelineEventDto> undatedList = new ArrayList<>();

        for (ScoredTimelineEvent scoredItem : pageSlice) {
            TimelineEventDto item = scoredItem.dto();
            if (item.getYear() == null) {
                undatedList.add(item);
            } else {
                int decade = (item.getYear() / 10) * 10;
                decadeYearMap
                        .computeIfAbsent(decade, d -> new LinkedHashMap<>())
                        .computeIfAbsent(item.getYear(), y -> new ArrayList<>())
                        .add(scoredItem);
            }
        }

        Comparator<ScoredTimelineEvent> janToDecComp = Comparator
                .comparing(ScoredTimelineEvent::sortDateTime, Comparator.nullsLast(LocalDateTime::compareTo))
                .thenComparing(se -> se.dto().getEventId());

        List<TimelineDecadeGroupDto> decadeGroups = new ArrayList<>();
        for (Map.Entry<Integer, Map<Integer, List<ScoredTimelineEvent>>> decEntry : decadeYearMap.entrySet()) {
            int decStart = decEntry.getKey();
            List<TimelineYearGroupDto> yearGroups = new ArrayList<>();
            int countInDecade = 0;

            for (Map.Entry<Integer, List<ScoredTimelineEvent>> yrEntry : decEntry.getValue().entrySet()) {
                List<TimelineEventDto> janToDecEvents = yrEntry.getValue().stream()
                        .sorted(janToDecComp)
                        .map(ScoredTimelineEvent::dto)
                        .toList();
                yearGroups.add(new TimelineYearGroupDto(yrEntry.getKey(), janToDecEvents));
                countInDecade += janToDecEvents.size();
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

    @Transactional
    public List<EventTypeOptionDto> getAvailableEventTypes() {
        return buildAvailableTypes(loadUserCodeTranslations());
    }

    @Transactional
    public TimelineEventDto getEventById(Long eventId) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        Map<Long, List<String>> parentNamesByChildId = buildParentNamesMap();
        Map<Long, List<EventAttributeItemDto>> attrsByEventId = loadAllAttributesByEventId();

        List<Event> subEvents = findAllSubEventsForParent(eventId);

        return toTimelineEventDto(
                evt,
                extractEventYear(evt),
                userCodeTranslations,
                parentNamesByChildId,
                attrsByEventId,
                subEvents
        );
    }

    @Transactional
    public TimelineEventDto createEvent(SaveEventRequestDto req) {
        Event evt = new Event();
        applyEventSaveRequest(evt, req);
        evt = eventRepository.saveAndFlush(evt);

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        String label = evt.getTitle() != null
                ? evt.getTitle()
                : resolveEventTypeLabel(evt.getEventType(), userCodeTranslations);

        activityLogService.logActivity(
                ActivityActionType.EVENT_CREATED,
                "Dodano wydarzenie: " + label,
                "EVENT",
                evt.getId()
        );

        return getEventById(evt.getId());
    }

    @Transactional
    public TimelineEventDto updateEvent(Long eventId, SaveEventRequestDto req) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        applyEventSaveRequest(evt, req);
        evt = eventRepository.saveAndFlush(evt);
        locationRepository.deleteOrphanLocations();
        mediaService.syncEventMediaPathsOnEventChange(evt);

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        String label = evt.getTitle() != null
                ? evt.getTitle()
                : resolveEventTypeLabel(evt.getEventType(), userCodeTranslations);

        activityLogService.logActivity(
                ActivityActionType.EVENT_UPDATED,
                "Zaktualizowano wydarzenie: " + label,
                "EVENT",
                evt.getId()
        );

        return getEventById(evt.getId());
    }

    @Transactional
    public TimelineEventDto updateEventDetails(Long eventId, UpdateEventDetailsRequestDto req) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        if (req.getTitle() != null) {
            String trimmedTitle = req.getTitle().trim();
            if (trimmedTitle.isEmpty() && evt.getParticipants().size() > 3) {
                throw new IllegalArgumentException(
                        "Gdy w wydarzeniu uczestniczą więcej niż 3 osoby, podanie własnego tytułu wydarzenia jest wymagane."
                );
            }
            evt.setTitle(trimmedTitle.isEmpty() ? null : trimmedTitle);
        }

        if (req.getDescription() != null) {
            evt.setDescription(!req.getDescription().isBlank() ? req.getDescription().trim() : null);
        }

        if (req.getFolderSlug() != null) {
            evt.setFolderSlug(!req.getFolderSlug().isBlank() ? storageService.toSnakeCase(req.getFolderSlug()) : null);
        }

        if (req.getParentEventIds() != null) {
            applyParentEvents(evt, req.getParentEventIds());
        } else if (req.getParentEventId() != null) {
            applyParentEvents(evt, List.of(req.getParentEventId()));
        }

        evt = eventRepository.saveAndFlush(evt);
        mediaService.syncEventMediaPathsOnEventChange(evt);

        activityLogService.logActivity(
                ActivityActionType.EVENT_UPDATED,
                "Zaktualizowano szczegóły wydarzenia",
                "EVENT",
                eventId
        );

        return getEventById(eventId);
    }

    @Transactional
    public void deleteEvent(Long eventId) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        mediaService.prepareEventDeletion(eventId);

        eventRepository.delete(evt);
        eventRepository.flush();
        locationRepository.deleteOrphanLocations();

        activityLogService.logActivity(
                ActivityActionType.EVENT_DELETED,
                "Usunięto wydarzenie",
                "EVENT",
                null
        );
    }

    private List<Event> findAllSubEventsForParent(Long parentEventId) {
        List<Event> directSubs = eventRepository
                .findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(parentEventId);
        List<EventParentLink> linkedSubs = eventParentLinkRepository
                .findByParentEventIdOrderBySortOrderAscIdAsc(parentEventId);

        List<Event> merged = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();
        for (Event e : directSubs) {
            if (seenIds.add(e.getId())) {
                merged.add(e);
            }
        }
        for (EventParentLink link : linkedSubs) {
            Event child = link.getChildEvent();
            if (child != null && seenIds.add(child.getId())) {
                merged.add(child);
            }
        }
        return merged;
    }

    private void applyEventSaveRequest(Event evt, SaveEventRequestDto req) {
        List<String> codes = req.getTypeCodes() == null ? List.of() :
                req.getTypeCodes().stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .distinct()
                        .toList();

        if (codes.isEmpty() && evt.getEventType() == null) {
            throw new IllegalArgumentException("Należy wybrać przynajmniej jeden typ wydarzenia.");
        }

        if (!codes.isEmpty()) {
            List<UserCode> resolvedCodes = new ArrayList<>();
            for (String code : codes) {
                UserCode uc = userCodeRepository
                        .findByCategoryAndCode(CodeCategory.EVENT_TYPE.name(), code.toUpperCase(Locale.ROOT))
                        .orElseThrow(() -> new IllegalArgumentException("Nieznany typ wydarzenia: " + code));
                resolvedCodes.add(uc);
            }
            evt.setEventType(resolvedCodes.getFirst());
            evt.getAssignedTypes().clear();
            evt.getAssignedTypes().addAll(resolvedCodes);
        }

        int incomingParticipantsCount = req.getParticipants() != null
                ? req.getParticipants().size()
                : evt.getParticipants().size();
        String trimmedTitle = (req.getTitle() != null && !req.getTitle().isBlank())
                ? req.getTitle().trim()
                : null;

        if (incomingParticipantsCount > 3 && trimmedTitle == null) {
            throw new IllegalArgumentException(
                    "Gdy w wydarzeniu uczestniczą więcej niż 3 osoby, podanie własnego tytułu wydarzenia jest wymagane."
            );
        }

        evt.setTitle(trimmedTitle);
        evt.setDescription(req.getDescription() != null && !req.getDescription().isBlank()
                ? req.getDescription().trim()
                : null);
        evt.setFolderSlug(req.getFolderSlug() != null && !req.getFolderSlug().isBlank()
                ? storageService.toSnakeCase(req.getFolderSlug())
                : null);

        List<Long> requestedParentIds = new ArrayList<>();
        if (req.getParentEventIds() != null && !req.getParentEventIds().isEmpty()) {
            requestedParentIds.addAll(req.getParentEventIds());
        } else if (req.getParentEventId() != null) {
            requestedParentIds.add(req.getParentEventId());
        }
        applyParentEvents(evt, requestedParentIds);

        // Location (never attach location to BURIAL)
        if (!EventType.BURIAL.name().equals(evt.getEventType().getCode())) {
            String locName = req.getLocationName() != null && !req.getLocationName().isBlank()
                    ? req.getLocationName().trim()
                    : null;
            if (locName != null) {
                Location loc = locationRepository.findByName(locName)
                        .orElseGet(() -> locationRepository.saveAndFlush(new Location(locName)));
                evt.setMainLocation(loc);
            } else {
                evt.setMainLocation(null);
            }
        }

        // Date & Time Descriptors (Start + End + Validation)
        applyAndValidateDateDescriptors(evt, req);

        evt = eventRepository.saveAndFlush(evt);

        // Sync EventLocation
        if (evt.getMainLocation() != null) {
            Event finalEvt = evt;
            EventLocation el = eventLocationRepository.findByEvent(evt).orElseGet(() -> {
                EventLocation newEl = new EventLocation();
                newEl.setEvent(finalEvt);
                return newEl;
            });
            el.setLocation(evt.getMainLocation());
            eventLocationRepository.saveAndFlush(el);
        } else {
            eventLocationRepository.findByEvent(evt).ifPresent(el -> {
                eventLocationRepository.delete(el);
                eventLocationRepository.flush();
            });
        }

        // Participants (DB persons + text-only participants)
        if (req.getParticipants() != null) {
            evt.getParticipants().clear();
            eventRepository.saveAndFlush(evt);

            Set<Long> seenPersonIds = new HashSet<>();
            for (SaveEventParticipantRequestDto pReq : req.getParticipants()) {
                String rCode = (pReq.getRoleCode() != null && !pReq.getRoleCode().isBlank())
                        ? pReq.getRoleCode().trim().toUpperCase(Locale.ROOT)
                        : EventParticipantRole.PARTICIPANT.name();

                EventTypeParticipantRole etpr = resolveEtprForEvent(evt, rCode);

                if (pReq.getPersonId() != null) {
                    if (!seenPersonIds.add(pReq.getPersonId())) {
                        continue;
                    }
                    Person person = personRepository.findById(pReq.getPersonId())
                            .orElseThrow(() -> new IllegalArgumentException("Person not found: " + pReq.getPersonId()));
                    evt.addParticipant(new EventParticipant(evt, person, etpr));
                } else if (pReq.getParticipantText() != null && !pReq.getParticipantText().isBlank()) {
                    PersonSex pSex = pReq.getParticipantSex() != null ? pReq.getParticipantSex() : PersonSex.UNKNOWN;
                    evt.addParticipant(new EventParticipant(evt, pReq.getParticipantText().trim(), pSex, etpr));
                }
            }
        }
    }

    private void applyAndValidateDateDescriptors(Event evt, SaveEventRequestDto req) {
        if (req.getStartYear() != null) {
            DateDescriptor startDd = evt.getStartDate() != null ? evt.getStartDate() : new DateDescriptor();
            boolean startIsBetween = Boolean.TRUE.equals(req.getIsStartBetweenRange())
                    && (req.getStartRangeEndYear() != null || req.getStartRangeEndHour() != null);

            startDd.setDateType(startIsBetween ? DateType.RANGE : DateType.SINGLE);
            startDd.setStartQualifier(parseQualifier(req.getStartQualifier()));
            startDd.setStartYear(req.getStartYear());
            startDd.setStartMonth(req.getStartMonth());
            startDd.setStartDay(req.getStartDay());
            startDd.setStartTimeQualifier(req.getStartHour() != null ? parseQualifier(req.getStartTimeQualifier()) : null);
            startDd.setStartHour(req.getStartHour());
            startDd.setStartMinute(req.getStartMinute());
            startDd.setStartSecond(req.getStartSecond());

            if (startIsBetween) {
                Integer rEndYear = req.getStartRangeEndYear() != null ? req.getStartRangeEndYear() : req.getStartYear();
                Integer rEndMonth = req.getStartRangeEndMonth() != null
                        ? req.getStartRangeEndMonth()
                        : (Objects.equals(rEndYear, req.getStartYear()) ? req.getStartMonth() : null);
                Integer rEndDay = req.getStartRangeEndDay() != null
                        ? req.getStartRangeEndDay()
                        : (Objects.equals(rEndMonth, req.getStartMonth()) ? req.getStartDay() : null);

                startDd.setEndQualifier(parseQualifier(req.getStartRangeEndQualifier()));
                startDd.setEndYear(rEndYear);
                startDd.setEndMonth(rEndMonth);
                startDd.setEndDay(rEndDay);
                startDd.setEndTimeQualifier(req.getStartRangeEndHour() != null
                        ? parseQualifier(req.getStartRangeEndTimeQualifier())
                        : null);
                startDd.setEndHour(req.getStartRangeEndHour());
                startDd.setEndMinute(req.getStartRangeEndMinute());
                startDd.setEndSecond(req.getStartRangeEndSecond());

                validateInternalBetweenRange(startDd, "daty początkowej");
            } else {
                clearRangeEndFields(startDd);
            }

            startDd.recalculateSortDates();
            evt.setStartDate(startDd);
            evt.setCachedStartSortDateTime(calculateAverageDate(startDd));
        } else if (req.getStartQualifier() != null) {
            evt.setStartDate(null);
            evt.setCachedStartSortDateTime(null);
        }

        boolean wantsEndDate = Boolean.TRUE.equals(req.getHasEndDate())
                || (Boolean.TRUE.equals(req.getIsRange()) && req.getEndYear() != null);

        if (wantsEndDate && (req.getEndYear() != null || (req.getEndHour() != null && req.getStartYear() != null))) {
            DateDescriptor endDd = evt.getEndDate() != null ? evt.getEndDate() : new DateDescriptor();
            Integer resolvedEndYear = req.getEndYear() != null ? req.getEndYear() : req.getStartYear();
            Integer resolvedEndMonth = req.getEndMonth() != null
                    ? req.getEndMonth()
                    : (req.getEndYear() == null ? req.getStartMonth() : null);
            Integer resolvedEndDay = req.getEndDay() != null
                    ? req.getEndDay()
                    : (req.getEndYear() == null && req.getEndMonth() == null ? req.getStartDay() : null);

            boolean endIsBetween = Boolean.TRUE.equals(req.getIsEndBetweenRange())
                    && (req.getEndRangeEndYear() != null || req.getEndRangeEndHour() != null);

            endDd.setDateType(endIsBetween ? DateType.RANGE : DateType.SINGLE);
            endDd.setStartQualifier(parseQualifier(req.getEndQualifier()));
            endDd.setStartYear(resolvedEndYear);
            endDd.setStartMonth(resolvedEndMonth);
            endDd.setStartDay(resolvedEndDay);
            endDd.setStartTimeQualifier(req.getEndHour() != null ? parseQualifier(req.getEndTimeQualifier()) : null);
            endDd.setStartHour(req.getEndHour());
            endDd.setStartMinute(req.getEndMinute());
            endDd.setStartSecond(req.getEndSecond());

            if (endIsBetween) {
                Integer rEndYear = req.getEndRangeEndYear() != null ? req.getEndRangeEndYear() : resolvedEndYear;
                Integer rEndMonth = req.getEndRangeEndMonth() != null
                        ? req.getEndRangeEndMonth()
                        : (Objects.equals(rEndYear, resolvedEndYear) ? resolvedEndMonth : null);
                Integer rEndDay = req.getEndRangeEndDay() != null
                        ? req.getEndRangeEndDay()
                        : (Objects.equals(rEndMonth, resolvedEndMonth) ? resolvedEndDay : null);

                endDd.setEndQualifier(parseQualifier(req.getEndRangeEndQualifier()));
                endDd.setEndYear(rEndYear);
                endDd.setEndMonth(rEndMonth);
                endDd.setEndDay(rEndDay);
                endDd.setEndTimeQualifier(req.getEndRangeEndHour() != null
                        ? parseQualifier(req.getEndRangeEndTimeQualifier())
                        : null);
                endDd.setEndHour(req.getEndRangeEndHour());
                endDd.setEndMinute(req.getEndRangeEndMinute());
                endDd.setEndSecond(req.getEndRangeEndSecond());

                validateInternalBetweenRange(endDd, "daty końcowej");
            } else {
                clearRangeEndFields(endDd);
            }

            endDd.recalculateSortDates();
            evt.setEndDate(endDd);
            evt.setCachedEndSortDateTime(calculateAverageDate(endDd));
        } else {
            evt.setEndDate(null);
            evt.setCachedEndSortDateTime(null);
        }

        // Cross-validate Start DateDescriptor vs End DateDescriptor
        if (evt.getStartDate() != null && evt.getEndDate() != null) {
            LocalDateTime sMin = evt.getStartDate().getSortDateTimeMin();
            LocalDateTime sMax = evt.getStartDate().getSortDateTimeMax();
            LocalDateTime eMin = evt.getEndDate().getSortDateTimeMin();
            LocalDateTime eMax = evt.getEndDate().getSortDateTimeMax();

            if (sMin != null && eMin != null && eMin.isBefore(sMin)) {
                throw new IllegalArgumentException(
                        "Początek daty lub godziny końcowej wydarzenia nie może być wcześniejszy niż początek daty początkowej."
                );
            }
            if (sMax != null && eMax != null && eMax.isBefore(sMax)) {
                throw new IllegalArgumentException(
                        "Koniec daty lub godziny końcowej wydarzenia nie może być wcześniejszy niż koniec daty początkowej."
                );
            }
        }
    }

    private void validateInternalBetweenRange(DateDescriptor dd, String label) {
        LocalDateTime firstMin = DateDescriptor.computePointMin(
                dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                dd.getStartHour(), dd.getStartMinute(), dd.getStartSecond()
        );
        LocalDateTime secondMin = DateDescriptor.computePointMin(
                dd.getEndYear(), dd.getEndMonth(), dd.getEndDay(),
                dd.getEndHour(), dd.getEndMinute(), dd.getEndSecond()
        );
        LocalDateTime firstMax = DateDescriptor.computePointMax(
                dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                dd.getStartHour(), dd.getStartMinute(), dd.getStartSecond()
        );
        LocalDateTime secondMax = DateDescriptor.computePointMax(
                dd.getEndYear(), dd.getEndMonth(), dd.getEndDay(),
                dd.getEndHour(), dd.getEndMinute(), dd.getEndSecond()
        );

        if (firstMin != null && secondMin != null && secondMin.isBefore(firstMin)) {
            throw new IllegalArgumentException(
                    "W przedziale 'między ... a ...' dla " + label + " drugi punkt czasu nie może być wcześniejszy niż pierwszy."
            );
        }
        if (firstMax != null && secondMax != null && secondMax.isBefore(firstMax)) {
            throw new IllegalArgumentException(
                    "W przedziale 'między ... a ...' dla " + label + " drugi punkt czasu nie może być wcześniejszy niż pierwszy."
            );
        }
    }

    private void clearRangeEndFields(DateDescriptor dd) {
        dd.setEndQualifier(null);
        dd.setEndYear(null);
        dd.setEndMonth(null);
        dd.setEndDay(null);
        dd.setEndTimeQualifier(null);
        dd.setEndHour(null);
        dd.setEndMinute(null);
        dd.setEndSecond(null);
    }

    private void applyParentEvents(Event evt, List<Long> parentIds) {
        List<Long> distinctIds = parentIds == null ? List.of() :
                parentIds.stream()
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();

        if (distinctIds.isEmpty()) {
            evt.setParentEvent(null);
            evt.getParentLinks().clear();
            return;
        }

        List<Event> resolvedParents = new ArrayList<>();
        for (Long pid : distinctIds) {
            if (evt.getId() != null && pid.equals(evt.getId())) {
                throw new IllegalArgumentException("Wydarzenie nie może być swoim własnym wydarzeniem nadrzędnym.");
            }
            Event parent = eventRepository.findById(pid)
                    .orElseThrow(() -> new IllegalArgumentException("Nie znaleziono wydarzenia nadrzędnego: " + pid));
            if (evt.getId() != null && hasAncestorCycle(parent, evt.getId(), new HashSet<>())) {
                throw new IllegalArgumentException("Wykryto cykliczną hierarchię wydarzeń nadrzędnych.");
            }
            resolvedParents.add(parent);
        }

        evt.setParentEvent(resolvedParents.getFirst());

        if (evt.getId() == null) {
            evt = eventRepository.saveAndFlush(evt);
        }

        evt.getParentLinks().clear();
        eventRepository.saveAndFlush(evt);

        for (int i = 0; i < resolvedParents.size(); i++) {
            evt.getParentLinks().add(new EventParentLink(evt, resolvedParents.get(i), i));
        }
    }

    private boolean hasAncestorCycle(Event current, Long targetChildId, Set<Long> visited) {
        if (current == null || current.getId() == null) {
            return false;
        }
        if (current.getId().equals(targetChildId)) {
            return true;
        }
        if (!visited.add(current.getId())) {
            return false;
        }
        for (Event parent : current.getOrderedParentEvents()) {
            if (hasAncestorCycle(parent, targetChildId, visited)) {
                return true;
            }
        }
        return false;
    }

    private EventTypeParticipantRole resolveEtprForEvent(Event evt, String roleCode) {
        UserCode roleUc = userCodeRepository
                .findByCategoryAndCode(CodeCategory.EVENT_PARTICIPANT_ROLE.name(), roleCode)
                .orElseThrow(() -> new IllegalArgumentException("Unknown participant role: " + roleCode));

        for (UserCode typeUc : evt.getAllEventTypes()) {
            Optional<EventTypeParticipantRole> found = etprRepository.findByEventTypeAndParticipantRole(typeUc, roleUc);
            if (found.isPresent()) {
                return found.get();
            }
        }

        return etprRepository.findByEventTypeAndParticipantRole(evt.getEventType(), roleUc)
                .orElseGet(() -> etprRepository.saveAndFlush(new EventTypeParticipantRole(evt.getEventType(), roleUc)));
    }

    private DateQualifier parseQualifier(String raw) {
        if (raw == null || raw.isBlank()) {
            return DateQualifier.EXACT;
        }
        try {
            return DateQualifier.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return DateQualifier.EXACT;
        }
    }

    private LocalDateTime calculateAverageDate(DateDescriptor dd) {
        if (dd.getSortDateTimeMin() != null && dd.getSortDateTimeMax() != null) {
            long halfSeconds = Duration.between(dd.getSortDateTimeMin(), dd.getSortDateTimeMax()).getSeconds() / 2;
            return dd.getSortDateTimeMin().plusSeconds(halfSeconds);
        }
        return null;
    }

    private record ScoredTimelineEvent(TimelineEventDto dto, LocalDateTime sortDateTime) {}

    private TimelineEventDto toTimelineEventDto(
            Event evt,
            Integer eventYear,
            Map<Long, String> userCodeTranslations,
            Map<Long, List<String>> parentNamesByChildId,
            Map<Long, List<EventAttributeItemDto>> attrsByEventId,
            List<Event> subEvents
    ) {
        UserCode typeUc = evt.getEventType();
        String typeCode = typeUc.getCode();
        String typeLabel = resolveEventTypeLabel(typeUc, userCodeTranslations);

        Set<UserCode> allTypes = evt.getAllEventTypes();
        List<String> assignedCodes = allTypes.stream().map(UserCode::getCode).toList();
        List<String> assignedLabels = allTypes.stream()
                .map(uc -> resolveEventTypeLabel(uc, userCodeTranslations))
                .toList();

        DateDescriptor startDd = evt.getStartDate();
        DateDescriptor endDd = evt.getEndDate();

        List<EventParticipantItemDto> participantDtos = evt.getParticipants().stream()
                .sorted(Comparator.comparing(ep -> ep.getPerson() != null ? ep.getPerson().getId() : Long.MAX_VALUE))
                .map(ep -> {
                    Person p = ep.getPerson();
                    String rCode = ep.getRole().getParticipantRole().getCode();

                    if (p != null) {
                        DateDescriptor birthDd = p.getBirthEvent() != null ? p.getBirthEvent().getStartDate() : null;
                        AgeAtEventResult ageRes = !"BIRTH".equals(typeCode)
                                ? calculateAgeAtEvent(birthDd, startDd)
                                : new AgeAtEventResult(null, false);
                        List<String> parents = "BIRTH".equals(typeCode)
                                ? parentNamesByChildId.getOrDefault(p.getId(), List.of())
                                : List.of();

                        return EventParticipantItemDto.builder()
                                .participantId(ep.getId())
                                .personId(p.getId())
                                .participantText(null)
                                .givenName(p.getCachedGivenName())
                                .surname(p.getCachedSurname())
                                .sex(p.getSex())
                                .lifeState(p.getLifeState())
                                .archived(Boolean.TRUE.equals(p.getIsArchived()))
                                .privateRecord(false)
                                .roleCode(rCode)
                                .roleLabel(translateRoleBySex(rCode, p.getSex()))
                                .ageAtEvent(ageRes.age())
                                .ageApproximate(ageRes.approximate())
                                .avatarMediaId(p.getAvatarMedia() != null ? p.getAvatarMedia().getId() : null)
                                .avatarMediaType(p.getAvatarMedia() != null ? p.getAvatarMedia().getMediaType().name() : null)
                                .avatarCropX(p.getAvatarCropX())
                                .avatarCropY(p.getAvatarCropY())
                                .avatarCropZoom(p.getAvatarCropZoom())
                                .parentNames(parents)
                                .build();
                    } else {
                        PersonSex textSex = ep.getParticipantSex() != null ? ep.getParticipantSex() : PersonSex.UNKNOWN;
                        return EventParticipantItemDto.builder()
                                .participantId(ep.getId())
                                .personId(null)
                                .participantText(ep.getParticipantText())
                                .givenName(ep.getParticipantText())
                                .surname(null)
                                .sex(textSex)
                                .lifeState(LifeState.UNKNOWN)
                                .archived(false)
                                .privateRecord(false)
                                .roleCode(rCode)
                                .roleLabel(translateRoleBySex(rCode, textSex))
                                .ageAtEvent(null)
                                .ageApproximate(false)
                                .parentNames(List.of())
                                .build();
                    }
                })
                .toList();

        List<EventAttributeItemDto> attributes = attrsByEventId.getOrDefault(evt.getId(), List.of());

        List<Event> orderedParents = evt.getOrderedParentEvents();
        List<ParentEventSummaryDto> parentSummaries = new ArrayList<>();
        for (int idx = 0; idx < orderedParents.size(); idx++) {
            Event pEvt = orderedParents.get(idx);
            String pTypeLabel = resolveEventTypeLabel(pEvt.getEventType(), userCodeTranslations);
            String pLabel = (pEvt.getTitle() != null && !pEvt.getTitle().isBlank())
                    ? pEvt.getTitle() + " (" + pTypeLabel + ")"
                    : pTypeLabel;
            String pDateText = formatEventDates(pEvt.getStartDate(), pEvt.getEndDate());
            String pLoc = pEvt.getMainLocation() != null ? pEvt.getMainLocation().getName() : null;
            String pParts = pEvt.getParticipants().stream()
                    .map(ep -> ep.getParticipantText() != null
                            ? ep.getParticipantText()
                            : ((ep.getPerson() != null && ep.getPerson().getCachedGivenName() != null ? ep.getPerson().getCachedGivenName() : "")
                            + " "
                            + (ep.getPerson() != null && ep.getPerson().getCachedSurname() != null ? ep.getPerson().getCachedSurname() : "")).trim())
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.joining(" & "));

            parentSummaries.add(ParentEventSummaryDto.builder()
                    .eventId(pEvt.getId())
                    .label(pLabel)
                    .typeLabel(pTypeLabel)
                    .title(pEvt.getTitle())
                    .dateText(pDateText)
                    .locationName(pLoc)
                    .participantsSummary(pParts)
                    .primaryFolderParent(idx == 0)
                    .build());
        }

        ParentEventSummaryDto firstParent = parentSummaries.isEmpty() ? null : parentSummaries.getFirst();

        List<TimelineEventDto> subEventDtos = (subEvents == null || subEvents.isEmpty())
                ? List.of()
                : subEvents.stream()
                .sorted(Comparator.comparing(
                        (Event se) -> resolveSortDateTime(se, extractEventYear(se)),
                        Comparator.nullsLast(LocalDateTime::compareTo)
                ).thenComparing(Event::getId))
                .map(se -> toTimelineEventDto(
                        se,
                        extractEventYear(se),
                        userCodeTranslations,
                        parentNamesByChildId,
                        attrsByEventId,
                        List.of()
                ))
                .toList();

        return TimelineEventDto.builder()
                .eventId(evt.getId())
                .typeCode(typeCode)
                .typeLabel(typeLabel)
                .systemType(Boolean.TRUE.equals(typeUc.getIsSystem()))
                .assignedTypeCodes(assignedCodes)
                .assignedTypeLabels(assignedLabels)
                .title(evt.getTitle())
                .description(evt.getDescription())
                .folderSlug(evt.getFolderSlug())
                .suggestedFolderSlug(buildDefaultEventFolderSlug(evt, eventYear))
                .parentEventId(firstParent != null ? firstParent.getEventId() : null)
                .parentEventLabel(firstParent != null ? firstParent.getLabel() : null)
                .parentEvents(parentSummaries)
                .year(eventYear)
                .dateText(formatEventDates(startDd, endDd))
                .locationName(evt.getMainLocation() != null ? evt.getMainLocation().getName() : null)
                // Start DateDescriptor
                .startDateType(startDd != null && startDd.getDateType() != null ? startDd.getDateType().name() : null)
                .startQualifier(startDd != null && startDd.getStartQualifier() != null ? startDd.getStartQualifier().name() : null)
                .startYear(startDd != null ? startDd.getStartYear() : null)
                .startMonth(startDd != null ? startDd.getStartMonth() : null)
                .startDay(startDd != null ? startDd.getStartDay() : null)
                .startTimeQualifier(startDd != null && startDd.getStartTimeQualifier() != null ? startDd.getStartTimeQualifier().name() : null)
                .startHour(startDd != null ? startDd.getStartHour() : null)
                .startMinute(startDd != null ? startDd.getStartMinute() : null)
                .startSecond(startDd != null ? startDd.getStartSecond() : null)
                .startRangeEndQualifier(startDd != null && startDd.getEndQualifier() != null ? startDd.getEndQualifier().name() : null)
                .startRangeEndYear(startDd != null ? startDd.getEndYear() : null)
                .startRangeEndMonth(startDd != null ? startDd.getEndMonth() : null)
                .startRangeEndDay(startDd != null ? startDd.getEndDay() : null)
                .startRangeEndTimeQualifier(startDd != null && startDd.getEndTimeQualifier() != null ? startDd.getEndTimeQualifier().name() : null)
                .startRangeEndHour(startDd != null ? startDd.getEndHour() : null)
                .startRangeEndMinute(startDd != null ? startDd.getEndMinute() : null)
                .startRangeEndSecond(startDd != null ? startDd.getEndSecond() : null)
                // End DateDescriptor
                .hasEndDate(endDd != null)
                .endDateType(endDd != null && endDd.getDateType() != null ? endDd.getDateType().name() : null)
                .endQualifier(endDd != null && endDd.getStartQualifier() != null ? endDd.getStartQualifier().name() : null)
                .endYear(endDd != null ? endDd.getStartYear() : (startDd != null ? startDd.getEndYear() : null))
                .endMonth(endDd != null ? endDd.getStartMonth() : (startDd != null ? startDd.getEndMonth() : null))
                .endDay(endDd != null ? endDd.getStartDay() : (startDd != null ? startDd.getEndDay() : null))
                .endTimeQualifier(endDd != null && endDd.getStartTimeQualifier() != null ? endDd.getStartTimeQualifier().name() : null)
                .endHour(endDd != null ? endDd.getStartHour() : (startDd != null ? startDd.getEndHour() : null))
                .endMinute(endDd != null ? endDd.getStartMinute() : (startDd != null ? startDd.getEndMinute() : null))
                .endSecond(endDd != null ? endDd.getStartSecond() : (startDd != null ? startDd.getEndSecond() : null))
                .endRangeEndQualifier(endDd != null && endDd.getEndQualifier() != null ? endDd.getEndQualifier().name() : null)
                .endRangeEndYear(endDd != null ? endDd.getEndYear() : null)
                .endRangeEndMonth(endDd != null ? endDd.getEndMonth() : null)
                .endRangeEndDay(endDd != null ? endDd.getEndDay() : null)
                .endRangeEndTimeQualifier(endDd != null && endDd.getEndTimeQualifier() != null ? endDd.getEndTimeQualifier().name() : null)
                .endRangeEndHour(endDd != null ? endDd.getEndHour() : null)
                .endRangeEndMinute(endDd != null ? endDd.getEndMinute() : null)
                .endRangeEndSecond(endDd != null ? endDd.getEndSecond() : null)
                .participants(participantDtos)
                .attributes(attributes)
                .subEvents(subEventDtos)
                .build();
    }

    public String buildDefaultEventFolderSlug(Event evt, Integer yearOverride) {
        String datePrefix = MediaService.buildDatePrefix(evt.getStartDate(), evt.getEndDate());
        if (datePrefix.isEmpty() && yearOverride != null) {
            datePrefix = String.valueOf(yearOverride);
        }

        String namePart = (evt.getTitle() != null && !evt.getTitle().isBlank())
                ? storageService.toSnakeCase(evt.getTitle())
                : storageService.toSnakeCase(evt.getEventType().getCode());

        List<String> participantFullNames = evt.getParticipants().size() > 3
                ? List.of()
                : evt.getParticipants().stream()
                .sorted(Comparator.comparing(ep -> ep.getPerson() != null ? ep.getPerson().getId() : Long.MAX_VALUE))
                .map(ep -> {
                    if (ep.getPerson() != null) {
                        String given = ep.getPerson().getCachedGivenName() != null ? ep.getPerson().getCachedGivenName() : "";
                        String sur = ep.getPerson().getCachedSurname() != null ? ep.getPerson().getCachedSurname() : "";
                        return (given + " " + sur).trim();
                    }
                    return ep.getParticipantText() != null ? ep.getParticipantText().trim() : "";
                })
                .filter(s -> !s.isEmpty())
                .map(storageService::toSnakeCase)
                .distinct()
                .limit(3)
                .toList();

        String suffix = participantFullNames.isEmpty()
                ? namePart
                : namePart + "_" + String.join("_", participantFullNames);

        return datePrefix.isEmpty() ? suffix : datePrefix + "_" + suffix;
    }

    private String translateRoleBySex(String roleCode, PersonSex sex) {
        if (roleCode == null) return "Uczestnik";
        return switch (roleCode) {
            case "PRINCIPAL" -> "Główny uczestnik";
            case "GODPARENT" -> {
                if (sex == PersonSex.MALE) yield "Ojciec chrzestny";
                if (sex == PersonSex.FEMALE) yield "Matka chrzestna";
                yield "Rodzic chrzestny";
            }
            case "WITNESS" -> "Świadek";
            case "HOST" -> sex == PersonSex.FEMALE ? "Gospodyni" : "Gospodarz";
            case "VISITOR" -> sex == PersonSex.FEMALE ? "Odwiedzająca" : "Odwiedzający";
            case "GUEST" -> "Gość";
            case "PARTICIPANT" -> "Uczestnik";
            default -> roleCode;
        };
    }

    private boolean matchesSelectedTypes(Event evt, List<Event> subEvents, Set<String> selectedTypes) {
        for (UserCode uc : evt.getAllEventTypes()) {
            if (selectedTypes.contains(uc.getCode().toUpperCase(Locale.ROOT))) {
                return true;
            }
        }
        for (Event sub : subEvents) {
            for (UserCode uc : sub.getAllEventTypes()) {
                if (selectedTypes.contains(uc.getCode().toUpperCase(Locale.ROOT))) {
                    return true;
                }
            }
        }
        return false;
    }

    private Map<Long, String> loadUserCodeTranslations() {
        return translationRepository
                .findByTableNameAndLanguageCode("user_codes", LanguageCode.PL_PL.getCode())
                .stream()
                .collect(Collectors.toMap(Translation::getRecordId, Translation::getValue, (a, b) -> a));
    }

    private List<EventTypeOptionDto> buildAvailableTypes(Map<Long, String> userCodeTranslations) {
        Map<Long, List<String>> rolesByTypeId = new HashMap<>();
        for (EventTypeParticipantRole etpr : etprRepository.findAll()) {
            rolesByTypeId
                    .computeIfAbsent(etpr.getEventType().getId(), k -> new ArrayList<>())
                    .add(etpr.getParticipantRole().getCode());
        }

        return userCodeRepository
                .findByCategoryOrderByCodeAsc(CodeCategory.EVENT_TYPE.name())
                .stream()
                .map(uc -> EventTypeOptionDto.builder()
                        .code(uc.getCode())
                        .label(resolveEventTypeLabel(uc, userCodeTranslations))
                        .system(Boolean.TRUE.equals(uc.getIsSystem()))
                        .allowedRoleCodes(rolesByTypeId.getOrDefault(uc.getId(), List.of("PRINCIPAL", "PARTICIPANT", "GUEST")))
                        .build())
                .sorted(Comparator.comparing(EventTypeOptionDto::getLabel, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private Map<Long, List<EventAttributeItemDto>> loadAllAttributesByEventId() {
        Map<Long, List<EventAttributeItemDto>> map = new HashMap<>();
        for (EventAttributeValue eav : eventAttrValueRepository.findAllWithDefinitions()) {
            Long eventId = eav.getEvent().getId();
            map.computeIfAbsent(eventId, k -> new ArrayList<>()).add(
                    EventAttributeItemDto.builder()
                            .definitionCode(eav.getAttributeDictionaryValue().getAttributeDefinition().getCode())
                            .value(eav.getAttributeDictionaryValue().getCode())
                            .build()
            );
        }
        return map;
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
        return ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim();
    }

    public static String resolveEventTypeLabel(UserCode uc, Map<Long, String> translations) {
        if (uc == null) return "";
        if (uc.getId() != null && translations != null && translations.containsKey(uc.getId())) {
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
        if (dto.getTitle() != null) sb.append(dto.getTitle()).append(' ');
        if (dto.getTypeLabel() != null) sb.append(dto.getTypeLabel()).append(' ');
        for (String lbl : dto.getAssignedTypeLabels()) {
            sb.append(lbl).append(' ');
        }
        if (dto.getLocationName() != null) sb.append(dto.getLocationName()).append(' ');
        for (EventParticipantItemDto p : dto.getParticipants()) {
            if (p.getGivenName() != null) sb.append(p.getGivenName()).append(' ');
            if (p.getSurname() != null) sb.append(p.getSurname()).append(' ');
            if (p.getParticipantText() != null) sb.append(p.getParticipantText()).append(' ');
        }
        for (EventAttributeItemDto attr : dto.getAttributes()) {
            if (attr.getValue() != null) sb.append(attr.getValue()).append(' ');
        }
        for (TimelineEventDto sub : dto.getSubEvents()) {
            if (matchesSearch(sub, normSearch)) {
                return true;
            }
        }
        return sb.toString().toLowerCase(Locale.ROOT).contains(normSearch);
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

    public static String formatEventDates(DateDescriptor start, DateDescriptor end) {
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

    private static String formatSingleDescriptor(DateDescriptor dd) {
        if (dd.getDateType() == DateType.FREE_TEXT) {
            return dd.getFreeText();
        }
        if (dd.getDateType() == DateType.RANGE) {
            String d1 = formatYmdAndTime(
                    dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                    dd.getStartTimeQualifier(), dd.getStartHour(), dd.getStartMinute(), dd.getStartSecond()
            );
            String d2 = formatYmdAndTime(
                    dd.getEndYear(), dd.getEndMonth(), dd.getEndDay(),
                    dd.getEndTimeQualifier(), dd.getEndHour(), dd.getEndMinute(), dd.getEndSecond()
            );
            return "między " + d1 + " a " + d2;
        }
        String base = formatYmdAndTime(
                dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                dd.getStartTimeQualifier(), dd.getStartHour(), dd.getStartMinute(), dd.getStartSecond()
        );
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

    private static String formatYmdAndTime(
            Integer y,
            Integer m,
            Integer d,
            DateQualifier timeQual,
            Integer hour,
            Integer minute,
            Integer second
    ) {
        if (y == null) return "";
        String datePart;
        if (m != null && d != null) {
            datePart = String.format("%02d.%02d.%d", d, m, y);
        } else if (m != null) {
            datePart = String.format("%02d.%d", m, y);
        } else {
            datePart = String.valueOf(y);
        }

        if (hour == null) {
            return datePart;
        }
        String timeStr;
        if (second != null) {
            timeStr = String.format("%02d:%02d:%02d", hour, minute != null ? minute : 0, second);
        } else if (minute != null) {
            timeStr = String.format("%02d:%02d", hour, minute);
        } else {
            timeStr = String.format("%02d:00", hour);
        }

        String qualPrefix = "";
        if (timeQual != null && timeQual != DateQualifier.EXACT) {
            qualPrefix = switch (timeQual) {
                case ABOUT, ESTIMATED, CALCULATED -> "ok. ";
                case BEFORE -> "przed ";
                case AFTER -> "po ";
                case EXACT -> "";
            };
        }
        return datePart + ", " + qualPrefix + "godz. " + timeStr;
    }
}
