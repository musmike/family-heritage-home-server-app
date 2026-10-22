package com.musmike.familyheritage.integration.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import com.musmike.familyheritage.service.GedcomFileExtractor;
import com.musmike.familyheritage.service.GedcomImportApplier;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GedcomImportApplierTest extends AbstractIntegrationTest {

    @Autowired private GedcomFileExtractor fileExtractor;
    @Autowired private GedcomImportApplier importApplier;
    @Autowired private PersonRepository personRepository;
    @Autowired private FamilyRepository familyRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private EventLocationRepository eventLocationRepository;
    @Autowired private UserCodeRepository userCodeRepository;
    @Autowired private EntityManager entityManager;

    @Test
    @Transactional
    void shouldPreserveUserEditedPersonAndEventFieldsWhileUpdatingRawGedcomAndUntouchedFields() throws Exception {
        // GIVEN - First import creates Jan Kowalski
        String gedcomV1 = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID uid-jan-001
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            2 CAUS Zawał serca
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV1 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV1,
                Map.of("@I1@", new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null)),
                Map.of(),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // Simulate user editing givenName and birthPlace in the application UI,
        // while leaving surname, birthDate, and deathEvent untouched
        Person jan = personRepository.findAll().getFirst();
        Long janId = jan.getId();
        jan.setCachedGivenName("Jan Maria");
        Location customLoc = locationRepository.saveAndFlush(new Location("Warszawa - Mokotów"));
        jan.getBirthEvent().setMainLocation(customLoc);
        eventLocationRepository.findByEvent(jan.getBirthEvent()).ifPresent(el -> {
            el.setLocation(customLoc);
            eventLocationRepository.saveAndFlush(el);
        });
        personRepository.saveAndFlush(jan);
        entityManager.clear();

        // WHEN - Second import brings modified values for all fields
        String gedcomV2 = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID uid-jan-001
            1 NAME Janusz /Nowak/
            1 SEX M
            1 BIRT
            2 DATE 12 MAY 1922
            2 PLAC Gdańsk
            1 DEAT
            2 DATE 20 MAR 1995
            2 PLAC Sopot
            2 CAUS Wypadek
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV2 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV2,
                Map.of("@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, janId)),
                Map.of(),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // THEN
        Person updated = personRepository.findById(janId).orElseThrow();

        // User-edited normalized fields are preserved!
        assertThat(updated.getCachedGivenName()).isEqualTo("Jan Maria");
        assertThat(updated.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa - Mokotów");

        // Untouched normalized fields ARE updated from the new GEDCOM!
        assertThat(updated.getCachedSurname()).isEqualTo("Nowak");
        assertThat(updated.getBirthEvent().getStartDate().getStartYear()).isEqualTo(1922);
        assertThat(updated.getBirthEvent().getStartDate().getStartMonth()).isEqualTo(5);
        assertThat(updated.getBirthEvent().getStartDate().getStartDay()).isEqualTo(12);
        assertThat(updated.getDeathEvent().getStartDate().getStartYear()).isEqualTo(1995);
        assertThat(updated.getDeathEvent().getMainLocation().getName()).isEqualTo("Sopot");

        // Raw GEDCOM snapshot is 100% updated with the new file's values for user preview
        PersonGedcomData raw = updated.getGedcomData();
        assertThat(raw.getRawGivenName()).isEqualTo("Janusz");
        assertThat(raw.getRawSurname()).isEqualTo("Nowak");
        assertThat(raw.getRawBirthDate()).isEqualTo("12 MAY 1922");
        assertThat(raw.getRawBirthPlace()).isEqualTo("Gdańsk");
        assertThat(raw.getRawDeathDate()).isEqualTo("20 MAR 1995");
        assertThat(raw.getRawDeathPlace()).isEqualTo("Sopot");
        assertThat(raw.getRawCauseOfDeath()).isEqualTo("Wypadek");
    }

    @Test
    @Transactional
    void shouldPreserveUserEditedFamilyFieldsWhileUpdatingRawAndUntouchedFields() throws Exception {
        // GIVEN - First import with family
        String gedcomV1 = """
            0 HEAD
            1 SOUR MYHERITAGE
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
            1 SEX M
            1 FAMC @F1@
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 MARR
            2 DATE 10 JUN 1950
            2 PLAC Warszawa
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV1 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV1,
                Map.of(
                        "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null),
                        "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.CREATE_NEW, null),
                        "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.CREATE_NEW, null)
                ),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        Person john = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow();
        Person lucy = personRepository.findByGedcomDataGedRefId("@I2@").orElseThrow();
        Person mark = personRepository.findByGedcomDataGedRefId("@I3@").orElseThrow();
        Family fam = familyRepository.findByGedcomDataGedRefId("@F1@").orElseThrow();

        // Simulate user editing family status and ONLY fatherRelationshipType in the UI,
        // while leaving motherRelationshipType, wedding date and place untouched
        UserCode separatedStatus = userCodeRepository
                .findByCategoryAndCode(CodeCategory.FAMILY_STATUS.name(), FamilyStatus.SEPARATED.name())
                .orElseThrow();
        fam.setStatus(separatedStatus);
        fam.getChildren().iterator().next().setFatherRelationshipType(FamilyChildRelationshipType.FOSTER);
        familyRepository.saveAndFlush(fam);
        entityManager.clear();

        // WHEN - Second import changes status to DIVORCED, wedding date/place to 1952 Kraków, and child to Adopted
        String gedcomV2 = """
            0 HEAD
            1 SOUR MYHERITAGE
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
            1 SEX M
            1 FAMC @F1@
            2 PEDI Adopted
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 MARR
            2 DATE 15 AUG 1952
            2 PLAC Kraków
            1 DIV
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV2 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV2,
                Map.of(
                        "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, john.getId()),
                        "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, lucy.getId()),
                        "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.MATCH, mark.getId())
                ),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.MATCH, fam.getId())),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // THEN
        Family updatedFam = familyRepository.findById(fam.getId()).orElseThrow();
        FamilyChild updatedChild = updatedFam.getChildren().iterator().next();

        // User-edited status and fatherRelationshipType are preserved, while untouched motherRelationshipType updates to ADOPTED!
        assertThat(updatedFam.getStatus().getCode()).isEqualTo(FamilyStatus.SEPARATED.name());
        assertThat(updatedChild.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.FOSTER);
        assertThat(updatedChild.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        // Untouched wedding date and place ARE updated!
        assertThat(updatedFam.getPrimaryWedding().getStartDate().getStartYear()).isEqualTo(1952);
        assertThat(updatedFam.getPrimaryWedding().getMainLocation().getName()).isEqualTo("Kraków");

        // Raw data reflects the new GEDCOM file
        assertThat(updatedFam.getGedcomData().getRawStatus()).isEqualTo(FamilyStatus.DIVORCED.name());
        assertThat(updatedFam.getGedcomData().getRawWeddingDate()).isEqualTo("15 AUG 1952");
        assertThat(updatedFam.getGedcomData().getRawWeddingPlace()).isEqualTo("Kraków");
        assertThat(updatedFam.getGedcomData().getChildren().iterator().next().getRawPedigree())
                .isEqualToIgnoringCase("Adopted");
    }

    @Test
    @Transactional
    void shouldExtractParentSpecificAdoptionFromGedcomPediAndAdopTags() throws Exception {
        // GIVEN - Family with 3 children:
        // @I3@ (Child 1): adopted only by HUSB (biological child of WIFE)
        // @I4@ (Child 2): adopted only by WIFE (biological child of HUSB)
        // @I5@ (Child 3): adopted by BOTH via ADOP event
        String gedcom = """
            0 HEAD
            1 SOUR GRAMPS
            1 CHAR UTF-8
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 NAME Anna /Kowalska/
            1 SEX F
            1 FAMS @F1@
            0 @I3@ INDI
            1 NAME Tomek /Kowalski/
            1 SEX M
            1 FAMC @F1@
            2 PEDI adopted
            1 ADOP
            2 FAMC @F1@
            3 ADOP HUSB
            0 @I4@ INDI
            1 NAME Kasia /Kowalska/
            1 SEX F
            1 FAMC @F1@
            1 ADOP
            2 FAMC @F1@
            3 ADOP WIFE
            0 @I5@ INDI
            1 NAME Piotr /Kowalski/
            1 SEX M
            1 FAMC @F1@
            1 ADOP
            2 FAMC @F1@
            3 ADOP BOTH
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 CHIL @I4@
            1 CHIL @I5@
            0 TRLR
            """;

        ParsedGedcomFileDto parsed = fileExtractor.extract(
                new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8))
        );

        // WHEN
        importApplier.applyImport(
                parsed,
                Map.of(
                        "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null),
                        "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.CREATE_NEW, null),
                        "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.CREATE_NEW, null),
                        "@I4@", new IndividualDecisionDto("@I4@", DecisionAction.CREATE_NEW, null),
                        "@I5@", new IndividualDecisionDto("@I5@", DecisionAction.CREATE_NEW, null)
                ),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // THEN
        Family fam = familyRepository.findByGedcomDataGedRefId("@F1@").orElseThrow();
        assertThat(fam.getChildren()).hasSize(3);

        FamilyChild tomek = fam.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Tomek"))
                .findFirst().orElseThrow();
        assertThat(tomek.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);
        assertThat(tomek.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);

        FamilyChild kasia = fam.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Kasia"))
                .findFirst().orElseThrow();
        assertThat(kasia.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.BIOLOGICAL);
        assertThat(kasia.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        FamilyChild piotr = fam.getChildren().stream()
                .filter(fc -> fc.getChild().getCachedGivenName().equals("Piotr"))
                .findFirst().orElseThrow();
        assertThat(piotr.getFatherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);
        assertThat(piotr.getMotherRelationshipType()).isEqualTo(FamilyChildRelationshipType.ADOPTED);

        // Verify raw GEDCOM child data
        FamilyChildGedcomData rawTomek = fam.getGedcomData().getChildren().stream()
                .filter(rc -> rc.getRawChildRefId().equals("@I3@"))
                .findFirst().orElseThrow();
        assertThat(rawTomek.getRawPedigree()).isEqualToIgnoringCase("adopted");
        assertThat(rawTomek.getRawAdoptedBy()).isEqualTo("HUSB");
    }

    @Test
    @Transactional
    void shouldAccumulateMultipleExternalUidsAcrossDifferentSources() throws Exception {
        // GIVEN - Import 1 from MYHERITAGE
        String gedcomMh = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID mh-person-uid-1
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID mh-family-uid-1
            1 HUSB @I1@
            1 MARR
            0 TRLR
            """;

        ParsedGedcomFileDto parsedMh = fileExtractor.extract(
                new ByteArrayInputStream(gedcomMh.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedMh,
                Map.of("@I1@", new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null)),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        Long janId = personRepository.findAll().getFirst().getId();
        Long famId = familyRepository.findAll().getFirst().getId();

        // WHEN - Import 2 from GRAMPS with different _UIDs matched to the same person and family
        String gedcomGramps = """
            0 HEAD
            1 SOUR GRAMPS
            1 CHAR UTF-8
            0 @I99@ INDI
            1 _UID gramps-person-uid-2
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F99@
            0 @F99@ FAM
            1 _UID gramps-family-uid-2
            1 HUSB @I99@
            1 MARR
            0 TRLR
            """;

        ParsedGedcomFileDto parsedGramps = fileExtractor.extract(
                new ByteArrayInputStream(gedcomGramps.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedGramps,
                Map.of("@I99@", new IndividualDecisionDto("@I99@", DecisionAction.MATCH, janId)),
                Map.of("@F99@", new FamilyDecisionDto("@F99@", DecisionAction.MATCH, famId)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // THEN - Both UIDs are stored without overwriting
        Person jan = personRepository.findById(janId).orElseThrow();
        assertThat(jan.getExternalIds())
                .extracting(PersonExternalId::getUidValue)
                .containsExactlyInAnyOrder("mh-person-uid-1", "gramps-person-uid-2");

        Family fam = familyRepository.findById(famId).orElseThrow();
        assertThat(fam.getExternalIds())
                .extracting(FamilyExternalId::getUidValue)
                .containsExactlyInAnyOrder("mh-family-uid-1", "gramps-family-uid-2");
    }

    @Test
    @Transactional
    void shouldArchiveOrDeleteAbsentPeopleAndUnarchiveWhenMatchedLater() throws Exception {
        // GIVEN - Import 1 with 3 people: Jan, Anna, Piotr
        String gedcomV1 = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID uid-jan
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID uid-anna
            1 NAME Anna /Nowak/
            1 SEX F
            1 FAMS @F1@
            1 BIRT
            2 DATE 5 MAY 1930
            2 PLAC Warszawa
            0 @I3@ INDI
            1 _UID uid-piotr
            1 NAME Piotr /Wiśniewski/
            1 SEX M
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 MARR
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV1 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV1,
                Map.of(
                        "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null),
                        "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.CREATE_NEW, null),
                        "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.CREATE_NEW, null)
                ),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        Long janId = personRepository.findByExternalIdsUidValue("uid-jan").orElseThrow().getId();
        Long annaId = personRepository.findByExternalIdsUidValue("uid-anna").orElseThrow().getId();
        Long piotrId = personRepository.findByExternalIdsUidValue("uid-piotr").orElseThrow().getId();
        Long famId = familyRepository.findAll().getFirst().getId();

        // WHEN - Import 2 contains only Jan. User chooses ARCHIVE for Anna and DELETE for Piotr.
        String gedcomV2 = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID uid-jan
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 HUSB @I1@
            1 MARR
            0 TRLR
            """;

        ParsedGedcomFileDto parsedV2 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV2.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV2,
                Map.of("@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, janId)),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.MATCH, famId)),
                Map.of(
                        annaId, AbsentPersonAction.ARCHIVE,
                        piotrId, AbsentPersonAction.DELETE
                )
        );
        entityManager.flush();
        entityManager.clear();

        // THEN - Piotr is deleted, Anna is archived without GedcomData, detached from family, but keeps birth event and UID
        assertThat(personRepository.findById(piotrId)).isEmpty();

        Person archivedAnna = personRepository.findById(annaId).orElseThrow();
        assertThat(archivedAnna.getIsArchived()).isTrue();
        assertThat(archivedAnna.getGedcomData()).isNull();
        assertThat(archivedAnna.getBirthEvent()).isNotNull();
        assertThat(archivedAnna.getBirthEvent().getMainLocation().getName()).isEqualTo("Warszawa");
        assertThat(archivedAnna.getExternalIds())
                .extracting(PersonExternalId::getUidValue)
                .containsExactly("uid-anna");

        Family famAfterV2 = familyRepository.findById(famId).orElseThrow();
        assertThat(famAfterV2.getWife()).isNull();

        // WHEN - Import 3: Anna reappears and is matched to archivedAnna
        ParsedGedcomFileDto parsedV3 = fileExtractor.extract(
                new ByteArrayInputStream(gedcomV1.getBytes(StandardCharsets.UTF_8))
        );
        importApplier.applyImport(
                parsedV3,
                Map.of(
                        "@I1@", new IndividualDecisionDto("@I1@", DecisionAction.MATCH, janId),
                        "@I2@", new IndividualDecisionDto("@I2@", DecisionAction.MATCH, annaId),
                        "@I3@", new IndividualDecisionDto("@I3@", DecisionAction.CREATE_NEW, null)
                ),
                Map.of("@F1@", new FamilyDecisionDto("@F1@", DecisionAction.MATCH, famId)),
                Map.of()
        );
        entityManager.flush();
        entityManager.clear();

        // THEN - Anna is un-archived and has GedcomData again
        Person unarchivedAnna = personRepository.findById(annaId).orElseThrow();
        assertThat(unarchivedAnna.getIsArchived()).isFalse();
        assertThat(unarchivedAnna.getGedcomData()).isNotNull();
        assertThat(unarchivedAnna.getGedcomData().getGedRefId()).isEqualTo("@I2@");
    }
}