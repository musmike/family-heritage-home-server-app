package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class GedcomImportApplier {

    private final PersonRepository personRepository;
    private final FamilyRepository familyRepository;
    private final FamilyChildRepository familyChildRepository;
    private final EventRepository eventRepository;
    private final LocationRepository locationRepository;
    private final UserCodeRepository userCodeRepository;
    private final EventTypeParticipantRoleRepository etprRepository;
    private final AttributeDefinitionRepository attrDefRepository;
    private final AttributeDictionaryValueRepository attrDictValueRepository;
    private final EventAttributeValueRepository eventAttrValueRepository;
    private final EventLocationRepository eventLocationRepository;
    private final GraveRepository graveRepository;
    private final BurialRepository burialRepository;
    private final EventParticipantRepository eventParticipantRepository;
    private final PersonNameRepository personNameRepository;
    private final GedcomDateParser dateParser;

    @PersistenceContext
    private EntityManager entityManager;

    public record AppliedImportResult(
            Map<String, Long> resolvedPersonIds,
            Map<String, Long> resolvedFamilyIds
    ) {}

    @Transactional
    public AppliedImportResult applyImport(
            ParsedGedcomFileDto parsedFile,
            Map<String, IndividualDecisionDto> individualDecisions,
            Map<String, FamilyDecisionDto> familyDecisions,
            Map<Long, AbsentPersonAction> absentPersonDecisions
    ) {
        UserCode rolePrincipal = findSystemCode(
                CodeCategory.EVENT_PARTICIPANT_ROLE.name(),
                EventParticipantRole.PRINCIPAL.name()
        );
        UserCode typeBirth = findSystemCode(CodeCategory.EVENT_TYPE.name(), EventType.BIRTH.name());
        UserCode typeDeath = findSystemCode(CodeCategory.EVENT_TYPE.name(), EventType.DEATH.name());
        UserCode typeBurial = findSystemCode(CodeCategory.EVENT_TYPE.name(), EventType.BURIAL.name());
        UserCode typeWedding = findSystemCode(CodeCategory.EVENT_TYPE.name(), EventType.WEDDING.name());

        EventTypeParticipantRole birthRole = getEtprOrThrow(typeBirth, rolePrincipal);
        EventTypeParticipantRole deathRole = getEtprOrThrow(typeDeath, rolePrincipal);
        EventTypeParticipantRole burialRole = getEtprOrThrow(typeBurial, rolePrincipal);
        EventTypeParticipantRole weddingRole = getEtprOrThrow(typeWedding, rolePrincipal);

        AttributeDefinition causeOfDeathDef = attrDefRepository
                .findByUserCodeAndCode(typeDeath, DeathEventAttributeDefinition.CAUSE_OF_DEATH.name())
                .orElseThrow(() -> new IllegalStateException("Missing AttributeDefinition for CAUSE_OF_DEATH"));

        // 1. Apply Individuals and keep track of gedRefId -> saved Person ID
        Map<String, Long> resolvedGedRefToPersonId = new HashMap<>();
        Set<Long> activePersonIdsInImport = new HashSet<>();

        for (ParsedGedcomIndividualDto gedIndi : parsedFile.getIndividuals()) {
            IndividualDecisionDto decision = individualDecisions.get(gedIndi.getGedRefId());
            Person savedPerson = applyIndividual(
                    gedIndi,
                    decision,
                    parsedFile.getSourceSystem(),
                    birthRole,
                    deathRole,
                    burialRole,
                    causeOfDeathDef
            );
            resolvedGedRefToPersonId.put(gedIndi.getGedRefId(), savedPerson.getId());
            activePersonIdsInImport.add(savedPerson.getId());
        }

        personRepository.flush();

        // 2. Apply Families and keep track of active Family IDs
        Map<String, Long> resolvedGedRefToFamilyId = new HashMap<>();
        Set<Long> activeFamilyIdsInImport = new HashSet<>();
        for (ParsedGedcomFamilyDto gedFam : parsedFile.getFamilies()) {
            FamilyDecisionDto decision = familyDecisions.get(gedFam.getGedRefId());
            Family savedFamily = applyFamily(
                    gedFam,
                    decision,
                    parsedFile.getSourceSystem(),
                    resolvedGedRefToPersonId,
                    weddingRole
            );
            if (savedFamily != null) {
                resolvedGedRefToFamilyId.put(gedFam.getGedRefId(), savedFamily.getId());
                activeFamilyIdsInImport.add(savedFamily.getId());
            }
        }

        entityManager.flush();
        entityManager.clear();

        // 3. Delete families absent from the current import
        List<Family> familiesToDelete = familyRepository.findAll().stream()
                .filter(f -> !activeFamilyIdsInImport.contains(f.getId()))
                .toList();
        familyRepository.deleteAll(familiesToDelete);
        familyRepository.flush();

        // 4. Process people absent from the current import (ARCHIVE vs DELETE)
        processAbsentPeople(activePersonIdsInImport, absentPersonDecisions);

        entityManager.flush();
        cleanUpOrphans();

        return new AppliedImportResult(resolvedGedRefToPersonId, resolvedGedRefToFamilyId);
    }

    private Person applyIndividual(
            ParsedGedcomIndividualDto gedIndi,
            IndividualDecisionDto decision,
            String sourceSystem,
            EventTypeParticipantRole birthRole,
            EventTypeParticipantRole deathRole,
            EventTypeParticipantRole burialRole,
            AttributeDefinition causeOfDeathDef
    ) {
        boolean isUpdate = decision != null
                && decision.getAction() == DecisionAction.MATCH
                && decision.getTargetPersonId() != null;

        Person person;
        PersonGedcomData oldSnapshot = null;

        if (isUpdate) {
            person = personRepository.findById(decision.getTargetPersonId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Target person not found: " + decision.getTargetPersonId()
                    ));
            person.setIsArchived(false);

            if (person.getGedcomData() != null) {
                oldSnapshot = copyPersonGedcomData(person.getGedcomData());
            } else {
                PersonGedcomData newGedData = new PersonGedcomData();
                newGedData.setPerson(person);
                person.setGedcomData(newGedData);
            }
        } else {
            person = new Person();
            PersonGedcomData newGedData = new PersonGedcomData();
            newGedData.setPerson(person);
            person.setGedcomData(newGedData);
        }

        // Accumulate external UID without overwriting existing ones
        person.addExternalId(gedIndi.getGedUid(), sourceSystem);

        // 3-way merge for Person scalar fields
        boolean givenNameEdited = oldSnapshot != null
                && !Objects.equals(nullToEmpty(person.getCachedGivenName()), nullToEmpty(oldSnapshot.getRawGivenName()));
        boolean surnameEdited = oldSnapshot != null
                && !Objects.equals(nullToEmpty(person.getCachedSurname()), nullToEmpty(oldSnapshot.getRawSurname()));

        PersonSex oldMappedSex = oldSnapshot != null ? mapGedcomSexToEnum(oldSnapshot.getRawSex()) : null;
        boolean sexEdited = oldSnapshot != null
                && person.getSex() != null
                && person.getSex() != oldMappedSex;

        LifeState oldMappedLifeState = oldSnapshot != null
                ? (Boolean.TRUE.equals(oldSnapshot.getRawDeathIndicated()) ? LifeState.DECEASED : LifeState.UNKNOWN)
                : null;
        boolean lifeStateEdited = oldSnapshot != null
                && person.getLifeState() != null
                && person.getLifeState() != oldMappedLifeState;

        if (!givenNameEdited) {
            person.setCachedGivenName(gedIndi.getGivenName());
        }
        if (!surnameEdited) {
            person.setCachedSurname(gedIndi.getSurname());
        }
        if (!sexEdited) {
            person.setSex(mapGedcomSexToEnum(gedIndi.getSex()));
        }
        if (!lifeStateEdited) {
            person.setLifeState(gedIndi.isDeathIndicated() ? LifeState.DECEASED : LifeState.UNKNOWN);
        }

        // Always update raw GEDCOM data
        PersonGedcomData rawData = person.getGedcomData();
        String previousBurialPlace = oldSnapshot != null ? oldSnapshot.getRawBurialPlace() : null;
        rawData.setGedRefId(gedIndi.getGedRefId());
        rawData.setGedUid(gedIndi.getGedUid());
        rawData.setRawGivenName(gedIndi.getGivenName());
        rawData.setRawSurname(gedIndi.getSurname());
        rawData.setRawSex(gedIndi.getSex());
        rawData.setRawDeathIndicated(gedIndi.isDeathIndicated());
        rawData.setRawBirthDate(gedIndi.getBirthDate());
        rawData.setRawBirthPlace(gedIndi.getBirthPlace());
        rawData.setRawDeathDate(gedIndi.getDeathDate());
        rawData.setRawDeathPlace(gedIndi.getDeathPlace());
        rawData.setRawCauseOfDeath(gedIndi.getCauseOfDeath());
        rawData.setRawBurialPlace(gedIndi.getBurialPlace());
        rawData.setLastImportedAt(LocalDateTime.now());

        person = personRepository.save(person);
        updatePersonName(person, person.getCachedGivenName(), person.getCachedSurname());

        // BIRTH EVENT (3-way merge)
        boolean hasNewBirth = gedIndi.getBirthDate() != null || gedIndi.getBirthPlace() != null;
        boolean birthDateEdited = isEventDateEdited(person.getBirthEvent(), oldSnapshot != null ? oldSnapshot.getRawBirthDate() : null);
        boolean birthPlaceEdited = isEventPlaceEdited(person.getBirthEvent(), oldSnapshot != null ? oldSnapshot.getRawBirthPlace() : null);

        if (hasNewBirth || birthDateEdited || birthPlaceEdited) {
            if (person.getBirthEvent() != null || hasNewBirth) {
                Event savedBirth = processPersonEventWithMerge(
                        gedIndi.getBirthDate(),
                        gedIndi.getBirthPlace(),
                        null,
                        birthDateEdited,
                        birthPlaceEdited,
                        false,
                        person,
                        birthRole,
                        person.getBirthEvent(),
                        null
                );
                person.setBirthEvent(savedBirth);
            }
        } else if (person.getBirthEvent() != null) {
            Event oldBirth = person.getBirthEvent();
            person.setBirthEvent(null);
            personRepository.save(person);
            eventRepository.delete(oldBirth);
        }

        // DEATH EVENT (3-way merge)
        boolean hasNewDeath = gedIndi.isDeathIndicated()
                || gedIndi.getDeathDate() != null
                || gedIndi.getDeathPlace() != null
                || gedIndi.getCauseOfDeath() != null;
        boolean deathDateEdited = isEventDateEdited(person.getDeathEvent(), oldSnapshot != null ? oldSnapshot.getRawDeathDate() : null);
        boolean deathPlaceEdited = isEventPlaceEdited(person.getDeathEvent(), oldSnapshot != null ? oldSnapshot.getRawDeathPlace() : null);
        boolean causeEdited = isEventCauseEdited(person.getDeathEvent(), oldSnapshot != null ? oldSnapshot.getRawCauseOfDeath() : null);

        if (hasNewDeath || deathDateEdited || deathPlaceEdited || causeEdited) {
            if (person.getDeathEvent() != null || hasNewDeath) {
                Event savedDeath = processPersonEventWithMerge(
                        gedIndi.getDeathDate(),
                        gedIndi.getDeathPlace(),
                        gedIndi.getCauseOfDeath(),
                        deathDateEdited,
                        deathPlaceEdited,
                        causeEdited,
                        person,
                        deathRole,
                        person.getDeathEvent(),
                        causeOfDeathDef
                );
                person.setDeathEvent(savedDeath);
            }
        } else if (person.getDeathEvent() != null) {
            Event oldDeath = person.getDeathEvent();
            person.setDeathEvent(null);
            personRepository.save(person);
            eventRepository.delete(oldDeath);
        }

        // BURIAL EVENT (3-way merge)
        Event existingBurialEvent = burialRepository.findByPerson(person).stream()
                .filter(b -> b.getBurialEvent() != null)
                .map(Burial::getBurialEvent)
                .findFirst()
                .orElse(null);
        boolean burialPlaceEdited = isEventPlaceEdited(existingBurialEvent, previousBurialPlace);

        if (gedIndi.getBurialPlace() != null || burialPlaceEdited) {
            if (existingBurialEvent != null || gedIndi.getBurialPlace() != null) {
                Event savedBurial = processPersonEventWithMerge(
                        null,
                        gedIndi.getBurialPlace(),
                        null,
                        false,
                        burialPlaceEdited,
                        false,
                        person,
                        burialRole,
                        existingBurialEvent,
                        null
                );
                processGraveAndBurial(savedBurial, person, previousBurialPlace);
            }
        } else if (previousBurialPlace != null) {
            burialRepository.findByPerson(person).forEach(b -> {
                if (b.getBurialEvent() != null) {
                    eventRepository.delete(b.getBurialEvent());
                }
                burialRepository.delete(b);
            });
        }

        return personRepository.save(person);
    }

    private Family applyFamily(
            ParsedGedcomFamilyDto gedFam,
            FamilyDecisionDto decision,
            String sourceSystem,
            Map<String, Long> resolvedGedRefToPersonId,
            EventTypeParticipantRole weddingRole
    ) {
        Long husbandId = gedFam.getHusbandGedRefId() != null
                ? resolvedGedRefToPersonId.get(gedFam.getHusbandGedRefId()) : null;
        Long wifeId = gedFam.getWifeGedRefId() != null
                ? resolvedGedRefToPersonId.get(gedFam.getWifeGedRefId()) : null;

        Person husband = husbandId != null ? personRepository.findById(husbandId).orElse(null) : null;
        Person wife = wifeId != null ? personRepository.findById(wifeId).orElse(null) : null;

        if (husband == null && wife == null) {
            return null;
        }

        boolean isUpdate = decision != null
                && decision.getAction() == DecisionAction.MATCH
                && decision.getTargetFamilyId() != null;

        Family family;
        String oldRawStatus = null;
        String oldRawWeddingDate = null;
        String oldRawWeddingPlace = null;
        Map<String, OldChildGedcomSnapshot> oldRawChildren = new HashMap<>();

        if (isUpdate) {
            family = familyRepository.findById(decision.getTargetFamilyId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Target family not found: " + decision.getTargetFamilyId()
                    ));
            if (family.getGedcomData() != null) {
                oldRawStatus = family.getGedcomData().getRawStatus();
                oldRawWeddingDate = family.getGedcomData().getRawWeddingDate();
                oldRawWeddingPlace = family.getGedcomData().getRawWeddingPlace();
                for (FamilyChildGedcomData rc : family.getGedcomData().getChildren()) {
                    oldRawChildren.put(
                            rc.getRawChildRefId(),
                            new OldChildGedcomSnapshot(rc.getRawPedigree(), rc.getRawAdoptedBy())
                    );
                }
            } else {
                FamilyGedcomData gd = new FamilyGedcomData();
                gd.setFamily(family);
                family.setGedcomData(gd);
            }
        } else {
            family = new Family();
            FamilyGedcomData gd = new FamilyGedcomData();
            gd.setFamily(family);
            family.setGedcomData(gd);
        }

        family.addExternalId(gedFam.getGedUid(), sourceSystem);
        family.setHusband(husband);
        family.setWife(wife);

        UserCode newStatus = findSystemCode(CodeCategory.FAMILY_STATUS.name(), gedFam.getStatusCode());
        boolean statusEdited = isUpdate
                && oldRawStatus != null
                && family.getStatus() != null
                && !Objects.equals(family.getStatus().getCode(), oldRawStatus);
        if (!statusEdited) {
            family.setStatus(newStatus);
        }

        FamilyGedcomData raw = family.getGedcomData();
        raw.setGedRefId(gedFam.getGedRefId());
        raw.setGedUid(gedFam.getGedUid());
        raw.setRawHusbandRefId(gedFam.getHusbandGedRefId());
        raw.setRawWifeRefId(gedFam.getWifeGedRefId());
        raw.setRawStatus(newStatus.getCode());
        raw.setLastImportedAt(LocalDateTime.now());

        family = familyRepository.save(family);

        boolean hasNewWedding = gedFam.getWeddingDate() != null || gedFam.getWeddingPlace() != null;
        boolean weddingDateEdited = isUpdate && isEventDateEdited(family.getPrimaryWedding(), oldRawWeddingDate);
        boolean weddingPlaceEdited = isUpdate && isEventPlaceEdited(family.getPrimaryWedding(), oldRawWeddingPlace);

        if (hasNewWedding || weddingDateEdited || weddingPlaceEdited) {
            raw.setRawWeddingDate(gedFam.getWeddingDate());
            raw.setRawWeddingPlace(gedFam.getWeddingPlace());
            if (family.getPrimaryWedding() != null || hasNewWedding) {
                Event weddingEvent = processWeddingEventWithMerge(
                        gedFam.getWeddingDate(),
                        gedFam.getWeddingPlace(),
                        weddingDateEdited,
                        weddingPlaceEdited,
                        family,
                        weddingRole
                );
                family.setPrimaryWedding(weddingEvent);
            }
        } else if (family.getPrimaryWedding() != null) {
            Event oldWedding = family.getPrimaryWedding();
            family.setPrimaryWedding(null);
            raw.setRawWeddingDate(null);
            raw.setRawWeddingPlace(null);
            familyRepository.save(family);
            eventRepository.delete(oldWedding);
        } else {
            raw.setRawWeddingDate(null);
            raw.setRawWeddingPlace(null);
        }

        processFamilyChildrenWithMerge(family, gedFam, resolvedGedRefToPersonId, oldRawChildren);
        return familyRepository.save(family);
    }

    private void processAbsentPeople(
            Set<Long> activePersonIdsInImport,
            Map<Long, AbsentPersonAction> absentPersonDecisions
    ) {
        List<Person> absentPeople = personRepository.findAll().stream()
                .filter(p -> !activePersonIdsInImport.contains(p.getId()))
                .toList();

        if (absentPeople.isEmpty()) {
            return;
        }

        Set<Long> absentIds = new HashSet<>();
        for (Person p : absentPeople) {
            absentIds.add(p.getId());
        }

        // Detach absent people from any remaining families
        List<Family> remainingFamilies = familyRepository.findAll();
        for (Family f : remainingFamilies) {
            boolean changed = false;
            if (f.getHusband() != null && absentIds.contains(f.getHusband().getId())) {
                f.setHusband(null);
                changed = true;
            }
            if (f.getWife() != null && absentIds.contains(f.getWife().getId())) {
                f.setWife(null);
                changed = true;
            }

            Iterator<FamilyChild> childIt = f.getChildren().iterator();
            while (childIt.hasNext()) {
                FamilyChild fc = childIt.next();
                if (absentIds.contains(fc.getChild().getId())) {
                    childIt.remove();
                    familyChildRepository.delete(fc);
                    changed = true;
                }
            }

            if (changed) {
                if (f.getHusband() == null && f.getWife() == null) {
                    familyRepository.delete(f);
                } else {
                    if (f.getPrimaryWedding() != null) {
                        f.getPrimaryWedding().getParticipants()
                                .removeIf(ep -> absentIds.contains(ep.getPerson().getId()));
                    }
                    familyRepository.save(f);
                }
            }
        }
        familyRepository.flush();

        // Execute ARCHIVE or DELETE per absent person
        for (Person absentPerson : absentPeople) {
            AbsentPersonAction action = absentPersonDecisions != null
                    ? absentPersonDecisions.getOrDefault(absentPerson.getId(),
                    Boolean.TRUE.equals(absentPerson.getIsArchived())
                            ? AbsentPersonAction.ARCHIVE
                            : AbsentPersonAction.DELETE)
                    : AbsentPersonAction.DELETE;

            if (action == AbsentPersonAction.ARCHIVE) {
                absentPerson.setIsArchived(true);
                absentPerson.setGedcomData(null);
                personRepository.save(absentPerson);
            } else {
                burialRepository.findByPerson(absentPerson).forEach(b -> {
                    if (b.getBurialEvent() != null) {
                        eventRepository.delete(b.getBurialEvent());
                    }
                    burialRepository.delete(b);
                });
                personRepository.delete(absentPerson);
            }
        }
        personRepository.flush();
    }

    private Event processPersonEventWithMerge(
            String newRawDate,
            String newRawPlace,
            String newRawCause,
            boolean dateEdited,
            boolean placeEdited,
            boolean causeEdited,
            Person person,
            EventTypeParticipantRole role,
            Event existingEvent,
            AttributeDefinition attrDef
    ) {
        Event event = existingEvent != null ? existingEvent : new Event();
        event.setEventType(role.getEventType());

        if (!dateEdited) {
            event.setStartDate(null);
            event.setEndDate(null);
            event.setCachedStartSortDateTime(null);
            event.setCachedEndSortDateTime(null);

            if (newRawDate != null) {
                var parsedDate = dateParser.parse(newRawDate);
                event.setStartDate(parsedDate.getStartDate());
                event.setEndDate(parsedDate.getEndDate());
                if (parsedDate.getStartDate() != null) {
                    event.setCachedStartSortDateTime(calculateAverageDate(parsedDate.getStartDate()));
                }
                if (parsedDate.getEndDate() != null) {
                    event.setCachedEndSortDateTime(calculateAverageDate(parsedDate.getEndDate()));
                }
            }
        }

        if (!placeEdited) {
            if (newRawPlace != null) {
                Location location = locationRepository.findByName(newRawPlace)
                        .orElseGet(() -> locationRepository.save(new Location(newRawPlace)));
                event.setMainLocation(location);
                event = eventRepository.save(event);
                eventRepository.flush();

                Event finalEvent = event;
                EventLocation el = eventLocationRepository.findByEvent(event).orElseGet(() -> {
                    EventLocation newEl = new EventLocation();
                    newEl.setEvent(finalEvent);
                    return newEl;
                });
                el.setLocation(location);
                eventLocationRepository.save(el);
                eventLocationRepository.flush();
            } else {
                event.setMainLocation(null);
                event = eventRepository.save(event);
                eventRepository.flush();
                eventLocationRepository.findByEvent(event).ifPresent(el -> {
                    eventLocationRepository.delete(el);
                    eventLocationRepository.flush();
                });
            }
        } else {
            event = eventRepository.save(event);
            eventRepository.flush();
        }

        if (existingEvent == null) {
            EventParticipant participant = new EventParticipant(event, person, role);
            eventParticipantRepository.save(participant);
        }

        if (attrDef != null && !causeEdited) {
            if (newRawCause != null && !newRawCause.isBlank()) {
                eventAttrValueRepository.deleteByEvent(event);
                eventAttrValueRepository.flush();
                saveEventAttribute(event, attrDef, newRawCause);
            } else {
                eventAttrValueRepository.deleteByEvent(event);
            }
        }

        return event;
    }

    private Event processWeddingEventWithMerge(
            String newRawDate,
            String newRawPlace,
            boolean dateEdited,
            boolean placeEdited,
            Family family,
            EventTypeParticipantRole role
    ) {
        Event event = family.getPrimaryWedding() != null ? family.getPrimaryWedding() : new Event();
        event.setEventType(role.getEventType());

        if (!dateEdited) {
            event.setStartDate(null);
            event.setEndDate(null);
            event.setCachedStartSortDateTime(null);
            event.setCachedEndSortDateTime(null);

            if (newRawDate != null) {
                var parsedDate = dateParser.parse(newRawDate);
                event.setStartDate(parsedDate.getStartDate());
                event.setEndDate(parsedDate.getEndDate());
                if (parsedDate.getStartDate() != null) {
                    event.setCachedStartSortDateTime(calculateAverageDate(parsedDate.getStartDate()));
                }
                if (parsedDate.getEndDate() != null) {
                    event.setCachedEndSortDateTime(calculateAverageDate(parsedDate.getEndDate()));
                }
            }
        }

        if (!placeEdited) {
            if (newRawPlace != null) {
                Location loc = locationRepository.findByName(newRawPlace)
                        .orElseGet(() -> locationRepository.save(new Location(newRawPlace)));
                event.setMainLocation(loc);
                event = eventRepository.save(event);
                eventRepository.flush();

                Event finalEvent = event;
                EventLocation el = eventLocationRepository.findByEvent(event).orElseGet(() -> {
                    EventLocation newEl = new EventLocation();
                    newEl.setEvent(finalEvent);
                    return newEl;
                });
                el.setLocation(loc);
                eventLocationRepository.save(el);
                eventLocationRepository.flush();
            } else {
                event.setMainLocation(null);
                event = eventRepository.save(event);
                eventRepository.flush();
                eventLocationRepository.findByEvent(event).ifPresent(el -> {
                    eventLocationRepository.delete(el);
                    eventLocationRepository.flush();
                });
            }
        } else {
            event = eventRepository.save(event);
            eventRepository.flush();
        }

        // Remove participants that are no longer husband or wife in this family
        event.getParticipants().removeIf(ep -> {
            Long pid = ep.getPerson().getId();
            boolean isHusb = family.getHusband() != null && family.getHusband().getId().equals(pid);
            boolean isWife = family.getWife() != null && family.getWife().getId().equals(pid);
            return !isHusb && !isWife;
        });

        if (family.getHusband() != null) {
            addParticipantIfNotExists(event, family.getHusband(), role);
        }
        if (family.getWife() != null) {
            addParticipantIfNotExists(event, family.getWife(), role);
        }

        return eventRepository.save(event);
    }

    private boolean isEventDateEdited(Event existingEvent, String oldRawDate) {
        if (existingEvent == null) {
            return false;
        }
        if (oldRawDate == null) {
            return existingEvent.getStartDate() != null || existingEvent.getEndDate() != null;
        }
        GedcomDateParser.DateParseResult expected = dateParser.parse(oldRawDate);
        return !dateDescriptorsEqual(existingEvent.getStartDate(), expected.getStartDate())
                || !dateDescriptorsEqual(existingEvent.getEndDate(), expected.getEndDate());
    }

    private boolean isEventPlaceEdited(Event existingEvent, String oldRawPlace) {
        if (existingEvent == null) {
            return false;
        }
        String currentPlace = existingEvent.getMainLocation() != null
                ? existingEvent.getMainLocation().getName() : null;
        return !Objects.equals(currentPlace, oldRawPlace);
    }

    private boolean isEventCauseEdited(Event existingEvent, String oldRawCause) {
        if (existingEvent == null) {
            return false;
        }
        String currentCause = eventAttrValueRepository.findByEvent(existingEvent).stream()
                .map(eav -> eav.getAttributeDictionaryValue().getCode())
                .findFirst()
                .orElse(null);
        return !Objects.equals(currentCause, oldRawCause);
    }

    private boolean dateDescriptorsEqual(DateDescriptor d1, DateDescriptor d2) {
        if (d1 == d2) return true;
        if (d1 == null || d2 == null) return false;
        return d1.getDateType() == d2.getDateType()
                && Objects.equals(d1.getFreeText(), d2.getFreeText())
                && d1.getStartQualifier() == d2.getStartQualifier()
                && Objects.equals(d1.getStartYear(), d2.getStartYear())
                && Objects.equals(d1.getStartMonth(), d2.getStartMonth())
                && Objects.equals(d1.getStartDay(), d2.getStartDay())
                && d1.getEndQualifier() == d2.getEndQualifier()
                && Objects.equals(d1.getEndYear(), d2.getEndYear())
                && Objects.equals(d1.getEndMonth(), d2.getEndMonth())
                && Objects.equals(d1.getEndDay(), d2.getEndDay());
    }

    private PersonGedcomData copyPersonGedcomData(PersonGedcomData source) {
        PersonGedcomData copy = new PersonGedcomData();
        copy.setGedRefId(source.getGedRefId());
        copy.setGedUid(source.getGedUid());
        copy.setRawGivenName(source.getRawGivenName());
        copy.setRawSurname(source.getRawSurname());
        copy.setRawSex(source.getRawSex());
        copy.setRawDeathIndicated(source.getRawDeathIndicated());
        copy.setRawBirthDate(source.getRawBirthDate());
        copy.setRawBirthPlace(source.getRawBirthPlace());
        copy.setRawDeathDate(source.getRawDeathDate());
        copy.setRawDeathPlace(source.getRawDeathPlace());
        copy.setRawCauseOfDeath(source.getRawCauseOfDeath());
        copy.setRawBurialPlace(source.getRawBurialPlace());
        return copy;
    }

    private void addParticipantIfNotExists(Event event, Person person, EventTypeParticipantRole role) {
        boolean exists = event.getParticipants().stream()
                .anyMatch(p -> p.getPerson().getId().equals(person.getId()));
        if (!exists) {
            EventParticipant part = new EventParticipant(event, person, role);
            eventParticipantRepository.save(part);
            event.addParticipant(part);
        }
    }

    private void updatePersonName(Person person, String givenName, String surname) {
        PersonName name = personNameRepository.findByPersonAndType(person, PersonNameType.BIRTH.name())
                .orElseGet(() -> new PersonName(person, PersonNameType.BIRTH.name(), givenName, surname, true));
        name.setGivenName(givenName);
        name.setSurname(surname);
        name.setIsCurrent(true);
        personNameRepository.save(name);
    }

    private void processGraveAndBurial(Event burialEvent, Person person, String previousBurialPlace) {
        if (burialEvent.getMainLocation() != null) {
            Burial burial = burialRepository.findByPerson(person).stream()
                    .filter(b -> b.getBurialEvent() != null && b.getBurialEvent().getId().equals(burialEvent.getId()))
                    .findFirst()
                    .orElseGet(Burial::new);

            if (burial.getGrave() == null || previousBurialPlace == null
                    || !burialEvent.getMainLocation().getName().equals(previousBurialPlace)) {
                Grave grave = new Grave();
                grave.setCemeteryLocation(burialEvent.getMainLocation());
                grave = graveRepository.save(grave);
                burial.setGrave(grave);
            } else {
                burial.getGrave().setCemeteryLocation(burialEvent.getMainLocation());
                graveRepository.save(burial.getGrave());
            }

            burial.setPerson(person);
            burial.setBurialEvent(burialEvent);
            burial.setIsCurrent(true);
            burialRepository.save(burial);
        }
    }

    private void saveEventAttribute(Event event, AttributeDefinition definition, String value) {
        AttributeDictionaryValue dictValue = attrDictValueRepository
                .findByAttributeDefinitionAndCode(definition, value)
                .orElseGet(() -> {
                    AttributeDictionaryValue newValue = new AttributeDictionaryValue();
                    newValue.setAttributeDefinition(definition);
                    newValue.setCode(value);
                    newValue.setIsSystem(false);
                    return attrDictValueRepository.save(newValue);
                });

        EventAttributeValue eventAttr = new EventAttributeValue();
        eventAttr.setEvent(event);
        eventAttr.setAttributeDictionaryValue(dictValue);
        eventAttrValueRepository.save(eventAttr);
    }

    private void cleanUpOrphans() {
        eventRepository.deleteOrphanEvents();
        graveRepository.deleteOrphanGraves();
        locationRepository.deleteOrphanLocations();
        attrDictValueRepository.deleteOrphanValues();
    }

    private UserCode findSystemCode(String category, String code) {
        return userCodeRepository.findByCategoryAndCode(category, code)
                .orElseThrow(() -> new RuntimeException("System code " + category + "." + code + " not found"));
    }

    private EventTypeParticipantRole getEtprOrThrow(UserCode type, UserCode role) {
        return etprRepository.findByEventTypeAndParticipantRole(type, role)
                .orElseThrow(() -> new IllegalStateException(
                        String.format("Missing configuration: %s - %s", type.getCode(), role.getCode())
                ));
    }

    private LocalDateTime calculateAverageDate(DateDescriptor dd) {
        if (dd.getSortDateTimeMin() != null && dd.getSortDateTimeMax() != null) {
            long halfSeconds = Duration.between(dd.getSortDateTimeMin(), dd.getSortDateTimeMax()).getSeconds() / 2;
            return dd.getSortDateTimeMin().plusSeconds(halfSeconds);
        }
        return null;
    }

    private PersonSex mapGedcomSexToEnum(String sex) {
        if (sex == null) return PersonSex.UNKNOWN;
        return switch (sex.toUpperCase().trim()) {
            case "M" -> PersonSex.MALE;
            case "F" -> PersonSex.FEMALE;
            default -> PersonSex.UNKNOWN;
        };
    }

    private record OldChildGedcomSnapshot(String rawPedigree, String rawAdoptedBy) {}

    private void processFamilyChildrenWithMerge(
            Family family,
            ParsedGedcomFamilyDto gedFam,
            Map<String, Long> resolvedGedRefToPersonId,
            Map<String, OldChildGedcomSnapshot> oldRawChildren
    ) {
        Map<Long, ParsedGedcomChildLinkDto> targetChildLinks = new LinkedHashMap<>();
        if (gedFam.getChildren() != null) {
            for (ParsedGedcomChildLinkDto link : gedFam.getChildren()) {
                Long childPersonId = resolvedGedRefToPersonId.get(link.getChildGedRefId());
                if (childPersonId != null) {
                    targetChildLinks.put(childPersonId, link);
                }
            }
        }

        Iterator<FamilyChild> iterator = family.getChildren().iterator();
        while (iterator.hasNext()) {
            FamilyChild fc = iterator.next();
            if (!targetChildLinks.containsKey(fc.getChild().getId())) {
                iterator.remove();
                familyChildRepository.delete(fc);
            }
        }
        familyRepository.save(family);
        familyRepository.flush();

        family.getGedcomData().getChildren().clear();

        for (Map.Entry<Long, ParsedGedcomChildLinkDto> entry : targetChildLinks.entrySet()) {
            Long childPersonId = entry.getKey();
            ParsedGedcomChildLinkDto link = entry.getValue();

            personRepository.findById(childPersonId).ifPresent(childPerson -> {
                FamilyChildRelationshipType newFatherRel = resolveFatherRelationshipType(
                        link.getRawPedigree(), link.getRawAdoptedBy()
                );
                FamilyChildRelationshipType newMotherRel = resolveMotherRelationshipType(
                        link.getRawPedigree(), link.getRawAdoptedBy()
                );

                FamilyChild existingChild = family.getChildren().stream()
                        .filter(fc -> fc.getChild().getId().equals(childPersonId))
                        .findFirst()
                        .orElse(null);

                if (existingChild != null) {
                    OldChildGedcomSnapshot oldSnap = oldRawChildren.get(link.getChildGedRefId());
                    String oldPed = oldSnap != null ? oldSnap.rawPedigree() : null;
                    String oldAdop = oldSnap != null ? oldSnap.rawAdoptedBy() : null;

                    FamilyChildRelationshipType oldExpectedFatherRel = resolveFatherRelationshipType(oldPed, oldAdop);
                    FamilyChildRelationshipType oldExpectedMotherRel = resolveMotherRelationshipType(oldPed, oldAdop);

                    if (existingChild.getFatherRelationshipType() == oldExpectedFatherRel) {
                        existingChild.setFatherRelationshipType(newFatherRel);
                    }
                    if (existingChild.getMotherRelationshipType() == oldExpectedMotherRel) {
                        existingChild.setMotherRelationshipType(newMotherRel);
                    }
                } else {
                    FamilyChild fc = new FamilyChild(family, childPerson, newFatherRel, newMotherRel);
                    family.addChild(fc);
                }

                FamilyChildGedcomData rawChild = new FamilyChildGedcomData();
                rawChild.setRawChildRefId(link.getChildGedRefId());
                rawChild.setRawPedigree(link.getRawPedigree());
                rawChild.setRawAdoptedBy(link.getRawAdoptedBy());
                family.getGedcomData().addChild(rawChild);
            });
        }
    }

    private FamilyChildRelationshipType resolveFatherRelationshipType(String rawPedigree, String rawAdoptedBy) {
        FamilyChildRelationshipType baseType = mapPedigreeToEnum(rawPedigree);
        if (rawAdoptedBy == null || rawAdoptedBy.isBlank()) {
            return baseType;
        }
        return switch (rawAdoptedBy.trim().toUpperCase()) {
            case "HUSB", "BOTH" -> FamilyChildRelationshipType.ADOPTED;
            case "WIFE" -> baseType == FamilyChildRelationshipType.FOSTER
                    ? FamilyChildRelationshipType.FOSTER
                    : FamilyChildRelationshipType.BIOLOGICAL;
            default -> baseType;
        };
    }

    private FamilyChildRelationshipType resolveMotherRelationshipType(String rawPedigree, String rawAdoptedBy) {
        FamilyChildRelationshipType baseType = mapPedigreeToEnum(rawPedigree);
        if (rawAdoptedBy == null || rawAdoptedBy.isBlank()) {
            return baseType;
        }
        return switch (rawAdoptedBy.trim().toUpperCase()) {
            case "WIFE", "BOTH" -> FamilyChildRelationshipType.ADOPTED;
            case "HUSB" -> baseType == FamilyChildRelationshipType.FOSTER
                    ? FamilyChildRelationshipType.FOSTER
                    : FamilyChildRelationshipType.BIOLOGICAL;
            default -> baseType;
        };
    }

    private FamilyChildRelationshipType mapPedigreeToEnum(String pedi) {
        if (pedi == null || pedi.isBlank()) return FamilyChildRelationshipType.BIOLOGICAL;
        return switch (pedi.trim().toUpperCase()) {
            case "BIRTH" -> FamilyChildRelationshipType.BIOLOGICAL;
            case "ADOPTED" -> FamilyChildRelationshipType.ADOPTED;
            case "FOSTER" -> FamilyChildRelationshipType.FOSTER;
            default -> FamilyChildRelationshipType.OTHER;
        };
    }

    private String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}