package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.service.GedcomImportService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class PersonBiographyControllerTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private EntityManager entityManager;

    private Long deceasedFatherId;
    private Long livingChildId;
    private Long archivedPersonId;

    @BeforeEach
    void setUpTree() throws Exception {
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID bio-uid-father
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 DEAT
            2 DATE 15 FEB 1990
            2 PLAC Kraków
            2 CAUS Zawał serca
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            1 FAMS @F1@
            0 @I2@ INDI
            1 _UID bio-uid-mother
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE ABT 1925
            1 DEAT
            2 DATE 2005
            1 FAMS @F1@
            0 @I3@ INDI
            1 _UID bio-uid-child-living
            1 NAME Marek /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 5 MAY 1955
            2 PLAC Gdańsk
            1 FAMC @F1@
            0 @I4@ INDI
            1 _UID bio-uid-child-deceased
            1 NAME Piotr /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1950
            1 DEAT
            2 DATE 2010
            1 FAMC @F1@
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 CHIL @I4@
            1 MARR
            2 DATE 10 JUN 1948
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));

        Person archived = new Person();
        archived.setCachedGivenName("Zygmunt");
        archived.setCachedSurname("Archiwalny");
        archived.setIsArchived(true);
        archived = personRepository.saveAndFlush(archived);
        archivedPersonId = archived.getId();

        deceasedFatherId = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow().getId();
        livingChildId = personRepository.findByGedcomDataGedRefId("@I3@").orElseThrow().getId();

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldListFilterSortAndIncludeArchivedForAdmin() throws Exception {
        // Default list excludes archived (4 active people: Jan, Anna, Marek, Piotr)
        mockMvc.perform(get("/biographies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content", hasSize(4)));

        // Including archived returns 5 people
        mockMvc.perform(get("/biographies").param("includeArchived", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(5));

        // Search by place or name
        mockMvc.perform(get("/biographies").param("search", "Gdańsk"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].givenName").value("Marek"));

        // Filter by sex = FEMALE
        mockMvc.perform(get("/biographies").param("sex", "FEMALE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].givenName").value("Anna"))
                .andExpect(jsonPath("$.content[0].age").value(80))
                .andExpect(jsonPath("$.content[0].ageApproximate").value(true));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldHideNonDeceasedPeopleFromListAndBlockDirectBiographyForGuest() throws Exception {
        // Guest sees ONLY DECEASED people (Jan, Anna, Piotr = 3; Marek who has UNKNOWN/LIVING lifeState is hidden!)
        mockMvc.perform(get("/biographies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[*].givenName", not(hasItem("Marek"))));

        // Guest attempting to open living/unknown Marek's biography gets 403 Forbidden
        mockMvc.perform(get("/biographies/{id}", livingChildId))
                .andExpect(status().isForbidden());

        // Guest opening deceased Jan's biography succeeds, but living child Marek is masked as "<Prywatne> Kowalski"
        // and rawGedcomData is null for non-admin
        mockMvc.perform(get("/biographies/{id}", deceasedFatherId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.givenName").value("Jan"))
                .andExpect(jsonPath("$.age").value(70))
                .andExpect(jsonPath("$.causeOfDeath").value("Zawał serca"))
                .andExpect(jsonPath("$.burialPlace").value("Cmentarz Rakowicki, Kraków"))
                .andExpect(jsonPath("$.rawGedcomData").value(nullValue()))
                .andExpect(jsonPath("$.spouseFamilies[0].children[*].person.givenName", hasItems("Piotr", "<Prywatne>")));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldReturnFullBiographyWithRelativesAndRawGedcomDataForAdmin() throws Exception {
        // Admin views Jan's biography -> sees all children unmasked AND rawGedcomData
        mockMvc.perform(get("/biographies/{id}", deceasedFatherId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.givenName").value("Jan"))
                .andExpect(jsonPath("$.surname").value("Kowalski"))
                .andExpect(jsonPath("$.birthDateText").value("10.01.1920"))
                .andExpect(jsonPath("$.birthPlace").value("Warszawa"))
                .andExpect(jsonPath("$.deathDateText").value("15.02.1990"))
                .andExpect(jsonPath("$.deathPlace").value("Kraków"))
                .andExpect(jsonPath("$.causeOfDeath").value("Zawał serca"))
                .andExpect(jsonPath("$.burialPlace").value("Cmentarz Rakowicki, Kraków"))
                .andExpect(jsonPath("$.age").value(70))
                .andExpect(jsonPath("$.spouseFamilies[0].spouse.givenName").value("Anna"))
                .andExpect(jsonPath("$.spouseFamilies[0].weddingDateText").value("10.06.1948"))
                .andExpect(jsonPath("$.spouseFamilies[0].weddingPlace").value("Warszawa"))
                .andExpect(jsonPath("$.spouseFamilies[0].children", hasSize(2)))
                .andExpect(jsonPath("$.rawGedcomData.gedRefId").value("@I1@"))
                .andExpect(jsonPath("$.rawGedcomData.gedUid").value("bio-uid-father"));

        // Admin views Marek's biography -> sees OriginFamily (parents Jan & Anna + sibling Piotr)
        mockMvc.perform(get("/biographies/{id}", livingChildId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.originFamilies[0].father.givenName").value("Jan"))
                .andExpect(jsonPath("$.originFamilies[0].mother.givenName").value("Anna"))
                .andExpect(jsonPath("$.originFamilies[0].siblings[0].givenName").value("Piotr"));
    }
}