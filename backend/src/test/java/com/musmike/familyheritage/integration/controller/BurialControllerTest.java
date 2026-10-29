package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.AddPersonToGraveRequestDto;
import com.musmike.familyheritage.dto.SaveCemeteryRequestDto;
import com.musmike.familyheritage.dto.SaveGraveRequestDto;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Burial;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.repository.BurialRepository;
import com.musmike.familyheritage.repository.LocationRepository;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.service.GedcomImportService;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class BurialControllerTest extends AbstractIntegrationTest {

    private static final String CSRF = "csrf-burial-test";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private BurialRepository burialRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private EntityManager entityManager;

    private String gedcomContent;

    @BeforeEach
    void setUpBurials() throws Exception {
        gedcomContent = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID bur-uid-jan
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
            2 PLAC Cmentarz Rakowicki, kw. XII, Kraków
            0 @I2@ INDI
            1 _UID bur-uid-anna
            1 NAME Anna /Kowalska/
            1 SEX F
            1 BIRT
            2 DATE 1925
            1 DEAT
            2 DATE 2005
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 TRLR
            """;

        importService.importGedcom(new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldPlaceAllGedcomBurialsIntoOtherWithoutPollutingLocationsAndAllowAdminToManageCemeteriesAndGraves() throws Exception {
        // 1. Verify BURIAL places did NOT pollute the locations table
        assertThat(locationRepository.findByName("Cmentarz Rakowicki, kw. XII, Kraków")).isEmpty();
        assertThat(locationRepository.findByName("Cmentarz Rakowicki, Kraków")).isEmpty();

        // 2. Initially all GEDCOM graves are in "Inne" with their placeDescription visible
        mockMvc.perform(get("/burials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBurialsCount").value(2))
                .andExpect(jsonPath("$.totalGravesCount").value(2))
                .andExpect(jsonPath("$.cemeteryGroups", hasSize(1)))
                .andExpect(jsonPath("$.cemeteryGroups[0].groupName").value("Inne"))
                .andExpect(jsonPath("$.cemeteryGroups[0].otherGroup").value(true))
                .andExpect(jsonPath("$.cemeteryGroups[0].graves[*].burials[0].placeDescription",
                        hasItems("Cmentarz Rakowicki, kw. XII, Kraków", "Cmentarz Rakowicki, Kraków")));

        // 3. Admin creates two cemeteries (can even share the same name!)
        SaveCemeteryRequestDto cemReq1 = SaveCemeteryRequestDto.builder()
                .name("Cmentarz Parafialny")
                .managementType("PARISH")
                .denomination("ROMAN_CATHOLIC")
                .locationName("Kraków")
                .description("Zabytkowy cmentarz przy kościele parafialnym.")
                .build();

        MvcResult cemRes1 = mockMvc.perform(post("/burials/cemeteries")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cemReq1)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.groupName").value("Cmentarz Parafialny"))
                .andExpect(jsonPath("$.managementTypeLabel").value("Parafialny"))
                .andExpect(jsonPath("$.denominationLabel").value("Rzymskokatolickie"))
                .andReturn();

        Long cem1Id = objectMapper.readTree(cemRes1.getResponse().getContentAsString()).get("cemeteryId").asLong();

        // Create a second cemetery with the SAME name to verify no unique-name collision
        mockMvc.perform(post("/burials/cemeteries")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cemReq1)))
                .andExpect(status().isCreated());

        // 4. Merge Anna into Jan's grave and assign Jan's grave to cem1Id with full grave details
        Person jan = personRepository.findByExternalIdsUidValue("bur-uid-jan").orElseThrow();
        Person anna = personRepository.findByExternalIdsUidValue("bur-uid-anna").orElseThrow();
        Burial janBurial = burialRepository.findByPerson(jan).getFirst();
        Long janGraveId = janBurial.getGrave().getId();

        mockMvc.perform(post("/burials/graves/{graveId}/people", janGraveId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddPersonToGraveRequestDto(anna.getId(), true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.burials", hasSize(2)));

        SaveGraveRequestDto updateGraveReq = SaveGraveRequestDto.builder()
                .cemeteryId(cem1Id)
                .section("XII")
                .sector("B")
                .rowNumber("4")
                .graveNumber("18")
                .graveType("FAMILY")
                .description("Przy starym dębie po lewej stronie alei.")
                .epitaph("Pokój ich duszom")
                .build();

        mockMvc.perform(put("/burials/graves/{graveId}", janGraveId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateGraveReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cemeteryId").value(cem1Id))
                .andExpect(jsonPath("$.section").value("XII"))
                .andExpect(jsonPath("$.graveTypeLabel").value("Rodzinny"))
                .andExpect(jsonPath("$.epitaph").value("Pokój ich duszom"));

        // 5. Re-importing the GEDCOM file preserves the merged family grave and its cemetery assignment!
        importService.importGedcom(new ByteArrayInputStream(gedcomContent.getBytes(StandardCharsets.UTF_8)));
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get("/burials/graves/{graveId}", janGraveId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cemeteryId").value(cem1Id))
                .andExpect(jsonPath("$.section").value("XII"))
                .andExpect(jsonPath("$.burials", hasSize(2)));

        // 6. Deleting the cemetery moves its graves back to "Inne"
        mockMvc.perform(delete("/burials/cemeteries/{id}", cem1Id)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/burials/graves/{graveId}", janGraveId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cemeteryId").value(nullValue()))
                .andExpect(jsonPath("$.cemeteryName").value("Inne"));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldHideGedcomPlaceDescriptionForNonAdminOnceGraveIsAssignedToCemetery() throws Exception {
        Person jan = personRepository.findByExternalIdsUidValue("bur-uid-jan").orElseThrow();
        Long janGraveId = burialRepository.findByPerson(jan).getFirst().getGrave().getId();

        // While in "Inne", guest sees placeDescription
        mockMvc.perform(get("/burials/graves/{graveId}", janGraveId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.burials[0].placeDescription").value("Cmentarz Rakowicki, kw. XII, Kraków"));
    }
}