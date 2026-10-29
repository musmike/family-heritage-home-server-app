package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
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
    private final GraveRepository graveRepository;
    private final CemeteryRepository cemeteryRepository;
    private final LocationRepository locationRepository;
    private final PersonRepository personRepository;
    private final EventRepository eventRepository;
    private final EventParticipantRepository eventParticipantRepository;
    private final UserCodeRepository userCodeRepository;
    private final EventTypeParticipantRoleRepository etprRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;
    private final ActivityLogService activityLogService;

    @Transactional
    public BurialsOverviewDto getBurialsOverview(
            String search,
            PersonSex sex,
            boolean includeNonCurrent,
            boolean includeArchived,
            String sortBy,
            boolean isAdmin
    ) {
        String normSearch = search != null ? search.trim().toLowerCase() : "";
        boolean hasActiveFilter = !normSearch.isEmpty() || sex != null;

        List<Cemetery> allCemeteries = cemeteryRepository.findAllByOrderByNameAscIdAsc();
        List<Grave> allGraves = graveRepository.findAll();
        List<Burial> allBurials = burialRepository.findAll();

        Map<Long, List<Burial>> burialsByGraveId = new HashMap<>();
        for (Burial b : allBurials) {
            if (b.getGrave() != null && b.getGrave().getId() != null) {
                burialsByGraveId.computeIfAbsent(b.getGrave().getId(), k -> new ArrayList<>()).add(b);
            }
        }

        Comparator<BurialPersonItemDto> burialComparator = buildComparator(sortBy);

        Map<Long, List<GraveGroupDto>> gravesByCemeteryId = new LinkedHashMap<>();
        List<GraveGroupDto> otherGraves = new ArrayList<>();

        for (Grave grave : allGraves) {
            Cemetery cem = grave.getCemetery();
            boolean inOther = (cem == null);

            List<Burial> rawBurialsInGrave = burialsByGraveId.getOrDefault(grave.getId(), List.of());

            List<BurialPersonItemDto> matchingBurials = rawBurialsInGrave.stream()
                    .filter(b -> includeNonCurrent || Boolean.TRUE.equals(b.getIsCurrent()))
                    .filter(b -> b.getPerson() != null)
                    .filter(b -> includeArchived || !Boolean.TRUE.equals(b.getPerson().getIsArchived()))
                    .filter(b -> sex == null || b.getPerson().getSex() == sex)
                    .map(b -> toBurialItemDto(b, inOther || isAdmin))
                    .filter(item -> matchesSearch(item, grave, cem, normSearch))
                    .sorted(burialComparator)
                    .toList();

            boolean keepEmptyCustomGrave = !hasActiveFilter
                    && rawBurialsInGrave.isEmpty()
                    && (!inOther || grave.isCustomizedByAdmin());

            if (matchingBurials.isEmpty() && !keepEmptyCustomGrave) {
                continue;
            }

            GraveGroupDto graveDto = toGraveGroupDto(grave, matchingBurials);
            if (inOther) {
                otherGraves.add(graveDto);
            } else {
                gravesByCemeteryId.computeIfAbsent(cem.getId(), k -> new ArrayList<>()).add(graveDto);
            }
        }

        Comparator<GraveGroupDto> graveGroupComparator = buildGraveGroupComparator(burialComparator);
        List<CemeteryGroupDto> cemeteryGroups = new ArrayList<>();

        for (Cemetery cem : allCemeteries) {
            List<GraveGroupDto> cemGraves = new ArrayList<>(
                    gravesByCemeteryId.getOrDefault(cem.getId(), List.of())
            );
            cemGraves.sort(graveGroupComparator);

            boolean cemeteryMatchesSearch = normSearch.isEmpty()
                    || (cem.getName() != null && cem.getName().toLowerCase().contains(normSearch))
                    || (cem.getLocation() != null && cem.getLocation().getName().toLowerCase().contains(normSearch));

            if (hasActiveFilter && cemGraves.isEmpty() && (!cemeteryMatchesSearch || sex != null)) {
                continue;
            }

            int burialsCount = cemGraves.stream()
                    .mapToInt(g -> g.getBurials().size())
                    .sum();

            cemeteryGroups.add(toCemeteryGroupDto(cem, cemGraves, burialsCount));
        }

        if (!otherGraves.isEmpty()) {
            otherGraves.sort(graveGroupComparator);
            int otherBurialsCount = otherGraves.stream()
                    .mapToInt(g -> g.getBurials().size())
                    .sum();

            cemeteryGroups.add(CemeteryGroupDto.builder()
                    .cemeteryId(null)
                    .groupName("Inne")
                    .description("Groby zaimportowane z pliku GEDCOM lub jeszcze nieprzypisane do konkretnego cmentarza.")
                    .otherGroup(true)
                    .totalBurialsCount(otherBurialsCount)
                    .graves(otherGraves)
                    .build());
        }

        int totalGraves = cemeteryGroups.stream()
                .mapToInt(g -> g.getGraves().size())
                .sum();
        int totalBurials = cemeteryGroups.stream()
                .mapToInt(CemeteryGroupDto::getTotalBurialsCount)
                .sum();

        return BurialsOverviewDto.builder()
                .totalBurialsCount(totalBurials)
                .totalGravesCount(totalGraves)
                .cemeteryGroups(cemeteryGroups)
                .build();
    }

    @Transactional
    public GraveGroupDto getGraveDetails(Long graveId, boolean isAdmin) {
        Grave grave = graveRepository.findById(graveId)
                .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));

        boolean inOther = grave.getCemetery() == null;
        List<BurialPersonItemDto> burials = burialRepository.findByGrave(grave).stream()
                .filter(b -> b.getPerson() != null)
                .map(b -> toBurialItemDto(b, inOther || isAdmin))
                .sorted(buildComparator("SURNAME_ASC"))
                .toList();

        return toGraveGroupDto(grave, burials);
    }

    @Transactional
    public CemeteryGroupDto createCemetery(SaveCemeteryRequestDto req) {
        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("Cemetery name cannot be blank.");
        }

        Cemetery cem = new Cemetery();
        applyCemeteryFields(cem, req);
        cem = cemeteryRepository.saveAndFlush(cem);

        activityLogService.logActivity(
                ActivityActionType.CEMETERY_CREATED,
                "Dodano cmentarz: " + cem.getName(),
                "CEMETERY",
                cem.getId()
        );

        return toCemeteryGroupDto(cem, List.of(), 0);
    }

    @Transactional
    public CemeteryGroupDto updateCemetery(Long cemeteryId, SaveCemeteryRequestDto req) {
        Cemetery cem = cemeteryRepository.findById(cemeteryId)
                .orElseThrow(() -> new IllegalArgumentException("Cemetery not found: " + cemeteryId));

        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("Cemetery name cannot be blank.");
        }

        applyCemeteryFields(cem, req);
        cem = cemeteryRepository.saveAndFlush(cem);
        locationRepository.deleteOrphanLocations();

        activityLogService.logActivity(
                ActivityActionType.CEMETERY_UPDATED,
                "Zaktualizowano cmentarz: " + cem.getName(),
                "CEMETERY",
                cem.getId()
        );

        return toCemeteryGroupDto(cem, List.of(), 0);
    }

    @Transactional
    public void deleteCemetery(Long cemeteryId) {
        Cemetery cem = cemeteryRepository.findById(cemeteryId)
                .orElseThrow(() -> new IllegalArgumentException("Cemetery not found: " + cemeteryId));

        String cemName = cem.getName();

        List<Grave> graves = graveRepository.findByCemetery(cem);
        for (Grave g : graves) {
            g.setCemetery(null);
            graveRepository.save(g);
        }
        graveRepository.flush();

        cemeteryRepository.delete(cem);
        cemeteryRepository.flush();
        locationRepository.deleteOrphanLocations();

        activityLogService.logActivity(
                ActivityActionType.CEMETERY_DELETED,
                "Usunięto cmentarz: " + cemName + " (groby przeniesiono do kategorii Inne)",
                "CEMETERY",
                null
        );
    }

    @Transactional
    public void assignGravesToCemetery(Long cemeteryId, List<Long> graveIds) {
        Cemetery cem = cemeteryRepository.findById(cemeteryId)
                .orElseThrow(() -> new IllegalArgumentException("Cemetery not found: " + cemeteryId));

        if (graveIds == null || graveIds.isEmpty()) {
            throw new IllegalArgumentException("graveIds list cannot be empty.");
        }

        List<Grave> graves = graveRepository.findAllById(graveIds);
        for (Grave g : graves) {
            g.setCemetery(cem);
            graveRepository.save(g);
        }
        graveRepository.flush();

        activityLogService.logActivity(
                ActivityActionType.GRAVE_UPDATED,
                "Przypisano groby (" + graves.size() + ") do cmentarza: " + cem.getName(),
                "CEMETERY",
                cem.getId()
        );
    }

    @Transactional
    public GraveGroupDto createGrave(SaveGraveRequestDto req, boolean isAdmin) {
        Grave grave = new Grave();
        applyGraveFields(grave, req);
        grave = graveRepository.saveAndFlush(grave);

        if (req.getInitialPersonId() != null) {
            AddPersonToGraveRequestDto addReq = new AddPersonToGraveRequestDto(req.getInitialPersonId(), true);
            return addPersonToGrave(grave.getId(), addReq, isAdmin);
        }

        activityLogService.logActivity(
                ActivityActionType.GRAVE_CREATED,
                "Utworzono nowy nagrobek",
                "BURIAL",
                grave.getId()
        );

        return getGraveDetails(grave.getId(), isAdmin);
    }

    @Transactional
    public GraveGroupDto updateGrave(Long graveId, SaveGraveRequestDto req, boolean isAdmin) {
        Grave grave = graveRepository.findById(graveId)
                .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));

        applyGraveFields(grave, req);
        graveRepository.saveAndFlush(grave);

        String targetLabel = grave.getCemetery() != null ? grave.getCemetery().getName() : "Inne";
        activityLogService.logActivity(
                ActivityActionType.GRAVE_UPDATED,
                "Zaktualizowano dane nagrobka (" + targetLabel + ")",
                "BURIAL",
                grave.getId()
        );

        return getGraveDetails(grave.getId(), isAdmin);
    }

    @Transactional
    public void deleteGrave(Long graveId) {
        Grave grave = graveRepository.findById(graveId)
                .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));

        List<Burial> burials = burialRepository.findByGrave(grave);
        for (Burial b : burials) {
            Event burEvt = b.getBurialEvent();
            b.setBurialEvent(null);
            burialRepository.delete(b);
            burialRepository.flush();
            if (burEvt != null) {
                eventRepository.delete(burEvt);
            }
        }

        graveRepository.delete(grave);
        graveRepository.flush();
        eventRepository.deleteOrphanEvents();

        activityLogService.logActivity(
                ActivityActionType.GRAVE_DELETED,
                "Usunięto nagrobek",
                "BURIAL",
                null
        );
    }

    @Transactional
    public GraveGroupDto addPersonToGrave(Long graveId, AddPersonToGraveRequestDto req, boolean isAdmin) {
        Grave targetGrave = graveRepository.findById(graveId)
                .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));

        if (req.getPersonId() == null) {
            throw new IllegalArgumentException("personId is required.");
        }

        Person person = personRepository.findById(req.getPersonId())
                .orElseThrow(() -> new IllegalArgumentException("Person not found: " + req.getPersonId()));

        List<Burial> existingInTarget = burialRepository.findByGrave(targetGrave);
        boolean alreadyInTarget = existingInTarget.stream()
                .anyMatch(b -> b.getPerson() != null && b.getPerson().getId().equals(person.getId()));
        if (alreadyInTarget) {
            throw new IllegalArgumentException("Ta osoba jest już przypisana do tego nagrobka.");
        }

        List<Burial> personBurials = burialRepository.findByPerson(person);
        Burial mergeableBurial = personBurials.stream()
                .filter(b -> b.getGrave() != null && !b.getGrave().getId().equals(targetGrave.getId()))
                .filter(b -> {
                    Grave oldG = b.getGrave();
                    return oldG.getCemetery() == null
                            && !oldG.isCustomizedByAdmin()
                            && burialRepository.findByGrave(oldG).size() == 1;
                })
                .findFirst()
                .orElse(null);

        if (mergeableBurial != null) {
            Grave oldGrave = mergeableBurial.getGrave();
            mergeableBurial.setGrave(targetGrave);
            mergeableBurial.setIsCurrent(req.isCurrent());
            burialRepository.saveAndFlush(mergeableBurial);

            graveRepository.delete(oldGrave);
            graveRepository.flush();
        } else {
            Event burialEvent = createBareBurialEvent(person);
            Burial newBurial = new Burial();
            newBurial.setGrave(targetGrave);
            newBurial.setPerson(person);
            newBurial.setBurialEvent(burialEvent);
            newBurial.setIsCurrent(req.isCurrent());
            burialRepository.saveAndFlush(newBurial);
        }

        String fullName = ((person.getCachedGivenName() != null ? person.getCachedGivenName() : "") + " "
                + (person.getCachedSurname() != null ? person.getCachedSurname() : "")).trim();
        activityLogService.logActivity(
                ActivityActionType.GRAVE_UPDATED,
                "Przypisano osobę " + fullName + " do wspólnego nagrobka",
                "BURIAL",
                targetGrave.getId()
        );

        return getGraveDetails(targetGrave.getId(), isAdmin);
    }

    @Transactional
    public GraveGroupDto toggleBurialCurrent(Long burialId, boolean isAdmin) {
        Burial burial = burialRepository.findById(burialId)
                .orElseThrow(() -> new IllegalArgumentException("Burial not found: " + burialId));

        burial.setIsCurrent(!Boolean.TRUE.equals(burial.getIsCurrent()));
        burialRepository.saveAndFlush(burial);

        return getGraveDetails(burial.getGrave().getId(), isAdmin);
    }

    @Transactional
    public GraveGroupDto splitBurialToNewGrave(Long burialId, boolean isAdmin) {
        Burial burial = burialRepository.findById(burialId)
                .orElseThrow(() -> new IllegalArgumentException("Burial not found: " + burialId));

        Grave currentGrave = burial.getGrave();
        List<Burial> inGrave = burialRepository.findByGrave(currentGrave);
        if (inGrave.size() <= 1) {
            throw new IllegalArgumentException("Osoba znajduje się już w osobnym grobie.");
        }

        Grave separateGrave = new Grave();
        separateGrave.setCemetery(currentGrave.getCemetery());
        separateGrave = graveRepository.saveAndFlush(separateGrave);

        burial.setGrave(separateGrave);
        burialRepository.saveAndFlush(burial);

        return getGraveDetails(currentGrave.getId(), isAdmin);
    }

    @Transactional
    public void removeBurialFromGrave(Long burialId) {
        Burial burial = burialRepository.findById(burialId)
                .orElseThrow(() -> new IllegalArgumentException("Burial not found: " + burialId));

        Event burEvt = burial.getBurialEvent();
        burial.setBurialEvent(null);
        burialRepository.delete(burial);
        burialRepository.flush();

        if (burEvt != null) {
            eventRepository.delete(burEvt);
            eventRepository.flush();
        }
    }

    private Event createBareBurialEvent(Person person) {
        UserCode rolePrincipal = userCodeRepository
                .findByCategoryAndCode(CodeCategory.EVENT_PARTICIPANT_ROLE.name(), EventParticipantRole.PRINCIPAL.name())
                .orElseThrow();
        UserCode typeBurial = userCodeRepository
                .findByCategoryAndCode(CodeCategory.EVENT_TYPE.name(), EventType.BURIAL.name())
                .orElseThrow();
        EventTypeParticipantRole burialRole = etprRepository
                .findByEventTypeAndParticipantRole(typeBurial, rolePrincipal)
                .orElseThrow();

        Event event = new Event();
        event.setEventType(typeBurial);
        event = eventRepository.saveAndFlush(event);

        EventParticipant participant = new EventParticipant(event, person, burialRole);
        eventParticipantRepository.saveAndFlush(participant);
        event.addParticipant(participant);
        return event;
    }

    private void applyCemeteryFields(Cemetery cem, SaveCemeteryRequestDto req) {
        cem.setName(req.getName().trim());
        cem.setManagementType(parseEnumOrNull(CemeteryManagementType.class, req.getManagementType()));
        cem.setDenomination(parseEnumOrNull(CemeteryDenomination.class, req.getDenomination()));
        cem.setDescription(trimToNull(req.getDescription()));

        String locName = trimToNull(req.getLocationName());
        if (locName != null) {
            Location loc = locationRepository.findByName(locName)
                    .orElseGet(() -> locationRepository.saveAndFlush(new Location(locName)));
            cem.setLocation(loc);
        } else {
            cem.setLocation(null);
        }
    }

    private void applyGraveFields(Grave grave, SaveGraveRequestDto req) {
        if (req.getCemeteryId() != null) {
            Cemetery cem = cemeteryRepository.findById(req.getCemeteryId())
                    .orElseThrow(() -> new IllegalArgumentException("Cemetery not found: " + req.getCemeteryId()));
            grave.setCemetery(cem);
        } else {
            grave.setCemetery(null);
        }

        grave.setSection(trimToNull(req.getSection()));
        grave.setSector(trimToNull(req.getSector()));
        grave.setRowNumber(trimToNull(req.getRowNumber()));
        grave.setGraveNumber(trimToNull(req.getGraveNumber()));
        grave.setGraveType(parseEnumOrNull(GraveType.class, req.getGraveType()));
        grave.setDescription(trimToNull(req.getDescription()));
        grave.setEpitaph(trimToNull(req.getEpitaph()));
    }

    private <E extends Enum<E>> E parseEnumOrNull(Class<E> enumClass, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return Enum.valueOf(enumClass, raw.trim().toUpperCase());
    }

    private String trimToNull(String val) {
        if (val == null || val.isBlank()) {
            return null;
        }
        return val.trim();
    }

    private CemeteryGroupDto toCemeteryGroupDto(
            Cemetery cem,
            List<GraveGroupDto> graves,
            int totalBurialsCount
    ) {
        CemeteryManagementType mgmt = cem.getManagementType();
        CemeteryDenomination denom = cem.getDenomination();
        return CemeteryGroupDto.builder()
                .cemeteryId(cem.getId())
                .groupName(cem.getName())
                .managementType(mgmt != null ? mgmt.name() : null)
                .managementTypeLabel(mgmt != null ? mgmt.getLabel() : null)
                .denomination(denom != null ? denom.name() : null)
                .denominationLabel(denom != null ? denom.getLabel() : null)
                .locationName(cem.getLocation() != null ? cem.getLocation().getName() : null)
                .description(cem.getDescription())
                .otherGroup(false)
                .totalBurialsCount(totalBurialsCount)
                .graves(graves)
                .build();
    }

    private GraveGroupDto toGraveGroupDto(Grave grave, List<BurialPersonItemDto> burials) {
        Cemetery cem = grave.getCemetery();
        GraveType gt = grave.getGraveType();
        return GraveGroupDto.builder()
                .graveId(grave.getId())
                .cemeteryId(cem != null ? cem.getId() : null)
                .cemeteryName(cem != null ? cem.getName() : "Inne")
                .section(grave.getSection())
                .sector(grave.getSector())
                .rowNumber(grave.getRowNumber())
                .graveNumber(grave.getGraveNumber())
                .graveType(gt != null ? gt.name() : null)
                .graveTypeLabel(gt != null ? gt.getLabel() : null)
                .description(grave.getDescription())
                .epitaph(grave.getEpitaph())
                .burials(burials)
                .build();
    }

    private BurialPersonItemDto toBurialItemDto(Burial burial, boolean includePlaceDescription) {
        Person person = burial.getPerson();
        Grave grave = burial.getGrave();
        Cemetery cem = grave != null ? grave.getCemetery() : null;

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
                .cemeteryId(cem != null ? cem.getId() : null)
                .cemeteryName(cem != null ? cem.getName() : "Inne")
                .current(Boolean.TRUE.equals(burial.getIsCurrent()))
                .placeDescription(includePlaceDescription ? burial.getPlaceDescription() : null)
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

    private boolean matchesSearch(
            BurialPersonItemDto item,
            Grave grave,
            Cemetery cem,
            String normSearch
    ) {
        if (normSearch.isEmpty()) {
            return true;
        }
        String combined = ((item.getGivenName() != null ? item.getGivenName() : "") + " "
                + (item.getSurname() != null ? item.getSurname() : "") + " "
                + (item.getPlaceDescription() != null ? item.getPlaceDescription() : "") + " "
                + (cem != null && cem.getName() != null ? cem.getName() : "") + " "
                + (grave != null && grave.getSection() != null ? grave.getSection() : "") + " "
                + (grave != null && grave.getGraveNumber() != null ? grave.getGraveNumber() : "") + " "
                + (item.getBirthPlace() != null ? item.getBirthPlace() : "") + " "
                + (item.getDeathPlace() != null ? item.getDeathPlace() : "") + " "
                + (item.getCauseOfDeath() != null ? item.getCauseOfDeath() : "")).toLowerCase();
        return combined.contains(normSearch);
    }

    private Comparator<GraveGroupDto> buildGraveGroupComparator(Comparator<BurialPersonItemDto> burialComp) {
        return (g1, g2) -> {
            if (g1.getBurials().isEmpty() && g2.getBurials().isEmpty()) {
                return Long.compare(g1.getGraveId(), g2.getGraveId());
            }
            if (g1.getBurials().isEmpty()) return 1;
            if (g2.getBurials().isEmpty()) return -1;
            int cmp = burialComp.compare(g1.getBurials().getFirst(), g2.getBurials().getFirst());
            return cmp != 0 ? cmp : Long.compare(g1.getGraveId(), g2.getGraveId());
        };
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
