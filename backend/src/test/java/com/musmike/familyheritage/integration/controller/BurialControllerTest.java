package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Burial;
import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.Grave;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import com.musmike.familyheritage.repository.BurialRepository;
import com.musmike.familyheritage.repository.EventRepository;
import com.musmike.familyheritage.repository.GraveRepository;
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
class BurialControllerTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private BurialRepository burialRepository;
    @Autowired private GraveRepository graveRepository;
    @Autowired private EventRepository eventRepository;
    @Autowired private EntityManager entityManager;

    @BeforeEach
    void setUpBurials() throws Exception {
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
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
            0 @I2@ INDI
            1 NAME Anna /Kowalska/
            1 SEX F
            1 BIRT
            2 DATE 1925
            1 DEAT
            2 DATE 2005
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 @I3@ INDI
            1 NAME Piotr /Nowak/
            1 SEX M
            1 BIRT
            2 DATE 1930
            1 DEAT
            2 DATE 2010
            1 BURI
            2 PLAC Cmentarz Powązkowski, Warszawa
            0 @I4@ INDI
            1 NAME Maria /Wiśniewska/
            1 SEX F
            1 BIRT
            2 DATE 1940
            1 DEAT
            2 DATE 2020
            1 BURI
            2 PLAC Cmentarz Centralny, Szczecin
            0 TRLR
            """;

        importService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));

        Person jan = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow();
        Person anna = personRepository.findByGedcomDataGedRefId("@I2@").orElseThrow();

        Burial janBurial = burialRepository.findByPerson(jan).getFirst();

        // Simulate burial date added in the application UI for Jan's burial event
        DateDescriptor burialDate = new DateDescriptor();
        burialDate.setDateType(DateType.SINGLE);
        burialDate.setStartQualifier(DateQualifier.EXACT);
        burialDate.setStartYear(1990);
        burialDate.setStartMonth(2);
        burialDate.setStartDay(18);
        janBurial.getBurialEvent().setStartDate(burialDate);
        eventRepository.saveAndFlush(janBurial.getBurialEvent());

        // Put Jan and Anna into the SAME family grave at Cmentarz Rakowicki
        Burial annaBurial = burialRepository.findByPerson(anna).getFirst();
        annaBurial.setGrave(janBurial.getGrave());
        burialRepository.saveAndFlush(annaBurial);

        // Add a non-current historical burial for Jan
        Grave oldGrave = graveRepository.saveAndFlush(new Grave());
        Burial nonCurrentBurial = new Burial();
        nonCurrentBurial.setPerson(jan);
        nonCurrentBurial.setGrave(oldGrave);
        nonCurrentBurial.setIsCurrent(false);
        burialRepository.saveAndFlush(nonCurrentBurial);

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldGroupByCemeteryWithSingleItemsInOtherAndGroupByGraveId() throws Exception {
        mockMvc.perform(get("/burials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBurialsCount").value(4))
                .andExpect(jsonPath("$.cemeteryGroups", hasSize(2)))
                .andExpect(jsonPath("$.cemeteryGroups[0].groupName").value("Cmentarz Rakowicki, Kraków"))
                .andExpect(jsonPath("$.cemeteryGroups[0].otherGroup").value(false))
                .andExpect(jsonPath("$.cemeteryGroups[0].totalBurialsCount").value(2))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves", hasSize(1)))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves[0].burials", hasSize(2)))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves[0].burials[?(@.givenName=='Jan')].burialDateText").value(hasItem("18.02.1990")))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves[0].burials[?(@.givenName=='Jan')].causeOfDeath").value(hasItem("Zawał serca")))
                .andExpect(jsonPath("$.cemeteryGroups[1].groupName").value("Inne"))
                .andExpect(jsonPath("$.cemeteryGroups[1].otherGroup").value(true))
                .andExpect(jsonPath("$.cemeteryGroups[1].totalBurialsCount").value(2))
                .andExpect(jsonPath("$.cemeteryGroups[1].graves", hasSize(2)));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldIncludeNonCurrentBurialsAndKeepMainCemeteryGroupWhenFilteringBySexOrSearch() throws Exception {
        // With includeNonCurrent = true, total burials = 5
        mockMvc.perform(get("/burials").param("includeNonCurrent", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBurialsCount").value(5));

        // Filter by sex = FEMALE -> Anna (at Rakowicki) stays in "Cmentarz Rakowicki, Kraków" group,
        // and Maria (at Szczecin) is in "Inne"!
        mockMvc.perform(get("/burials").param("sex", "FEMALE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBurialsCount").value(2))
                .andExpect(jsonPath("$.cemeteryGroups", hasSize(2)))
                .andExpect(jsonPath("$.cemeteryGroups[0].groupName").value("Cmentarz Rakowicki, Kraków"))
                .andExpect(jsonPath("$.cemeteryGroups[1].groupName").value("Inne"));

        // Search by cause of death "Zawał serca" -> only Jan, still in "Cmentarz Rakowicki, Kraków"
        mockMvc.perform(get("/burials").param("search", "Zawał"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBurialsCount").value(1))
                .andExpect(jsonPath("$.cemeteryGroups[0].groupName").value("Cmentarz Rakowicki, Kraków"))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves[0].burials[0].givenName").value("Jan"));
    }
}