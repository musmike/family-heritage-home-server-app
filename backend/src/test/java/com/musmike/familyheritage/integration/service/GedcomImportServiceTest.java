package com.musmike.familyheritage.integration.service;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import com.musmike.familyheritage.service.GedcomImportService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.Month;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

public class GedcomImportServiceTest extends AbstractIntegrationTest {
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private EventRepository eventRepository;
    @Autowired private BurialRepository burialRepository;
    @Autowired private EventAttributeValueRepository eventAttrRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private EventLocationRepository eventLocationRepository;
    @Autowired private PersonNameRepository personNameRepository;
    @Autowired private FamilyRepository familyRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private AttributeDictionaryValueRepository attrDictValueRepository;
    @Autowired private GraveRepository graveRepository;
    @Autowired private EventParticipantRepository eventParticipantRepository;

    @Test
    @Transactional
    void shouldImportFullPersonLifecycle_VerifyAllFields() throws Exception {
        // GIVEN
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID 581e20c218f061e69c6788ae1d62490a
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa, Polska
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków, Polska
            2 CAUS Zawał serca
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 TRLR
            """;

        ByteArrayInputStream inputStream = new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8));

        // WHEN
        importService.importGedcom(inputStream);

        entityManager.flush();
        entityManager.clear();

        // THEN
        List<Person> persons = personRepository.findAll();
        assertThat(persons).hasSize(1);
        Person person = persons.getFirst();

        // Raw Data
        PersonGedcomData raw = person.getGedcomData();
        assertThat(raw.getGedUid()).isEqualTo("581e20c218f061e69c6788ae1d62490a");
        assertThat(raw.getGedRefId()).isEqualTo("@I1@");
        assertThat(raw.getRawGivenName()).isEqualTo("Jan");
        assertThat(raw.getRawSurname()).isEqualTo("Kowalski");
        assertThat(raw.getRawSex()).isEqualTo("M");
        assertThat(raw.getRawDeathIndicated()).isTrue();
        assertThat(raw.getRawBirthDate()).isEqualTo("10 JAN 1920");
        assertThat(raw.getRawBirthPlace()).isEqualTo("Warszawa, Polska");
        assertThat(raw.getRawDeathDate()).isEqualTo("15 FEB 1990");
        assertThat(raw.getRawDeathPlace()).isEqualTo("Kraków, Polska");
        assertThat(raw.getRawCauseOfDeath()).isEqualTo("Zawał serca");
        assertThat(raw.getRawBurialPlace()).isEqualTo("Cmentarz Rakowicki, Kraków");
        assertThat(raw.getLastImportedAt()).isNotNull();


        // Local Data
        assertThat(person.getCachedGivenName()).isEqualTo("Jan");
        assertThat(person.getCachedSurname()).isEqualTo("Kowalski");
        assertThat(person.getSex()).isEqualTo(PersonSex.MALE);
        assertThat(person.getLifeState()).isEqualTo(LifeState.DECEASED);

        List<PersonName> names = personNameRepository.findAll();
        assertThat(names).hasSize(1);
        PersonName nameRecord = names.getFirst();
        assertThat(nameRecord.getPerson().getId()).isEqualTo(person.getId());
        assertThat(nameRecord.getType()).isEqualTo(EventType.BIRTH.name());
        assertThat(nameRecord.getGivenName()).isEqualTo("Jan");
        assertThat(nameRecord.getSurname()).isEqualTo("Kowalski");
        assertThat(nameRecord.getIsCurrent()).isTrue();


        List<Event> events = eventRepository.findAll();
        assertThat(events).hasSize(3);

        // Birth Event
        Event birth = person.getBirthEvent();
        assertThat(birth).isNotNull();
        assertThat(birth.getEventType().getCode()).isEqualTo(EventType.BIRTH.name());
        assertThat(birth.getCachedStartSortDateTime())
                .hasYear(1920)
                .hasMonth(Month.of(1))
                .hasDayOfMonth(10);
        assertThat(birth.getCachedEndSortDateTime()).isNull();
        assertThat(birth.getStartDate()).isNotNull();
        assertThat(birth.getStartDate().getStartYear()).isEqualTo(1920);
        assertThat(birth.getStartDate().getStartMonth()).isEqualTo(1);
        assertThat(birth.getStartDate().getStartDay()).isEqualTo(10);
        assertThat(birth.getEndDate()).isNull();
        assertThat(birth.getMainLocation().getName()).isEqualTo("Warszawa, Polska");

        List<EventLocation> birthLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(birth.getId()))
                .toList();
        assertThat(birthLocs).hasSize(1);
        assertThat(birthLocs.getFirst().getLocation().getName()).isEqualTo("Warszawa, Polska");


        List<EventParticipant> birthParticipants = birth.getParticipants().stream().toList();
        assertThat(birthParticipants.getFirst().getRole().getParticipantRole().getCode())
            .isEqualTo(EventParticipantRole.PRINCIPAL.name());


        // Death Event
        Event death = person.getDeathEvent();
        assertThat(death).isNotNull();
        assertThat(death.getEventType().getCode()).isEqualTo(EventType.DEATH.name());
        assertThat(death.getCachedStartSortDateTime())
                .hasYear(1990)
                .hasMonth(Month.of(2))
                .hasDayOfMonth(15);
        assertThat(death.getCachedEndSortDateTime()).isNull();
        assertThat(death.getStartDate()).isNotNull();
        assertThat(death.getStartDate().getStartYear()).isEqualTo(1990);
        assertThat(death.getStartDate().getStartMonth()).isEqualTo(2);
        assertThat(death.getStartDate().getStartDay()).isEqualTo(15);
        assertThat(death.getEndDate()).isNull();
        assertThat(death.getMainLocation().getName()).isEqualTo("Kraków, Polska");

        List<EventLocation> deathLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(death.getId()))
                .toList();
        assertThat(deathLocs).hasSize(1);
        assertThat(deathLocs.getFirst().getLocation().getName()).isEqualTo("Kraków, Polska");

        List<EventParticipant> deathParticipants = death.getParticipants().stream().toList();
        assertThat(deathParticipants.getFirst().getRole().getParticipantRole().getCode())
            .isEqualTo(EventParticipantRole.PRINCIPAL.name());

        List<EventAttributeValue> deathAttrs = eventAttrRepository.findAll().stream()
                .filter(eav -> eav.getEvent().getId().equals(death.getId()))
                .toList();
        assertThat(deathAttrs).hasSize(1);
        AttributeDictionaryValue attrVal = deathAttrs.getFirst().getAttributeDictionaryValue();
        assertThat(attrVal.getCode()).isEqualTo("Zawał serca");
        assertThat(attrVal.getAttributeDefinition().getCode())
                .isEqualTo(DeathEventAttributeDefinition.CAUSE_OF_DEATH.name());


        // Burial Event
        List<Burial> burials = burialRepository.findAll();
        assertThat(burials).hasSize(1);
        Burial burialRecord = burials.getFirst();

        Event burialEvent = burialRecord.getBurialEvent();
        assertThat(burialEvent).isNotNull();
        assertThat(burialEvent.getEventType().getCode()).isEqualTo(EventType.BURIAL.name());
        assertThat(burialEvent.getCachedStartSortDateTime()).isNull();
        assertThat(burialEvent.getCachedEndSortDateTime()).isNull();
        assertThat(burialEvent.getStartDate()).isNull();
        assertThat(burialEvent.getEndDate()).isNull();
        assertThat(burialEvent.getMainLocation().getName()).isEqualTo("Cmentarz Rakowicki, Kraków");

        assertThat(burialRecord.getGrave()).isNotNull();
        assertThat(burialRecord.getGrave().getCemeteryLocation().getName())
                .isEqualTo("Cmentarz Rakowicki, Kraków");
        assertThat(burialRecord.getPerson().getId()).isEqualTo(person.getId());
        assertThat(burialRecord.getIsCurrent()).isTrue();

        List<EventLocation> burialLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(burialEvent.getId()))
                .toList();
        assertThat(burialLocs).hasSize(1);
        assertThat(burialLocs.getFirst().getLocation().getName()).isEqualTo("Cmentarz Rakowicki, Kraków");

        List<EventParticipant> burialParticipants = burialEvent.getParticipants().stream().toList();
        assertThat(burialParticipants.getFirst().getRole().getParticipantRole().getCode())
            .isEqualTo(EventParticipantRole.PRINCIPAL.name());
    }

    @Test
    @Transactional
    void shouldImportThreeFamiliesWithChildrenWeddingEventsAndGedcomData() throws Exception {
        // GIVEN
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 NAME Mark /Smith/
            1 FAMS @F3@
            1 FAMC @F1@
            0 @I4@ INDI
            1 NAME Karol /Krawczyk/
            1 FAMS @F2@
            1 FAMC @F1@
            2 PEDI Adopted
            0 @I5@ INDI
            1 NAME Zofia /Nowak/
            1 FAMS @F2@
            0 @F1@ FAM
            1 _UID 48152353522421
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 CHIL @I4@
            1 MARR
            2 DATE 10 JUN 1950
            2 PLAC Warszawa
            1 DIV
            0 @F2@ FAM
            1 _UID 78152d353522421
            1 HUSB @I4@
            1 WIFE @I5@
            1 MARR
            2 DATE 5 JAN 1995
            2 PLAC Kraków
            2 TYPE MYHERITAGE:REL_PARTNERS
            0 @F3@ FAM
            1 HUSB @I3@
            1 MARR
            0 TRLR
            """;

        // WHEN
        ByteArrayInputStream inputStream = new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(inputStream);

        entityManager.flush();
        entityManager.clear();

        // THEN
        List<Family> families = familyRepository.findAll();
        assertThat(families).hasSize(3);

        Family fam1 = familyRepository
                .findByGedcomDataGedRefId("@F1@")
                .orElseThrow();
        Family fam2 = familyRepository
                .findByGedcomDataGedRefId("@F2@")
                .orElseThrow();
        Family fam3 = familyRepository
                .findByGedcomDataGedRefId("@F3@")
                .orElseThrow();

        // =========================================================
        // FAMILY 1 – John Smith + Lucy Johnson Marriage
        // =========================================================

        // Spouses
        assertThat(fam1.getHusband()).isNotNull();
        assertThat(fam1.getHusband().getCachedGivenName()).isEqualTo("John");
        assertThat(fam1.getHusband().getCachedSurname()).isEqualTo("Smith");
        assertThat(fam1.getWife()).isNotNull();
        assertThat(fam1.getWife().getCachedGivenName()).isEqualTo("Lucy");
        assertThat(fam1.getWife().getCachedSurname()).isEqualTo("Johnson");

        // Wedding Event
        assertThat(fam1.getPrimaryWedding()).isNotNull();
        Event wedding1 = fam1.getPrimaryWedding();
        assertThat(wedding1.getEventType().getCode()).isEqualTo(EventType.WEDDING.name());
        assertThat(wedding1.getMainLocation().getName()).isEqualTo("Warszawa");
        assertThat(wedding1.getStartDate()).isNotNull();
        assertThat(wedding1.getStartDate().getStartYear()).isEqualTo(1950);
        assertThat(wedding1.getStartDate().getStartMonth()).isEqualTo(6);
        assertThat(wedding1.getStartDate().getStartDay()).isEqualTo(10);
        assertThat(wedding1.getEndDate()).isNull();
        assertThat(wedding1.getCachedStartSortDateTime())
                .hasYear(1950)
                .hasMonth(Month.of(6))
                .hasDayOfMonth(10);

        // Event Locations
        List<EventLocation> weddingLocs1 = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(wedding1.getId()))
                .toList();
        assertThat(weddingLocs1).hasSize(1);
        assertThat(weddingLocs1.getFirst().getLocation().getName()).isEqualTo("Warszawa");

        // Event Participants
        assertThat(wedding1.getParticipants()).hasSize(2);
        assertThat(wedding1.getParticipants())
                .extracting(ep -> ep.getPerson().getCachedGivenName())
                .containsExactlyInAnyOrder("John", "Lucy");
        assertThat(wedding1.getParticipants())
                .allMatch(ep -> ep.getRole().getParticipantRole().getCode()
                        .equals(EventParticipantRole.PRINCIPAL.name()));

        // Status
        assertThat(fam1.getStatus().getCode()).isEqualTo(FamilyStatus.DIVORCED.name());

        // Children
        assertThat(fam1.getChildren()).hasSize(2);
        assertThat(fam1.getChildren())
                .extracting(fc -> fc.getChild().getCachedGivenName())
                .containsExactlyInAnyOrder("Mark", "Karol");

        FamilyChild markRel = fam1.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Mark"))
                .findFirst().orElseThrow();
        assertThat(markRel.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);
        assertThat(markRel.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);

        FamilyChild karolRel = fam1.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Karol"))
                .findFirst().orElseThrow();
        assertThat(karolRel.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);
        assertThat(karolRel.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        // Raw Gedcom Data
        FamilyGedcomData gd1 = fam1.getGedcomData();
        assertThat(gd1.getGedRefId()).isEqualTo("@F1@");
        assertThat(gd1.getGedUid()).isEqualTo("48152353522421");
        assertThat(gd1.getRawHusbandRefId()).isEqualTo("@I1@");
        assertThat(gd1.getRawWifeRefId()).isEqualTo("@I2@");
        assertThat(gd1.getRawWeddingDate()).isEqualTo("10 JUN 1950");
        assertThat(gd1.getRawWeddingPlace()).isEqualTo("Warszawa");
        assertThat(gd1.getRawStatus()).isEqualTo(FamilyStatus.DIVORCED.name());
        assertThat(gd1.getLastImportedAt()).isNotNull();
        assertThat(gd1.getLastImportedAt()).isBefore(LocalDateTime.now());

        // Raw Gedcom Data - Children
        Set<FamilyChildGedcomData> rawChildren1 = gd1.getChildren();
        assertThat(rawChildren1).hasSize(2);
        assertThat(rawChildren1)
                .extracting(FamilyChildGedcomData::getRawChildRefId)
                .containsExactlyInAnyOrder("@I3@", "@I4@");

        FamilyChildGedcomData rawMark = rawChildren1.stream()
                .filter(c -> c.getRawChildRefId().equals("@I3@"))
                .findFirst().orElseThrow();
        assertThat(rawMark.getRawPedigree()).isNull();
        assertThat(rawMark.getRawAdoptedBy()).isNull();

        FamilyChildGedcomData rawKarol = rawChildren1.stream()
                .filter(c -> c.getRawChildRefId().equals("@I4@"))
                .findFirst().orElseThrow();
        assertThat(rawKarol.getRawPedigree()).isEqualToIgnoringCase("Adopted");
        assertThat(rawKarol.getRawAdoptedBy()).isNull();


        // =========================================================
        // FAMILY 2 – Karol Krawczyk + Zofia Nowak Partnership
        // =========================================================

        // Spouses
        assertThat(fam2.getHusband()).isNotNull();
        assertThat(fam2.getHusband().getCachedGivenName()).isEqualTo("Karol");
        assertThat(fam2.getWife()).isNotNull();
        assertThat(fam2.getWife().getCachedGivenName()).isEqualTo("Zofia");

        // Children
        assertThat(fam2.getChildren()).isEmpty();

        // Wedding Event
        assertThat(fam2.getPrimaryWedding()).isNotNull();
        Event wedding2 = fam2.getPrimaryWedding();
        assertThat(wedding2.getEventType().getCode()).isEqualTo(EventType.WEDDING.name());
        assertThat(wedding2.getMainLocation().getName()).isEqualTo("Kraków");
        assertThat(wedding2.getStartDate()).isNotNull();
        assertThat(wedding2.getStartDate().getStartYear()).isEqualTo(1995);
        assertThat(wedding2.getStartDate().getStartMonth()).isEqualTo(1);
        assertThat(wedding2.getStartDate().getStartDay()).isEqualTo(5);

        // Event Locations
        List<EventLocation> weddingLocs2 = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(wedding2.getId()))
                .toList();
        assertThat(weddingLocs2).hasSize(1);
        assertThat(weddingLocs2.getFirst().getLocation().getName()).isEqualTo("Kraków");

        // Event Participants
        assertThat(wedding2.getParticipants()).hasSize(2);
        assertThat(wedding2.getParticipants())
                .extracting(ep -> ep.getPerson().getCachedGivenName())
                .containsExactlyInAnyOrder("Karol", "Zofia");
        assertThat(wedding2.getParticipants())
                .allMatch(ep -> ep.getRole().getParticipantRole().getCode()
                        .equals(EventParticipantRole.PRINCIPAL.name()));

        // Status
        assertThat(fam2.getStatus().getCode()).isEqualTo(FamilyStatus.PARTNERS.name());

        // Raw Gedcom Data
        FamilyGedcomData gd2 = fam2.getGedcomData();
        assertThat(gd2.getGedRefId()).isEqualTo("@F2@");
        assertThat(gd2.getGedUid()).isEqualTo("78152d353522421");
        assertThat(gd2.getRawHusbandRefId()).isEqualTo("@I4@");
        assertThat(gd2.getRawWifeRefId()).isEqualTo("@I5@");
        assertThat(gd2.getRawWeddingDate()).isEqualTo("5 JAN 1995");
        assertThat(gd2.getRawWeddingPlace()).isEqualTo("Kraków");
        assertThat(gd2.getRawStatus()).isEqualTo(FamilyStatus.PARTNERS.name());
        assertThat(gd2.getLastImportedAt()).isNotNull();

        // Raw Gedcom Data Children
        assertThat(gd2.getChildren()).isEmpty();

        // Karol is both a husband in F2 and a child in F1 – cross-family verification
        assertThat(fam2.getHusband().getId()).isEqualTo(karolRel.getChild().getId());


        // =========================================================
        // FAMILY 3 – Mark Smith (no wife, no wedding date, default status)
        // =========================================================

        // Spouses
        assertThat(fam3.getHusband()).isNotNull();
        assertThat(fam3.getHusband().getCachedGivenName()).isEqualTo("Mark");
        assertThat(fam3.getHusband().getCachedSurname()).isEqualTo("Smith");
        assertThat(fam3.getWife()).isNull();

        // Status – brak tagów DIV/SEP/etc., powinien ustawić się domyślny MARRIED
        assertThat(fam3.getStatus().getCode()).isEqualTo(FamilyStatus.MARRIED.name());

        // Brak ślubu i dzieci
        assertThat(fam3.getPrimaryWedding()).isNull();
        assertThat(fam3.getChildren()).isEmpty();

        // Raw Gedcom Data
        FamilyGedcomData gd3 = fam3.getGedcomData();
        assertThat(gd3.getGedRefId()).isEqualTo("@F3@");
        assertThat(gd3.getGedUid()).isNull();
        assertThat(gd3.getRawHusbandRefId()).isEqualTo("@I3@");
        assertThat(gd3.getRawWifeRefId()).isNull();
        assertThat(gd3.getRawWeddingDate()).isNull();
        assertThat(gd3.getRawWeddingPlace()).isNull();
        assertThat(gd3.getRawStatus()).isEqualTo(FamilyStatus.MARRIED.name());
        assertThat(gd3.getLastImportedAt()).isNotNull();
        assertThat(gd3.getChildren()).isEmpty();

        // Mark is both a husband in F3 and a child in F1 – cross-family verification
        assertThat(fam3.getHusband().getId()).isEqualTo(markRel.getChild().getId());

        assertThat(familyRepository.findAll())
                .allMatch(f -> f.getStatus().getCode().equals(f.getGedcomData().getRawStatus()));
    }

    @Test
    @Transactional
    void shouldUpdatePersonFieldsOnSecondImport() throws Exception {
        // GIVEN
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID 581e20c218f061e69c6788ae1d62490a
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa, Polska
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków, Polska
            2 CAUS Zawał serca
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 TRLR
            """;

        ByteArrayInputStream inputStreamV1 = new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(inputStreamV1);

        Person p1 = personRepository.findAll().getFirst();
        assertThat(p1.getCachedGivenName()).isEqualTo("Jan");
        assertThat(p1.getSex()).isEqualTo(PersonSex.MALE);
        assertThat(p1.getBirthEvent().getStartDate().getStartYear()).isEqualTo(1920);
        assertThat(p1.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa, Polska");
        assertThat(p1.getGedcomData().getRawCauseOfDeath()).isEqualTo("Zawał serca");
        assertThat(burialRepository.findAll().getFirst().getGrave().getCemeteryLocation()
                .getName()).isEqualTo("Cmentarz Rakowicki, Kraków");

        // WHEN
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I2@ INDI
            1 _UID 581e20c218f061e69c6788ae1d62490a
            1 NAME Tomasz /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 15 MAR 1925
            2 PLAC Gdańsk
            1 DEAT
            2 DATE 2000
            2 PLAC Sopot
            2 CAUS Wypadek
            1 BURI
            2 PLAC Cmentarz Nowy w Warszawie
            0 TRLR
            """;

        LocalDateTime firstImportTime = p1.getGedcomData().getLastImportedAt();
        Thread.sleep(100);

        ByteArrayInputStream inputStreamV2 = new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(inputStreamV2);

        entityManager.flush();
        entityManager.clear();

        // THEN
        List<Person> persons = personRepository.findAll();
        assertThat(persons).hasSize(1);
        Person p2 = persons.getFirst();

        // Raw Data
        PersonGedcomData raw = p2.getGedcomData();
        assertThat(raw.getGedRefId()).isEqualTo("@I2@");
        assertThat(raw.getRawGivenName()).isEqualTo("Tomasz");
        assertThat(raw.getRawSurname()).isEqualTo("Nowak");
        assertThat(raw.getRawSex()).isEqualTo("F");
        assertThat(raw.getRawDeathIndicated()).isTrue();
        assertThat(raw.getRawBirthDate()).isEqualTo("15 MAR 1925");
        assertThat(raw.getRawBirthPlace()).isEqualTo("Gdańsk");
        assertThat(raw.getRawDeathDate()).isEqualTo("2000");
        assertThat(raw.getRawDeathPlace()).isEqualTo("Sopot");
        assertThat(raw.getRawCauseOfDeath()).isEqualTo("Wypadek");
        assertThat(raw.getRawBurialPlace()).isEqualTo("Cmentarz Nowy w Warszawie");
        assertThat(raw.getLastImportedAt()).isNotEqualTo(firstImportTime);

        // Local Data
        assertThat(p2.getCachedGivenName()).isEqualTo("Tomasz");
        assertThat(p2.getCachedSurname()).isEqualTo("Nowak");
        assertThat(p2.getSex()).isEqualTo(PersonSex.FEMALE);

        List<PersonName> updatedNames = personNameRepository.findAll();
        assertThat(updatedNames).hasSize(1);
        PersonName updatedName = updatedNames.getFirst();
        assertThat(updatedName.getPerson().getId()).isEqualTo(p2.getId());
        assertThat(updatedName.getType()).isEqualTo(EventType.BIRTH.name());
        assertThat(updatedName.getGivenName()).isEqualTo("Tomasz");
        assertThat(updatedName.getSurname()).isEqualTo("Nowak");
        assertThat(updatedName.getIsCurrent()).isTrue();

        List<Event> events = eventRepository.findAll();
        assertThat(events).hasSize(3);

        // Birth Event
        Event birth = p2.getBirthEvent();
        assertThat(birth).isNotNull();
        assertThat(birth.getCachedStartSortDateTime())
                .hasYear(1925)
                .hasMonth(Month.of(3))
                .hasDayOfMonth(15);
        assertThat(birth.getCachedEndSortDateTime()).isNull();
        assertThat(birth.getStartDate()).isNotNull();
        assertThat(birth.getStartDate().getStartYear()).isEqualTo(1925);
        assertThat(birth.getStartDate().getStartMonth()).isEqualTo(3);
        assertThat(birth.getStartDate().getStartDay()).isEqualTo(15);
        assertThat(birth.getEndDate()).isNull();
        assertThat(birth.getMainLocation().getName()).isEqualTo("Gdańsk");

        List<EventLocation> birthLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(birth.getId()))
                .toList();
        assertThat(birthLocs).hasSize(1);
        assertThat(birthLocs.getFirst().getLocation().getName()).isEqualTo("Gdańsk");


        List<EventParticipant> birthParticipants = birth.getParticipants().stream().toList();
        assertThat(birthParticipants.getFirst().getRole().getParticipantRole().getCode())
                .isEqualTo(EventParticipantRole.PRINCIPAL.name());


        // Death Event
        Event death = p2.getDeathEvent();
        assertThat(death).isNotNull();
        assertThat(death.getEventType().getCode()).isEqualTo(EventType.DEATH.name());
        assertThat(death.getCachedStartSortDateTime()).hasYear(2000);
        assertThat(death.getCachedEndSortDateTime()).isNull();
        assertThat(death.getStartDate()).isNotNull();
        assertThat(death.getStartDate().getStartYear()).isEqualTo(2000);
        assertThat(death.getStartDate().getStartMonth()).isNull();
        assertThat(death.getStartDate().getStartDay()).isNull();
        assertThat(death.getEndDate()).isNull();
        assertThat(death.getMainLocation().getName()).isEqualTo("Sopot");

        List<EventLocation> deathLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(death.getId()))
                .toList();
        assertThat(deathLocs).hasSize(1);
        assertThat(deathLocs.getFirst().getLocation().getName()).isEqualTo("Sopot");

        List<EventParticipant> deathParticipants = death.getParticipants().stream().toList();
        assertThat(deathParticipants.getFirst().getRole().getParticipantRole().getCode())
                .isEqualTo(EventParticipantRole.PRINCIPAL.name());

        List<EventAttributeValue> deathAttrs = eventAttrRepository.findAll().stream()
                .filter(eav -> eav.getEvent().getId().equals(death.getId()))
                .toList();
        assertThat(deathAttrs).hasSize(1);
        AttributeDictionaryValue attrVal = deathAttrs.getFirst().getAttributeDictionaryValue();
        assertThat(attrVal.getCode()).isEqualTo("Wypadek");
        assertThat(attrVal.getAttributeDefinition().getCode())
                .isEqualTo(DeathEventAttributeDefinition.CAUSE_OF_DEATH.name());


        // Burial Event
        List<Burial> burials = burialRepository.findAll();
        assertThat(burials).hasSize(1);
        Burial burialRecord = burials.getFirst();

        Event burialEvent = burialRecord.getBurialEvent();
        assertThat(burialEvent).isNotNull();
        assertThat(burialEvent.getEventType().getCode()).isEqualTo(EventType.BURIAL.name());
        assertThat(burialEvent.getCachedStartSortDateTime()).isNull();
        assertThat(burialEvent.getCachedEndSortDateTime()).isNull();
        assertThat(burialEvent.getStartDate()).isNull();
        assertThat(burialEvent.getEndDate()).isNull();
        assertThat(burialEvent.getMainLocation().getName()).isEqualTo("Cmentarz Nowy w Warszawie");

        assertThat(burialRecord.getGrave()).isNotNull();
        assertThat(burialRecord.getGrave().getCemeteryLocation().getName())
                .isEqualTo("Cmentarz Nowy w Warszawie");
        assertThat(burialRecord.getPerson().getId()).isEqualTo(p2.getId());
        assertThat(burialRecord.getIsCurrent()).isTrue();

        List<EventLocation> burialLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(burialEvent.getId()))
                .toList();
        assertThat(burialLocs).hasSize(1);
        assertThat(burialLocs.getFirst().getLocation().getName()).isEqualTo("Cmentarz Nowy w Warszawie");

        List<EventParticipant> burialParticipants = burialEvent.getParticipants().stream().toList();
        assertThat(burialParticipants.getFirst().getRole().getParticipantRole().getCode())
                .isEqualTo(EventParticipantRole.PRINCIPAL.name());

        // Old locations no longer referenced should be removed
        assertThat(locationRepository.findByName("Warszawa, Polska")).isEmpty();
        assertThat(locationRepository.findByName("Kraków, Polska")).isEmpty();
        assertThat(locationRepository.findByName("Cmentarz Rakowicki, Kraków")).isEmpty();

        // New locations exist
        assertThat(locationRepository.findByName("Gdańsk")).isPresent();
        assertThat(locationRepository.findByName("Sopot")).isPresent();
        assertThat(locationRepository.findByName("Cmentarz Nowy w Warszawie")).isPresent();
    }

    @Test
    @Transactional
    void shouldUpdateFamilyFieldsOnSecondImport() throws Exception {
        // GIVEN - first import: F1 has a wedding in Warsaw, status MARRIED, wife Lucy, child Mark
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID aaa-111
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID bbb-222
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID ccc-333
            1 NAME Mark /Smith/
            1 FAMC @F1@
            0 @I4@ INDI
            1 _UID ddd-444
            1 NAME Anna /Smith/
            1 FAMC @F1@
            0 @F1@ FAM
            1 _UID fam-uid-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 CHIL @I4@
            1 MARR
            2 DATE 10 JUN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        ByteArrayInputStream streamV1 = new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV1);

        entityManager.flush();
        entityManager.clear();

        // Status verification after the first import
        Family famBefore = familyRepository.findByGedcomDataGedUid("fam-uid-001").orElseThrow();
        LocalDateTime firstImportedAt = famBefore.getGedcomData().getLastImportedAt();
        assertThat(famBefore.getWife().getCachedGivenName()).isEqualTo("Lucy");
        assertThat(famBefore.getGedcomData().getRawWeddingDate()).isEqualTo("10 JUN 1950");
        assertThat(famBefore.getGedcomData().getRawWeddingPlace()).isEqualTo("Warszawa");
        assertThat(famBefore.getChildren()).hasSize(2);

        Thread.sleep(100);

        // WHEN - second import: same family (_UID matches), but different data
        // - changed date and place of marriage
        // - removed wife Lucy (now family without wife)
        // - removed child Anna, only Mark remains
        // - added DIV (divorce)
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID aaa-111
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID bbb-222
            1 NAME Lucy /Johnson/
            1 SEX F
            0 @I3@ INDI
            1 _UID ccc-333
            1 NAME Mark /Smith/
            1 FAMC @F1@
            0 @F1@ FAM
            1 _UID fam-uid-001
            1 HUSB @I1@
            1 CHIL @I3@
            1 MARR
            2 DATE 5 MAR 1952
            2 PLAC Kraków
            1 DIV
            0 TRLR
            """;

        ByteArrayInputStream streamV2 = new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV2);

        entityManager.flush();
        entityManager.clear();

        // THEN
        List<Family> families = familyRepository.findAll();
        assertThat(families).hasSize(1);

        Family famAfter = familyRepository.findByGedcomDataGedUid("fam-uid-001").orElseThrow();

        // The record ID has not changed (same object, not new)
        assertThat(famAfter.getId()).isEqualTo(famBefore.getId());

        // My husband remained the same
        assertThat(famAfter.getHusband()).isNotNull();
        assertThat(famAfter.getHusband().getCachedGivenName()).isEqualTo("John");

        // The wife was removed from the family
        assertThat(famAfter.getWife()).isNull();

        // Status updated to DIVORCED
        assertThat(famAfter.getStatus().getCode()).isEqualTo(FamilyStatus.DIVORCED.name());

        // Wedding – updated date and location
        assertThat(famAfter.getPrimaryWedding()).isNotNull();
        Event updatedWedding = famAfter.getPrimaryWedding();
        assertThat(updatedWedding.getStartDate().getStartYear()).isEqualTo(1952);
        assertThat(updatedWedding.getStartDate().getStartMonth()).isEqualTo(3);
        assertThat(updatedWedding.getStartDate().getStartDay()).isEqualTo(5);
        assertThat(updatedWedding.getMainLocation().getName()).isEqualTo("Kraków");

        // Children – only Mark, Anna has been removed
        assertThat(famAfter.getChildren()).hasSize(1);
        assertThat(famAfter.getChildren().iterator().next().getChild().getCachedGivenName()).isEqualTo("Mark");

        // Raw data updated
        FamilyGedcomData gdAfter = famAfter.getGedcomData();
        assertThat(gdAfter.getGedUid()).isEqualTo("fam-uid-001");
        assertThat(gdAfter.getRawWifeRefId()).isNull();
        assertThat(gdAfter.getRawWeddingDate()).isEqualTo("5 MAR 1952");
        assertThat(gdAfter.getRawWeddingPlace()).isEqualTo("Kraków");
        assertThat(gdAfter.getRawStatus()).isEqualTo(FamilyStatus.DIVORCED.name());
        assertThat(gdAfter.getLastImportedAt()).isAfter(firstImportedAt);
        assertThat(gdAfter.getChildren()).hasSize(1);
        assertThat(gdAfter.getChildren().iterator().next().getRawChildRefId()).isEqualTo("@I3@");
    }


    @Test
    @Transactional
    void shouldDeletePersonsAbsentFromSecondImport() throws Exception {
        // GIVEN - import of three persons
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID person-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1 JAN 1900
            2 PLAC Warszawa
            0 @I2@ INDI
            1 _UID person-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            0 @I3@ INDI
            1 _UID person-uid-003
            1 NAME Piotr /Wiśniewski/
            1 SEX M
            0 TRLR
            """;

        ByteArrayInputStream streamV1 = new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV1);

        entityManager.flush();
        entityManager.clear();

        assertThat(personRepository.findAll()).hasSize(3);
        Person jan = personRepository.findByGedcomDataGedUid("person-uid-001").orElseThrow();
        Long janId = jan.getId();

        Thread.sleep(100);

        // WHEN - the second import contains only I1 and I2 (Peter was removed)
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID person-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1 JAN 1900
            2 PLAC Warszawa
            0 @I2@ INDI
            1 _UID person-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            0 TRLR
            """;

        ByteArrayInputStream streamV2 = new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV2);
        entityManager.flush();
        entityManager.clear();

        // // THEN - only 2 people in the database, Piotr removed
        List<Person> remaining = personRepository.findAll();
        assertThat(remaining).hasSize(2);
        assertThat(remaining)
                .extracting(Person::getCachedGivenName)
                .containsExactlyInAnyOrder("Jan", "Anna");
        assertThat(personRepository.findByGedcomDataGedUid("person-uid-003")).isEmpty();

        // Jan and Anna still exist with correct data
        assertThat(personRepository.findByGedcomDataGedUid("person-uid-001")).isPresent();
        Person janAfter = personRepository.findByGedcomDataGedUid("person-uid-001").orElseThrow();
        assertThat(janAfter.getId()).isEqualTo(janId); // the same record
        assertThat(janAfter.getBirthEvent()).isNotNull();
        assertThat(janAfter.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa");
    }


    @Test
    @Transactional
    void shouldDeleteFamiliesAbsentFromSecondImport() throws Exception {
        // GIVEN - import of two families, both with wedding events
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID p-uid-01
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID p-uid-02
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID p-uid-03
            1 NAME Karol /Nowak/
            1 SEX M
            1 FAMS @F2@
            0 @F1@ FAM
            1 _UID fam-del-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            2 DATE 1 JAN 1960
            2 PLAC Gdańsk
            0 @F2@ FAM
            1 _UID fam-del-002
            1 HUSB @I3@
            1 MARR
            2 DATE 5 MAY 1970
            2 PLAC Poznań
            0 TRLR
            """;

        ByteArrayInputStream streamV1 = new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV1);
        entityManager.flush();
        entityManager.clear();

        assertThat(familyRepository.findAll()).hasSize(2);
        assertThat(eventRepository.findAll()).hasSize(2); // two wedding events
        assertThat(eventLocationRepository.findAll()).hasSize(2);

        Family fam1Before = familyRepository.findByGedcomDataGedUid("fam-del-001").orElseThrow();
        Family fam2Before = familyRepository.findByGedcomDataGedUid("fam-del-002").orElseThrow();
        Long fam1Id = fam1Before.getId();
        Long weddingF1EventId = fam1Before.getPrimaryWedding().getId();
        Long weddingF2EventId = fam2Before.getPrimaryWedding().getId();

        Thread.sleep(100);

        // WHEN - second import: only F1 remains (F2 has disappeared), all people remain
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID p-uid-01
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID p-uid-02
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID p-uid-03
            1 NAME Karol /Nowak/
            1 SEX M
            0 @F1@ FAM
            1 _UID fam-del-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            2 DATE 1 JAN 1960
            2 PLAC Gdańsk
            0 TRLR
            """;

        ByteArrayInputStream streamV2 = new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8));
        importService.importGedcom(streamV2);
        entityManager.flush();
        entityManager.clear();

        // THEN - only 1 family in the database, F2 removed
        assertThat(familyRepository.findAll()).hasSize(1);
        assertThat(familyRepository.findByGedcomDataGedUid("fam-del-002")).isEmpty();

        // F1 still exists unchanged
        Family fam1After = familyRepository.findByGedcomDataGedUid("fam-del-001").orElseThrow();
        assertThat(fam1After.getId()).isEqualTo(fam1Id);
        assertThat(fam1After.getPrimaryWedding().getId()).isEqualTo(weddingF1EventId);

        // Wedding event of F1 NOT deleted
        assertThat(eventRepository.findById(weddingF1EventId)).isPresent();

        // Wedding event of deleted F2 IS deleted (cascade)
        assertThat(eventRepository.findById(weddingF2EventId)).isEmpty();

        // EventLocation and EventParticipants of F2 wedding also cleaned up
        assertThat(eventLocationRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll().getFirst().getLocation().getName())
                .isEqualTo("Gdańsk");
        assertThat(eventParticipantRepository.findAll().stream()
                .anyMatch(ep -> ep.getEvent().getId().equals(weddingF2EventId))).isFalse();

        // Location "Poznań" no longer used – should be removed
        assertThat(locationRepository.findByName("Poznań")).isEmpty();

        // All 3 people still exist (deleting a family does not delete people)
        assertThat(personRepository.findAll()).hasSize(3);
        assertThat(personRepository.findByGedcomDataGedUid("p-uid-03")).isPresent();
    }


    @Test
    @Transactional
    void shouldProduceIdenticalStateWhenImportedTwice() throws Exception {
        // GIVEN
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID idm-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            2 CAUS Zawał serca
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 @I2@ INDI
            1 _UID idm-uid-002
            1 NAME Anna /Kowalska/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID idm-uid-003
            1 NAME Piotr /Kowalski/
            1 SEX M
            1 FAMC @F1@
            0 @F1@ FAM
            1 _UID idm-fam-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 MARR
            2 DATE 5 MAR 1950
            2 PLAC Gdańsk
            0 TRLR
            """;

        // WHEN - two identical imports
        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - the number of records is the same as after a single import
        assertThat(personRepository.findAll()).hasSize(3);
        assertThat(familyRepository.findAll()).hasSize(1);
        assertThat(eventRepository.findAll()).hasSize(4); // birth, death, burial, wedding
        assertThat(burialRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll()).hasSize(4); // birth, death, burial, wedding
        assertThat(personNameRepository.findAll()).hasSize(3);

        // Data is correct after double import
        Person jan = personRepository.findByGedcomDataGedUid("idm-uid-001").orElseThrow();
        assertThat(jan.getCachedGivenName()).isEqualTo("Jan");
        assertThat(jan.getBirthEvent()).isNotNull();
        assertThat(jan.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa");
        assertThat(jan.getDeathEvent()).isNotNull();
        assertThat(jan.getBirthEvent().getParticipants()).hasSize(1);
        assertThat(jan.getDeathEvent().getParticipants()).hasSize(1);

        Family fam = familyRepository.findByGedcomDataGedUid("idm-fam-001").orElseThrow();
        assertThat(fam.getPrimaryWedding()).isNotNull();
        assertThat(fam.getPrimaryWedding().getParticipants()).hasSize(2);
        assertThat(fam.getChildren()).hasSize(1);
        assertThat(fam.getChildren().iterator().next().getChild().getCachedGivenName())
                .isEqualTo("Piotr");

        // Locations are not duplicated
        assertThat(locationRepository.findAll())
                .extracting(Location::getName)
                .containsExactlyInAnyOrder("Warszawa", "Kraków", "Cmentarz Rakowicki, Kraków", "Gdańsk");
    }


    @Test
    @Transactional
    void shouldShareLocationRecordsAcrossMultipleEvents() throws Exception {
        // GIVEN - two people born in the same place + wedding also there
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID loc-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1 JAN 1900
            2 PLAC Warszawa
            1 DEAT
            2 DATE 1 JAN 1980
            2 PLAC Warszawa
            0 @I2@ INDI
            1 _UID loc-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 1 MAR 1905
            2 PLAC Warszawa
            0 @F1@ FAM
            1 _UID loc-fam-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            2 DATE 5 JUN 1925
            2 PLAC Warszawa
            0 TRLR
            """;

        // WHEN
        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - even though 'Warszawa' appears in 4 events,
        // there is exactly one record in the locations table
        List<Location> locations = locationRepository.findAll();
        assertThat(locations)
                .extracting(Location::getName)
                .containsExactly("Warszawa");
        assertThat(locations).hasSize(1);
        Long warsawId = locations.getFirst().getId();

        // All 4 events point to the same record Location
        List<EventLocation> eventLocations = eventLocationRepository.findAll();
        assertThat(eventLocations).hasSize(4);
        assertThat(eventLocations)
                .extracting(el -> el.getLocation().getId())
                .containsOnly(warsawId);

        // All events have a mainLocation pointing to the same record
        Person jan = personRepository.findByGedcomDataGedUid("loc-uid-001").orElseThrow();
        Person anna = personRepository.findByGedcomDataGedUid("loc-uid-002").orElseThrow();
        Family fam = familyRepository.findByGedcomDataGedUid("loc-fam-001").orElseThrow();

        assertThat(jan.getBirthEvent().getMainLocation().getId()).isEqualTo(warsawId);
        assertThat(jan.getDeathEvent().getMainLocation().getId()).isEqualTo(warsawId);
        assertThat(anna.getBirthEvent().getMainLocation().getId()).isEqualTo(warsawId);
        assertThat(fam.getPrimaryWedding().getMainLocation().getId()).isEqualTo(warsawId);
    }


    @Test
    @Transactional
    void shouldUpdateChildRelationshipTypeOnSecondImport() throws Exception {
        // GIVEN - Mark is a biological child
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID rel-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID rel-uid-002
            1 NAME Mark /Smith/
            1 SEX M
            1 FAMC @F1@
            0 @F1@ FAM
            1 _UID rel-fam-001
            1 HUSB @I1@
            1 CHIL @I2@
            1 MARR
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Family famBefore = familyRepository.findByGedcomDataGedUid("rel-fam-001").orElseThrow();
        FamilyChild markBefore = famBefore.getChildren().iterator().next();
        assertThat(markBefore.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);
        assertThat(markBefore.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);
        Long markChildRelId = markBefore.getId();

        // WHEN - Mark gets adopted
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID rel-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID rel-uid-002
            1 NAME Mark /Smith/
            1 SEX M
            1 FAMC @F1@
            2 PEDI Adopted
            0 @F1@ FAM
            1 _UID rel-fam-001
            1 HUSB @I1@
            1 CHIL @I2@
            1 MARR
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN
        Family famAfter = familyRepository.findByGedcomDataGedUid("rel-fam-001").orElseThrow();
        assertThat(famAfter.getChildren()).hasSize(1);

        FamilyChild markAfter = famAfter.getChildren().iterator().next();

        // Relationship updated to ADOPTED for both parents
        assertThat(markAfter.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);
        assertThat(markAfter.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        // Raw data also updated
        FamilyChildGedcomData rawChild = famAfter.getGedcomData().getChildren().iterator().next();
        assertThat(rawChild.getRawChildRefId()).isEqualTo("@I2@");
        assertThat(rawChild.getRawPedigree()).isEqualToIgnoringCase("Adopted");

        // No new FamilyChild record was created – same ID
        assertThat(markAfter.getId()).isEqualTo(markChildRelId);
    }


    @Test
    @Transactional
    void shouldDeleteBirthEventWhenRemovedFromSecondImport() throws Exception {
        // GIVEN - a person with a birth and death
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID evt-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Person janBefore = personRepository.findByGedcomDataGedUid("evt-uid-001").orElseThrow();
        assertThat(janBefore.getBirthEvent()).isNotNull();
        assertThat(janBefore.getDeathEvent()).isNotNull();
        Long birthEventId = janBefore.getBirthEvent().getId();
        Long deathEventId = janBefore.getDeathEvent().getId();
        assertThat(eventRepository.findAll()).hasSize(2);
        assertThat(eventLocationRepository.findAll()).hasSize(2);

        // WHEN - second import: no BIRT, only DEAT remains
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID evt-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - birth event deleted
        assertThat(eventRepository.findById(birthEventId)).isEmpty();
        assertThat(eventRepository.findById(deathEventId)).isPresent();
        assertThat(eventRepository.findAll()).hasSize(1);

        // EventLocation for birth also removed
        assertThat(eventLocationRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll().getFirst().getLocation().getName())
                .isEqualTo("Kraków");

        // The person still exists, but without a birthEvent
        Person janAfter = personRepository.findByGedcomDataGedUid("evt-uid-001").orElseThrow();
        assertThat(janAfter.getBirthEvent()).isNull();
        assertThat(janAfter.getDeathEvent()).isNotNull();
        assertThat(janAfter.getGedcomData().getRawBirthDate()).isNull();
        assertThat(janAfter.getGedcomData().getRawBirthPlace()).isNull();

        // EventParticipant for the deleted birth event also removed
        boolean anyParticipantForDeletedBirth = eventParticipantRepository.findAll().stream()
                .anyMatch(ep -> ep.getEvent().getId().equals(birthEventId));
        assertThat(anyParticipantForDeletedBirth).isFalse();

        // EventParticipant for the remaining death event still exists
        boolean participantForDeathExists = eventParticipantRepository.findAll().stream()
                .anyMatch(ep -> ep.getEvent().getId().equals(deathEventId));
        assertThat(participantForDeathExists).isTrue();
    }


    @Test
    @Transactional
    void shouldDeleteWeddingEventWhenRemovedFromSecondImport() throws Exception {
        // GIVEN - family with wedding
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID wevt-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID wevt-uid-002
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID wevt-fam-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            2 DATE 5 JUN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Family famBefore = familyRepository.findByGedcomDataGedUid("wevt-fam-001").orElseThrow();
        assertThat(famBefore.getPrimaryWedding()).isNotNull();
        Long weddingEventId = famBefore.getPrimaryWedding().getId();
        assertThat(eventRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll()).hasSize(1);

        // WHEN - second import: MARR tag without date and place (no event to save)
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID wevt-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID wevt-uid-002
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID wevt-fam-001
            1 HUSB @I1@
            1 WIFE @I2@
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - wedding event deleted
        assertThat(eventRepository.findById(weddingEventId)).isEmpty();
        assertThat(eventRepository.findAll()).isEmpty();
        assertThat(eventLocationRepository.findAll()).isEmpty();

        // The family still exists, but without primaryWedding
        Family famAfter = familyRepository.findByGedcomDataGedUid("wevt-fam-001").orElseThrow();
        assertThat(famAfter.getPrimaryWedding()).isNull();
        assertThat(famAfter.getGedcomData().getRawWeddingDate()).isNull();
        assertThat(famAfter.getGedcomData().getRawWeddingPlace()).isNull();
        // Status changed to UNKNOWN (no MARR tag)
        assertThat(famAfter.getStatus().getCode()).isEqualTo(FamilyStatus.UNKNOWN.name());
    }


    @Test
    @Transactional
    void shouldNullifyFamilySpouseWhenPersonDeletedInSecondImport() throws Exception {
        // GIVEN - a family with a husband and wife
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID del-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID del-uid-002
            1 NAME Lucy /Johnson/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID del-uid-003
            1 NAME Mark /Smith/
            1 SEX M
            1 FAMC @F1@
            0 @F1@ FAM
            1 _UID del-fam-001
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(personRepository.findAll()).hasSize(3);
        assertThat(familyRepository.findAll()).hasSize(1);

        // WHEN - second import: Lucy and Mark have disappeared, John and his family remain
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID del-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID del-fam-001
            1 HUSB @I1@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - Lucy and Mark removed from the database
        assertThat(personRepository.findAll()).hasSize(1);
        assertThat(personRepository.findByGedcomDataGedUid("del-uid-002")).isEmpty();
        assertThat(personRepository.findByGedcomDataGedUid("del-uid-003")).isEmpty();

        // The family still exists (John is in the file)
        assertThat(familyRepository.findAll()).hasSize(1);
        Family famAfter = familyRepository.findByGedcomDataGedUid("del-fam-001").orElseThrow();

        // John is still the husband
        assertThat(famAfter.getHusband()).isNotNull();
        assertThat(famAfter.getHusband().getCachedGivenName()).isEqualTo("John");

        // Lucy (wife) removed – the wife field is null
        assertThat(famAfter.getWife()).isNull();

        // Mark (child) removed – children list empty
        assertThat(famAfter.getChildren()).isEmpty();

        // The marriage still exists (John is still in the family)
        assertThat(famAfter.getPrimaryWedding()).isNotNull();
        assertThat(famAfter.getPrimaryWedding().getMainLocation().getName()).isEqualTo("Warszawa");

        // Wedding participants: Lucy removed from event_participants
        assertThat(famAfter.getPrimaryWedding().getParticipants()).hasSize(1);
        assertThat(famAfter.getPrimaryWedding().getParticipants().iterator().next()
                .getPerson().getCachedGivenName()).isEqualTo("John");
    }


    @Test
    @Transactional
    void shouldImportPersonWithNoEventsWithoutErrors() throws Exception {
        // GIVEN - a person with only a name and gender, without any events
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID min-uid-001
            1 NAME Anna /Kowalska/
            1 SEX F
            0 TRLR
            """;

        // WHEN
        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN
        List<Person> persons = personRepository.findAll();
        assertThat(persons).hasSize(1);
        Person anna = persons.getFirst();

        assertThat(anna.getCachedGivenName()).isEqualTo("Anna");
        assertThat(anna.getCachedSurname()).isEqualTo("Kowalska");
        assertThat(anna.getSex()).isEqualTo(PersonSex.FEMALE);
        assertThat(anna.getLifeState()).isEqualTo(LifeState.UNKNOWN);
        assertThat(anna.getBirthEvent()).isNull();
        assertThat(anna.getDeathEvent()).isNull();
        assertThat(anna.getGedcomData().getRawBirthDate()).isNull();
        assertThat(anna.getGedcomData().getRawDeathDate()).isNull();

        assertThat(eventRepository.findAll()).isEmpty();
        assertThat(eventLocationRepository.findAll()).isEmpty();
        assertThat(burialRepository.findAll()).isEmpty();
    }


    @Test
    @Transactional
    void shouldGracefullyHandleFamilyWithMissingPersonReference() throws Exception {
        // GIVEN - F1 refers to @I99@, which is not in the file
        String gedcomContent = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID missing-uid-001
            1 NAME John /Smith/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID missing-fam-001
            1 HUSB @I1@
            1 WIFE @I99@
            1 CHIL @I98@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        // WHEN - import should not throw an exception
        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN - import successful, John and family saved
        assertThat(personRepository.findAll()).hasSize(1);
        assertThat(familyRepository.findAll()).hasSize(1);

        Family fam = familyRepository.findByGedcomDataGedUid("missing-fam-001").orElseThrow();
        assertThat(fam.getHusband()).isNotNull();
        assertThat(fam.getHusband().getCachedGivenName()).isEqualTo("John");

        // Non-existent references are ignored – wife and children are empty
        assertThat(fam.getWife()).isNull();
        assertThat(fam.getChildren()).isEmpty();

        // Raw data contains original references from the file
        assertThat(fam.getGedcomData().getRawWifeRefId()).isEqualTo("@I99@");
        assertThat(fam.getGedcomData().getChildren()).isEmpty();

        // Wedding recorded despite missing persons
        assertThat(fam.getPrimaryWedding()).isNotNull();
        assertThat(fam.getPrimaryWedding().getMainLocation().getName()).isEqualTo("Warszawa");
        // Wedding participant: only John (I99 does not exist)
        assertThat(fam.getPrimaryWedding().getParticipants()).hasSize(1);
    }


    @Test
    @Transactional
    void shouldDeleteEventLocationWhenPlaceRemovedOnSecondImport() throws Exception {
        // GIVEN
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID evtloc-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(eventLocationRepository.findAll()).hasSize(2);
        assertThat(locationRepository.findAll())
                .extracting(Location::getName)
                .containsExactlyInAnyOrder("Warszawa", "Kraków");

        // WHEN - second import: BIRT without location, DEAT without location
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID evtloc-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            1 DEAT
            2 DATE 15 FEB 1990
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN – both EventLocation records deleted
        assertThat(eventLocationRepository.findAll()).isEmpty();

        // Events still exist, just without a location
        Person janAfter = personRepository.findByGedcomDataGedUid("evtloc-uid-001").orElseThrow();
        assertThat(janAfter.getBirthEvent()).isNotNull();
        assertThat(janAfter.getBirthEvent().getMainLocation()).isNull();
        assertThat(janAfter.getDeathEvent()).isNotNull();
        assertThat(janAfter.getDeathEvent().getMainLocation()).isNull();
    }


    @Test
    @Transactional
    void shouldDeleteOrphanGraveWhenBurialPlaceChangedOnSecondImport() throws Exception {
        // GIVEN
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID grave-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        List<Burial> burialsAfterV1 = burialRepository.findAll();
        assertThat(burialsAfterV1).hasSize(1);
        Long oldGraveId = burialsAfterV1.getFirst().getGrave().getId();
        assertThat(burialsAfterV1.getFirst().getGrave().getCemeteryLocation().getName())
                .isEqualTo("Cmentarz Rakowicki, Kraków");

        // WHEN - new burial site
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID grave-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BURI
            2 PLAC Cmentarz Powązkowski, Warszawa
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN – old Grave removed, new one in a new location
        assertThat(graveRepository.findAll()).hasSize(1);
        assertThat(graveRepository.findById(oldGraveId)).isEmpty();

        List<Burial> burialsAfterV2 = burialRepository.findAll();
        assertThat(burialsAfterV2).hasSize(1);
        assertThat(burialsAfterV2.getFirst().getGrave().getCemeteryLocation().getName())
                .isEqualTo("Cmentarz Powązkowski, Warszawa");

        // Old Burial deleted (only one record)
        assertThat(burialsAfterV2.getFirst().getGrave().getId()).isNotEqualTo(oldGraveId);
    }


    @Test
    @Transactional
    void shouldDeleteLocationWhenNoLongerReferencedByAnyEvent() throws Exception {
        // GIVEN – Jan born in Warsaw, Anna born in Krakow
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID orphloc-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1 JAN 1900
            2 PLAC Warszawa
            0 @I2@ INDI
            1 _UID orphloc-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 1 JAN 1905
            2 PLAC Kraków
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(locationRepository.findAll())
                .extracting(Location::getName)
                .containsExactlyInAnyOrder("Warszawa", "Kraków");

        // WHEN - second import: Anna disappeared, Krakow is no longer used anywhere
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID orphloc-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1 JAN 1900
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN – Krakow removed (nothing points to it anymore), Warsaw remains
        assertThat(locationRepository.findAll()).hasSize(1);
        assertThat(locationRepository.findAll().getFirst().getName()).isEqualTo("Warszawa");
        assertThat(locationRepository.findByName("Kraków")).isEmpty();

        // EventLocation for Anna also deleted
        assertThat(eventLocationRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll().getFirst().getLocation().getName())
                .isEqualTo("Warszawa");
    }


    @Test
    @Transactional
    void shouldDeleteOrphanAttributeDictionaryValueWhenNoLongerUsed() throws Exception {
        // GIVEN – person with cause of death
        String gedcomV1 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID attrval-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            2 CAUS Zawał serca
            0 @I2@ INDI
            1 _UID attrval-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            1 DEAT
            2 DATE 1 JAN 2000
            2 PLAC Warszawa
            2 CAUS Wypadek
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(attrDictValueRepository.findAll())
                .extracting(AttributeDictionaryValue::getCode)
                .containsExactlyInAnyOrder("Zawał serca", "Wypadek");
        assertThat(eventAttrRepository.findAll()).hasSize(2);

        // WHEN - second import: Jan without cause of death, 'Zawał serca' is no longer
        // used by any event. 'Wypadek' still used by Anna.
        String gedcomV2 = """
            0 HEAD
            1 SOUR Test
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID attrval-uid-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            0 @I2@ INDI
            1 _UID attrval-uid-002
            1 NAME Anna /Nowak/
            1 SEX F
            1 DEAT
            2 DATE 1 JAN 2000
            2 PLAC Warszawa
            2 CAUS Wypadek
            0 TRLR
            """;

        importService.importGedcom(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN – "Zawał serca"  removed (no one uses it anymore)
        assertThat(attrDictValueRepository.findAll()).hasSize(1);
        assertThat(attrDictValueRepository.findAll().getFirst().getCode()).isEqualTo("Wypadek");

        // EventAttributeValue for Jan deleted
        assertThat(eventAttrRepository.findAll()).hasSize(1);

        // Verification on the event side
        Person jan = personRepository.findByGedcomDataGedUid("attrval-uid-001").orElseThrow();
        Person anna = personRepository.findByGedcomDataGedUid("attrval-uid-002").orElseThrow();

        List<EventAttributeValue> janAttrs = eventAttrRepository.findAll().stream()
                .filter(eav -> eav.getEvent().getId().equals(jan.getDeathEvent().getId()))
                .toList();
        assertThat(janAttrs).isEmpty();
        assertThat(jan.getGedcomData().getRawCauseOfDeath()).isNull();

        List<EventAttributeValue> annaAttrs = eventAttrRepository.findAll().stream()
                .filter(eav -> eav.getEvent().getId().equals(anna.getDeathEvent().getId()))
                .toList();
        assertThat(annaAttrs).hasSize(1);
        assertThat(annaAttrs.getFirst().getAttributeDictionaryValue().getCode()).isEqualTo("Wypadek");
    }


    @Test
    @Transactional
    void shouldCorrectlyMapAllMyHeritageFamilyStatusTypes() throws Exception {
        // GIVEN
        String gedcomContent = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID st-p-01
            1 NAME Adam /Kowalski/
            1 SEX M
            1 FAMS @FS1@
            0 @I2@ INDI
            1 _UID st-p-02
            1 NAME Adam /Nowak/
            1 SEX M
            1 FAMS @FS2@
            0 @I3@ INDI
            1 _UID st-p-03
            1 NAME Adam /Wiśniewski/
            1 SEX M
            1 FAMS @FS3@
            0 @I4@ INDI
            1 _UID st-p-04
            1 NAME Adam /Wójcik/
            1 SEX M
            1 FAMS @FS4@
            0 @I5@ INDI
            1 _UID st-p-05
            1 NAME Adam /Kaminski/
            1 SEX M
            1 FAMS @FS5@
            0 @I6@ INDI
            1 _UID st-p-06
            1 NAME Adam /Lewandowski/
            1 SEX M
            1 FAMS @FS6@
            0 @I7@ INDI
            1 _UID st-p-07
            1 NAME Adam /Zielinski/
            1 SEX M
            1 FAMS @FS7@
            0 @I8@ INDI
            1 _UID st-p-08
            1 NAME Adam /Szymanski/
            1 SEX M
            1 FAMS @FS8@
            0 @I9@ INDI
            1 _UID st-p-09
            1 NAME Adam /Woźniak/
            1 SEX M
            1 FAMS @FS9@
            0 @I10@ INDI
            1 _UID st-p-10
            1 NAME Adam /Dąbrowski/
            1 SEX M
            1 FAMS @FS10@
            0 @FS1@ FAM
            1 _UID st-fam-married
            1 HUSB @I1@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            0 @FS2@ FAM
            1 _UID st-fam-divorced
            1 HUSB @I2@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            1 DIV
            0 @FS3@ FAM
            1 _UID st-fam-separated
            1 HUSB @I3@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            1 EVEN
            2 TYPE Separation
            0 @FS4@ FAM
            1 _UID st-fam-widowed
            1 HUSB @I4@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            1 EVEN
            2 TYPE Death of Spouse
            0 @FS5@ FAM
            1 _UID st-fam-engaged
            1 HUSB @I5@
            1 ENGA
            0 @FS6@ FAM
            1 _UID st-fam-partners
            1 HUSB @I6@
            1 EVEN
            2 TYPE MYHERITAGE:REL_PARTNERS
            0 @FS7@ FAM
            1 _UID st-fam-friends
            1 HUSB @I7@
            1 EVEN
            2 TYPE MYHERITAGE:REL_FRIENDS
            0 @FS8@ FAM
            1 _UID st-fam-annulled
            1 HUSB @I8@
            1 MARR
            2 DATE 1 JAN 1950
            2 PLAC Warszawa
            1 ANUL
            0 @FS9@ FAM
            1 _UID st-fam-unknown
            1 HUSB @I9@
            1 EVEN
            2 TYPE MYHERITAGE:REL_UNKNOWN
            0 @FS10@ FAM
            1 _UID st-fam-other
            1 HUSB @I10@
            1 EVEN
            2 TYPE MYHERITAGE:REL_OTHER
            0 TRLR
            """;

        // WHEN
        importService.importGedcom(
                new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        // THEN
        assertThat(familyRepository.findAll()).hasSize(10);

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-married").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.MARRIED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-divorced").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.DIVORCED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-separated").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.SEPARATED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-widowed").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.WIDOWED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-engaged").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.ENGAGED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-partners").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.PARTNERS.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-friends").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.FRIENDS.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-annulled").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.ANNULLED.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-unknown").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.UNKNOWN.name());

        assertThat(familyRepository.findByGedcomDataGedUid("st-fam-other").orElseThrow()
                .getStatus().getCode()).isEqualTo(FamilyStatus.OTHER.name());

        // Weryfikacja rawStatus – musi być spójny z faktycznym statusem
        assertThat(familyRepository.findAll())
                .allMatch(f -> f.getStatus().getCode().equals(f.getGedcomData().getRawStatus()));
    }
}
