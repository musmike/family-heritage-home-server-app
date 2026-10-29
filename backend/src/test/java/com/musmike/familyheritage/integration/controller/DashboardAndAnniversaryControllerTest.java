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
class DashboardAndAnniversaryControllerTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private EntityManager entityManager;

    @BeforeEach
    void setUpTree() throws Exception {
        // 3 generations:
        // Gen 1: Dziadek (@I1@, deceased: exact birth 05 JAN 1920, exact death 10 FEB 1995 + burial)
        // Gen 2: Ojciec (@I2@, living/unknown: exact birth 15 MAR 1950) + Matka (@I3@, living/unknown: ABT birth 20 APR 1952)
        //        married in @F2@ (MARRIED, exact wedding 25 JUN 1975)
        // Gen 3: Syn (@I4@, living/unknown: year-only birth 1980) + Żona Syna (@I5@, living/unknown: exact birth 12 AUG 1982)
        //        divorced in @F3@ (DIVORCED, exact wedding 01 SEP 2005 -> should be excluded from wedding anniversaries)
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 NAME Stanisław /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 5 JAN 1920
            2 PLAC Lwów
            1 DEAT
            2 DATE 10 FEB 1995
            2 PLAC Kraków
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            1 FAMS @F1@
            0 @I2@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 15 MAR 1950
            2 PLAC Warszawa
            1 FAMC @F1@
            1 FAMS @F2@
            0 @I3@ INDI
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE ABT 20 APR 1952
            1 FAMS @F2@
            0 @I4@ INDI
            1 NAME Marek /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 1980
            1 FAMC @F2@
            1 FAMS @F3@
            0 @I5@ INDI
            1 NAME Kasia /Wiśniewska/
            1 SEX F
            1 BIRT
            2 DATE 12 AUG 1982
            2 PLAC Gdańsk
            1 FAMS @F3@
            0 @F1@ FAM
            1 HUSB @I1@
            1 CHIL @I2@
            1 MARR
            2 DATE 12 MAY 1945
            0 @F2@ FAM
            1 HUSB @I2@
            1 WIFE @I3@
            1 CHIL @I4@
            1 MARR
            2 DATE 25 JUN 1975
            2 PLAC Warszawa
            0 @F3@ FAM
            1 HUSB @I4@
            1 WIFE @I5@
            1 MARR
            2 DATE 1 SEP 2005
            1 DIV
            0 TRLR
            """;

        importService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));

        // Also add an archived person who should not be counted in active stats or default anniversaries
        Person archivedPerson = new Person();
        archivedPerson.setCachedGivenName("Zygmunt");
        archivedPerson.setCachedSurname("Archiwalny");
        archivedPerson.setIsArchived(true);
        personRepository.saveAndFlush(archivedPerson);

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldReturnAccurateDashboardStatisticsExcludingArchivedPeople() throws Exception {
        mockMvc.perform(get("/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.peopleCount").value(5))
                .andExpect(jsonPath("$.familiesCount").value(3))
                .andExpect(jsonPath("$.generationsCount").value(3))
                .andExpect(jsonPath("$.gravesCount").value(1))
                .andExpect(jsonPath("$.eventsCount").value(greaterThanOrEqualTo(7)))
                .andExpect(jsonPath("$.documentsCount").value(0))
                .andExpect(jsonPath("$.mediaCount").value(0))
                .andExpect(jsonPath("$.memoriesCount").value(0))
                .andExpect(jsonPath("$.heirloomsCount").value(0))
                .andExpect(jsonPath("$.placesCount").value(0));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldReturnQualifiedExactAnniversariesAndSupportFilteringAndSorting() throws Exception {
        // Expected qualified anniversaries:
        // 1. DEATH of Stanisław (10 FEB 1995) - BIRTH of Stanisław is excluded because he is DECEASED; wedding @F1@ has only 1 spouse and is DECEASED
        // 2. BIRTH of Jan (15 MAR 1950, exact) - Anna's birth is ABT (excluded), Marek's birth is year-only (excluded)
        // 3. BIRTH of Kasia (12 AUG 1982, exact)
        // 4. WEDDING of Jan & Anna (@F2@, 25 JUN 1975, MARRIED, both alive/unknown) - @F3@ is DIVORCED so excluded!
        mockMvc.perform(get("/anniversaries").param("sortBy", "CALENDAR_ASC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].type").value("DEATH"))
                .andExpect(jsonPath("$.content[0].month").value(2))
                .andExpect(jsonPath("$.content[0].day").value(10))
                .andExpect(jsonPath("$.content[1].type").value("BIRTH"))
                .andExpect(jsonPath("$.content[1].month").value(3))
                .andExpect(jsonPath("$.content[1].day").value(15))
                .andExpect(jsonPath("$.content[2].type").value("WEDDING"))
                .andExpect(jsonPath("$.content[2].month").value(6))
                .andExpect(jsonPath("$.content[2].day").value(25))
                .andExpect(jsonPath("$.content[3].type").value("BIRTH"))
                .andExpect(jsonPath("$.content[3].month").value(8))
                .andExpect(jsonPath("$.content[3].day").value(12));

        // Filter by type = WEDDING
        mockMvc.perform(get("/anniversaries").param("types", "WEDDING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].typeLabel").value("Rocznica ślubu"))
                .andExpect(jsonPath("$.content[0].participants", hasSize(2)));

        // Filter by month = 3 (March)
        mockMvc.perform(get("/anniversaries").param("month", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].participants[0].givenName").value("Jan"));

        // Filter by search = "Gdańsk"
        mockMvc.perform(get("/anniversaries").param("search", "Gdańsk"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].participants[0].givenName").value("Kasia"));
    }
}