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
    private final UserCodeRepository userCodeRepository;
    private final TranslationRepository translationRepository;
    private final FamilyChildRepository familyChildRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;
    private final EventTypeParticipantRoleRepository etprRepository;
    private final LocationRepository locationRepository;
    private final EventLocationRepository eventLocationRepository;
    private final PersonRepository personRepository;
    private final ActivityLogService activityLogService;

    private static final Map<String, String> DEFAULT_EVENT_TYPE_LABELS = Map.of(
            "BIRTH", "Narodziny",
            "WEDDING", "Ślub i wesele",
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
        boolean descending = "DESC".equalsIgnoreCase(sortOrder);

        Map<Long, List<String>> parentNamesByChildId = buildParentNamesMap();
        Map<Long, List<EventAttributeItemDto>> attrsByEventId = loadAllAttributesByEventId();

        // Single JOIN FETCH query eliminating N+1 queries
        List<Event> allEvents = eventRepository.findAllWithFullTimelineDetails();

        Map<Long, List<Event>> subEventsByParentId = new HashMap<>();
        for (Event e : allEvents) {
            if (e.getParentEvent() != null && e.getParentEvent().getId() != null) {
                subEventsByParentId
                        .computeIfAbsent(e.getParentEvent().getId(), k -> new ArrayList<>())
                        .add(e);
            }
        }

        Integer minAvailableYear = null;
        Integer maxAvailableYear = null;
        for (Event e : allEvents) {
            if (e.getParentEvent() != null) {
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
            // Show only top-level events on the main timeline; sub-events are attached to their parent
            if (evt.getParentEvent() != null) {
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
            if (eventYear == null && !includeUndated) {
                continue;
            }
            if (yearFrom != null && (eventYear == null || eventYear < yearFrom)) {
                continue;
            }
            if (yearTo != null && (eventYear == null || eventYear > yearTo)) {
                continue;
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

        List<Event> subEvents = eventRepository
                .findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(eventId);

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

        String label = evt.getTitle() != null ? evt.getTitle() : evt.getEventType().getCode();
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
        dateDescriptorRepositoryCleanup();

        String label = evt.getTitle() != null ? evt.getTitle() : evt.getEventType().getCode();
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

        evt.setTitle(req.getTitle() != null && !req.getTitle().isBlank() ? req.getTitle().trim() : null);
        evt.setDescription(req.getDescription() != null && !req.getDescription().isBlank() ? req.getDescription().trim() : null);
        applyParentEvent(evt, req.getParentEventId());

        eventRepository.saveAndFlush(evt);

        activityLogService.logActivity(
                ActivityActionType.EVENT_UPDATED,
                "Zaktualizowano szczegóły/hierarchię wydarzenia",
                "EVENT",
                eventId
        );

        return getEventById(eventId);
    }

    @Transactional
    public void deleteEvent(Long eventId) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

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

    private void applyEventSaveRequest(Event evt, SaveEventRequestDto req) {
        List<String> codes = req.getTypeCodes() == null ? List.of() :
                req.getTypeCodes().stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .distinct()
                        .toList();

        if (codes.isEmpty() && evt.getEventType() == null) {
            throw new IllegalArgumentException("At least one event type is required.");
        }

        if (!codes.isEmpty()) {
            List<UserCode> resolvedCodes = new ArrayList<>();
            for (String code : codes) {
                UserCode uc = userCodeRepository
                        .findByCategoryAndCode(CodeCategory.EVENT_TYPE.name(), code.toUpperCase(Locale.ROOT))
                        .orElseThrow(() -> new IllegalArgumentException("Unknown event type: " + code));
                resolvedCodes.add(uc);
            }
            evt.setEventType(resolvedCodes.getFirst());
            evt.getAssignedTypes().clear();
            evt.getAssignedTypes().addAll(resolvedCodes);
        }

        evt.setTitle(req.getTitle() != null && !req.getTitle().isBlank() ? req.getTitle().trim() : null);
        evt.setDescription(req.getDescription() != null && !req.getDescription().isBlank() ? req.getDescription().trim() : null);

        applyParentEvent(evt, req.getParentEventId());

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

        // Date & Time Descriptors
        if (req.getStartYear() != null) {
            DateDescriptor startDd = evt.getStartDate() != null ? evt.getStartDate() : new DateDescriptor();
            boolean isRange = Boolean.TRUE.equals(req.getIsRange()) && req.getEndYear() != null;
            startDd.setDateType(isRange ? DateType.RANGE : DateType.SINGLE);
            startDd.setStartQualifier(parseQualifier(req.getStartQualifier()));
            startDd.setStartYear(req.getStartYear());
            startDd.setStartMonth(req.getStartMonth());
            startDd.setStartDay(req.getStartDay());
            startDd.setStartTimeQualifier(req.getStartHour() != null ? parseQualifier(req.getStartTimeQualifier()) : null);
            startDd.setStartHour(req.getStartHour());
            startDd.setStartMinute(req.getStartMinute());

            if (isRange) {
                startDd.setEndQualifier(DateQualifier.EXACT);
                startDd.setEndYear(req.getEndYear());
                startDd.setEndMonth(req.getEndMonth());
                startDd.setEndDay(req.getEndDay());
                startDd.setEndTimeQualifier(req.getEndHour() != null ? parseQualifier(req.getEndTimeQualifier()) : null);
                startDd.setEndHour(req.getEndHour());
                startDd.setEndMinute(req.getEndMinute());
            } else {
                startDd.setEndQualifier(null);
                startDd.setEndYear(null);
                startDd.setEndMonth(null);
                startDd.setEndDay(null);
                startDd.setEndTimeQualifier(null);
                startDd.setEndHour(null);
                startDd.setEndMinute(null);
            }

            startDd.recalculateSortDates();
            evt.setStartDate(startDd);
            evt.setEndDate(null);
            evt.setCachedStartSortDateTime(calculateAverageDate(startDd));
        } else if (req.getStartQualifier() != null) {
            evt.setStartDate(null);
            evt.setEndDate(null);
            evt.setCachedStartSortDateTime(null);
        }

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
        if (req.getParticipants() != null && !req.getParticipants().isEmpty()) {
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

    private EventTypeParticipantRole resolveEtprForEvent(Event evt, String roleCode) {
        UserCode roleUc = userCodeRepository
                .findByCategoryAndCode(CodeCategory.EVENT_PARTICIPANT_ROLE.name(), roleCode)
                .orElseThrow(() -> new IllegalArgumentException("Unknown participant role: " + roleCode));

        // Check union of all assigned event types
        for (UserCode typeUc : evt.getAllEventTypes()) {
            Optional<EventTypeParticipantRole> found = etprRepository.findByEventTypeAndParticipantRole(typeUc, roleUc);
            if (found.isPresent()) {
                return found.get();
            }
        }

        // If a custom combination is requested on a multi-type event, create or return for primary type
        return etprRepository.findByEventTypeAndParticipantRole(evt.getEventType(), roleUc)
                .orElseGet(() -> etprRepository.saveAndFlush(new EventTypeParticipantRole(evt.getEventType(), roleUc)));
    }

    private void applyParentEvent(Event evt, Long parentEventId) {
        if (parentEventId != null) {
            if (evt.getId() != null && parentEventId.equals(evt.getId())) {
                throw new IllegalArgumentException("Event cannot be its own parent.");
            }
            Event parent = eventRepository.findById(parentEventId)
                    .orElseThrow(() -> new IllegalArgumentException("Parent event not found: " + parentEventId));
            Event cursor = parent.getParentEvent();
            while (cursor != null) {
                if (evt.getId() != null && cursor.getId().equals(evt.getId())) {
                    throw new IllegalArgumentException("Circular event hierarchy is not allowed.");
                }
                cursor = cursor.getParentEvent();
            }
            evt.setParentEvent(parent);
        } else {
            evt.setParentEvent(null);
        }
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

    private void dateDescriptorRepositoryCleanup() {
        // Orphans cleaned up on next import/reset
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

        Event parent = evt.getParentEvent();
        String parentLabel = null;
        if (parent != null) {
            String pTypeLabel = resolveEventTypeLabel(parent.getEventType(), userCodeTranslations);
            parentLabel = (parent.getTitle() != null && !parent.getTitle().isBlank())
                    ? parent.getTitle() + " (" + pTypeLabel + ")"
                    : pTypeLabel;
        }

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
                .parentEventId(parent != null ? parent.getId() : null)
                .parentEventLabel(parentLabel)
                .year(eventYear)
                .dateText(formatEventDates(startDd, endDd))
                .locationName(evt.getMainLocation() != null ? evt.getMainLocation().getName() : null)
                .startDateType(startDd != null && startDd.getDateType() != null ? startDd.getDateType().name() : null)
                .startQualifier(startDd != null && startDd.getStartQualifier() != null ? startDd.getStartQualifier().name() : null)
                .startYear(startDd != null ? startDd.getStartYear() : null)
                .startMonth(startDd != null ? startDd.getStartMonth() : null)
                .startDay(startDd != null ? startDd.getStartDay() : null)
                .startTimeQualifier(startDd != null && startDd.getStartTimeQualifier() != null ? startDd.getStartTimeQualifier().name() : null)
                .startHour(startDd != null ? startDd.getStartHour() : null)
                .startMinute(startDd != null ? startDd.getStartMinute() : null)
                .endYear(startDd != null ? startDd.getEndYear() : null)
                .endMonth(startDd != null ? startDd.getEndMonth() : null)
                .endDay(startDd != null ? startDd.getEndDay() : null)
                .endTimeQualifier(startDd != null && startDd.getEndTimeQualifier() != null ? startDd.getEndTimeQualifier().name() : null)
                .endHour(startDd != null ? startDd.getEndHour() : null)
                .endMinute(startDd != null ? startDd.getEndMinute() : null)
                .participants(participantDtos)
                .attributes(attributes)
                .subEvents(subEventDtos)
                .build();
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
                    dd.getStartTimeQualifier(), dd.getStartHour(), dd.getStartMinute()
            );
            String d2 = formatYmdAndTime(
                    dd.getEndYear(), dd.getEndMonth(), dd.getEndDay(),
                    dd.getEndTimeQualifier(), dd.getEndHour(), dd.getEndMinute()
            );
            return "między " + d1 + " a " + d2;
        }
        String base = formatYmdAndTime(
                dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                dd.getStartTimeQualifier(), dd.getStartHour(), dd.getStartMinute()
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
            Integer minute
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
        String timeStr = minute != null
                ? String.format("%02d:%02d", hour, minute)
                : String.format("%02d:00", hour);
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