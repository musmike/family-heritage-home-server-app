package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
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
import java.time.LocalDateTime;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class EventTimelineControllerTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private UserCodeRepository userCodeRepository;
    @Autowired private TranslationRepository translationRepository;
    @Autowired private EventTypeParticipantRoleRepository etprRepository;
    @Autowired private EventRepository eventRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private EntityManager entityManager;

    @BeforeEach
    void setUpEvents() throws Exception {
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
            1 FAMS @F1@
            0 @I2@ INDI
            1 NAME Anna /Nowak/
            1 SEX F
            1 BIRT
            2 DATE 1925
            1 DEAT
            2 DATE 2005
            1 FAMS @F1@
            0 @I3@ INDI
            1 NAME Marek /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 5 MAY 1952
            2 PLAC Gdańsk
            1 FAMC @F1@
            0 @F1@ FAM
            1 HUSB @I1@
            1 WIFE @I2@
            1 CHIL @I3@
            1 MARR
            2 DATE 10 JUN 1948
            2 PLAC Warszawa
            0 TRLR
            """;

        importService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));

        // Add a custom non-GEDCOM event type ("VACATION" -> "Wakacje w górach") in 1960
        UserCode vacationCode = userCodeRepository.saveAndFlush(
                new UserCode(CodeCategory.EVENT_TYPE.name(), "VACATION", false)
        );
        translationRepository.saveAndFlush(new Translation(
                "user_codes", vacationCode.getId(), "code", LanguageCode.PL_PL.getCode(), "Wakacje w górach"
        ));
        UserCode principalRole = userCodeRepository
                .findByCategoryAndCode(CodeCategory.EVENT_PARTICIPANT_ROLE.name(), EventParticipantRole.PRINCIPAL.name())
                .orElseThrow();
        EventTypeParticipantRole vacationPrincipal = etprRepository.saveAndFlush(
                new EventTypeParticipantRole(vacationCode, principalRole)
        );

        DateDescriptor start1960 = new DateDescriptor();
        start1960.setDateType(DateType.SINGLE);
        start1960.setStartQualifier(DateQualifier.EXACT);
        start1960.setStartYear(1960);
        start1960.setStartMonth(7);
        start1960.setStartDay(10);
        start1960.setSortDateTimeMin(LocalDateTime.of(1960, 7, 10, 0, 0));
        start1960.setSortDateTimeMax(LocalDateTime.of(1960, 7, 10, 23, 59));

        Location zakopane = locationRepository.saveAndFlush(new Location("Zakopane"));
        Person jan = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow();

        Event vacationEvent = new Event();
        vacationEvent.setEventType(vacationCode);
        vacationEvent.setStartDate(start1960);
        vacationEvent.setCachedStartSortDateTime(LocalDateTime.of(1960, 7, 10, 12, 0));
        vacationEvent.setMainLocation(zakopane);
        vacationEvent = eventRepository.saveAndFlush(vacationEvent);
        vacationEvent.addParticipant(new EventParticipant(vacationEvent, jan, vacationPrincipal));
        eventRepository.saveAndFlush(vacationEvent);

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldGroupEventsIntoDecadesAndYearsWithContextAndSupportCustomEventTypes() throws Exception {
        // Default: undated burial is excluded, 7 dated events exist:
        // 1920 (Jan birth), 1925 (Anna birth), 1948 (Wedding), 1952 (Marek birth), 1960 (Vacation), 1990 (Jan death), 2005 (Anna death)
        mockMvc.perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(7))
                .andExpect(jsonPath("$.availableTypes[*].label", hasItems("Narodziny", "Ślub", "Śmierć", "Pochówek", "Wakacje w górach")))
                .andExpect(jsonPath("$.decades[0].decadeStart").value(1920))
                .andExpect(jsonPath("$.decades[0].years[0].year").value(1920))
                .andExpect(jsonPath("$.decades[1].decadeStart").value(1940))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].typeCode").value("WEDDING"))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].participants[*].ageAtEvent", hasItems(28, 23)))
                .andExpect(jsonPath("$.decades[2].decadeStart").value(1950))
                .andExpect(jsonPath("$.decades[2].years[0].events[0].participants[0].parentNames", hasItems("Kowalski Jan", "Nowak Anna")));

        // Filter by multiple event types (WEDDING and custom VACATION) + year range
        mockMvc.perform(get("/events")
                        .param("types", "WEDDING,VACATION")
                        .param("yearFrom", "1945")
                        .param("yearTo", "1965"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(2))
                .andExpect(jsonPath("$.decades[*].years[*].events[*].typeLabel", hasItems("Ślub", "Wakacje w górach")));

        // Include undated events -> undated burial at Cmentarz Rakowicki appears in undatedEvents
        mockMvc.perform(get("/events").param("includeUndated", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(8))
                .andExpect(jsonPath("$.undatedEvents", hasSize(1)))
                .andExpect(jsonPath("$.undatedEvents[0].typeCode").value("BURIAL"))
                .andExpect(jsonPath("$.undatedEvents[0].locationName").value("Cmentarz Rakowicki, Kraków"));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldAllowGuestToViewAllFamilyEvents() throws Exception {
        mockMvc.perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(7))
                .andExpect(jsonPath("$.decades[*].years[*].year", hasItem(1952)));
    }
}