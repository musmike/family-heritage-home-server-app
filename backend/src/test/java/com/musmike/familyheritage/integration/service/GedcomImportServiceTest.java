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

        // Burial Event (no location attached to BURIAL event; place_description stored on Burial)
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
        assertThat(burialEvent.getMainLocation()).isNull();

        assertThat(burialRecord.getGrave()).isNotNull();
        assertThat(burialRecord.getGrave().getCemetery()).isNull();
        assertThat(burialRecord.getPlaceDescription()).isEqualTo("Cmentarz Rakowicki, Kraków");
        assertThat(burialRecord.getPerson().getId()).isEqualTo(person.getId());
        assertThat(burialRecord.getIsCurrent()).isTrue();

        List<EventLocation> burialLocs = eventLocationRepository.findAll().stream()
                .filter(el -> el.getEvent().getId().equals(burialEvent.getId()))
                .toList();
        assertThat(burialLocs).isEmpty();

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

        Family fam1 = familyRepository.findByGedcomDataGedRefId("@F1@").orElseThrow();
        Family fam2 = familyRepository.findByGedcomDataGedRefId("@F2@").orElseThrow();
        Family fam3 = familyRepository.findByGedcomDataGedRefId("@F3@").orElseThrow();

        assertThat(fam1.getHusband().getCachedGivenName()).isEqualTo("John");
        assertThat(fam1.getWife().getCachedGivenName()).isEqualTo("Lucy");
        assertThat(fam1.getStatus().getCode()).isEqualTo(FamilyStatus.DIVORCED.name());
        assertThat(fam1.getChildren()).hasSize(2);

        FamilyChild markRel = fam1.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Mark"))
                .findFirst().orElseThrow();
        assertThat(markRel.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);

        FamilyChild karolRel = fam1.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Karol"))
                .findFirst().orElseThrow();
        assertThat(karolRel.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        Set<FamilyChildGedcomData> rawChildren1 = fam1.getGedcomData().getChildren();
        assertThat(rawChildren1).hasSize(2);

        assertThat(fam2.getStatus().getCode()).isEqualTo(FamilyStatus.PARTNERS.name());
        assertThat(fam3.getStatus().getCode()).isEqualTo(FamilyStatus.MARRIED.name());
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
        assertThat(burialRepository.findAll().getFirst().getPlaceDescription())
                .isEqualTo("Cmentarz Rakowicki, Kraków");

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

        PersonGedcomData raw = p2.getGedcomData();
        assertThat(raw.getGedRefId()).isEqualTo("@I2@");
        assertThat(raw.getRawGivenName()).isEqualTo("Tomasz");
        assertThat(raw.getRawSurname()).isEqualTo("Nowak");
        assertThat(raw.getRawBurialPlace()).isEqualTo("Cmentarz Nowy w Warszawie");
        assertThat(raw.getLastImportedAt()).isNotEqualTo(firstImportTime);

        List<Burial> burials = burialRepository.findAll();
        assertThat(burials).hasSize(1);
        Burial burialRecord = burials.getFirst();
        assertThat(burialRecord.getPlaceDescription()).isEqualTo("Cmentarz Nowy w Warszawie");
        assertThat(burialRecord.getBurialEvent().getMainLocation()).isNull();

        // Old locations no longer referenced should be removed, and burial place is not in locations
        assertThat(locationRepository.findByName("Warszawa, Polska")).isEmpty();
        assertThat(locationRepository.findByName("Kraków, Polska")).isEmpty();
        assertThat(locationRepository.findByName("Cmentarz Rakowicki, Kraków")).isEmpty();
        assertThat(locationRepository.findByName("Cmentarz Nowy w Warszawie")).isEmpty();

        assertThat(locationRepository.findByName("Gdańsk")).isPresent();
        assertThat(locationRepository.findByName("Sopot")).isPresent();
    }

    @Test
    @Transactional
    void shouldUpdateFamilyFieldsOnSecondImport() throws Exception {
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

        importService.importGedcom(new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Family famBefore = familyRepository.findByGedcomDataGedUid("fam-uid-001").orElseThrow();

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

        importService.importGedcom(new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        Family famAfter = familyRepository.findByGedcomDataGedUid("fam-uid-001").orElseThrow();
        assertThat(famAfter.getId()).isEqualTo(famBefore.getId());
        assertThat(famAfter.getWife()).isNull();
        assertThat(famAfter.getStatus().getCode()).isEqualTo(FamilyStatus.DIVORCED.name());
        assertThat(famAfter.getChildren()).hasSize(1);
    }

    @Test
    @Transactional
    void shouldDeletePersonsAbsentFromSecondImport() throws Exception {
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

        importService.importGedcom(new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

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

        importService.importGedcom(new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(personRepository.findAll()).hasSize(2);
    }

    @Test
    @Transactional
    void shouldDeleteFamiliesAbsentFromSecondImport() throws Exception {
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

        importService.importGedcom(new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

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

        importService.importGedcom(new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(familyRepository.findAll()).hasSize(1);
        assertThat(locationRepository.findByName("Poznań")).isEmpty();
    }

    @Test
    @Transactional
    void shouldProduceIdenticalStateWhenImportedTwice() throws Exception {
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

        importService.importGedcom(new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        importService.importGedcom(new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(personRepository.findAll()).hasSize(3);
        assertThat(familyRepository.findAll()).hasSize(1);
        assertThat(eventRepository.findAll()).hasSize(4);
        assertThat(burialRepository.findAll()).hasSize(1);
        assertThat(eventLocationRepository.findAll()).hasSize(3); // birth, death, wedding (burial has no location)
        assertThat(personNameRepository.findAll()).hasSize(3);

        assertThat(locationRepository.findAll())
                .extracting(Location::getName)
                .containsExactlyInAnyOrder("Warszawa", "Kraków", "Gdańsk");
    }

    @Test
    @Transactional
    void shouldPreserveGraveIdAndUpdatePlaceDescriptionWhenBurialPlaceChangedOnSecondImport() throws Exception {
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

        importService.importGedcom(new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        List<Burial> burialsAfterV1 = burialRepository.findAll();
        assertThat(burialsAfterV1).hasSize(1);
        Long originalGraveId = burialsAfterV1.getFirst().getGrave().getId();
        assertThat(burialsAfterV1.getFirst().getPlaceDescription()).isEqualTo("Cmentarz Rakowicki, Kraków");

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

        importService.importGedcom(new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        assertThat(graveRepository.findAll()).hasSize(1);
        List<Burial> burialsAfterV2 = burialRepository.findAll();
        assertThat(burialsAfterV2).hasSize(1);
        assertThat(burialsAfterV2.getFirst().getGrave().getId()).isEqualTo(originalGraveId);
        assertThat(burialsAfterV2.getFirst().getPlaceDescription()).isEqualTo("Cmentarz Powązkowski, Warszawa");
    }
}