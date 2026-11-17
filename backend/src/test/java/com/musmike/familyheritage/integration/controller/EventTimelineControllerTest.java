package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.SaveEventParticipantRequestDto;
import com.musmike.familyheritage.dto.SaveEventRequestDto;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import com.musmike.familyheritage.service.GedcomImportService;
import com.musmike.familyheritage.service.MediaService;
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
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class EventTimelineControllerTest extends AbstractIntegrationTest {

    private static final String CSRF = "csrf-event-test";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private GedcomImportService importService;
    @Autowired private PersonRepository personRepository;
    @Autowired private UserCodeRepository userCodeRepository;
    @Autowired private TranslationRepository translationRepository;
    @Autowired private EventTypeParticipantRoleRepository etprRepository;
    @Autowired private EventRepository eventRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private MediaService mediaService;
    @Autowired private EntityManager entityManager;

    private Event vacationEvent;

    @BeforeEach
    void setUpEvents() throws Exception {
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 NAME Jan Aleksander /Kowalski/
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

        vacationEvent = new Event();
        vacationEvent.setEventType(vacationCode);
        vacationEvent.setStartDate(start1960);
        vacationEvent.setCachedStartSortDateTime(LocalDateTime.of(1960, 7, 10, 12, 0));
        vacationEvent.setMainLocation(zakopane);
        vacationEvent = eventRepository.saveAndFlush(vacationEvent);
        vacationEvent.addParticipant(new EventParticipant(vacationEvent, jan, vacationPrincipal));
        vacationEvent = eventRepository.saveAndFlush(vacationEvent);

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldDefaultToDescendingDecadesAndSupportAscAndMultiTypeAndSecondsAndRanges() throws Exception {
        // 1. Default sortOrder = DESC (newest decade 2000s first!)
        mockMvc.perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(8))
                .andExpect(jsonPath("$.decades[0].decadeStart").value(2000));

        // 2. Explicit sortOrder = ASC
        mockMvc.perform(get("/events").param("sortOrder", "ASC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(8))
                .andExpect(jsonPath("$.minAvailableYear").value(1920))
                .andExpect(jsonPath("$.maxAvailableYear").value(2005))
                .andExpect(jsonPath("$.undatedEvents", hasSize(1)))
                .andExpect(jsonPath("$.availableTypes[*].label", hasItems("Narodziny", "Ślub", "Ceremonia ślubu", "Śmierć", "Pochówek", "Wakacje w górach")))
                .andExpect(jsonPath("$.decades[1].decadeStart").value(1940))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].typeCode").value("WEDDING"))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].subEvents", hasSize(1)))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].subEvents[0].typeCode").value("WEDDING_CEREMONY"))
                .andExpect(jsonPath("$.decades[1].years[0].events[0].participants[*].ageAtEvent", hasItems(28, 23)))
                .andExpect(jsonPath("$.decades[2].decadeStart").value(1950))
                .andExpect(jsonPath("$.decades[2].years[0].events[0].participants[0].parentNames", hasItems("Jan Aleksander Kowalski", "Anna Nowak")));

        // 3. Create event with date & time range (with seconds) and multiple parent events
        Person jan = personRepository.findByGedcomDataGedRefId("@I1@").orElseThrow();
        Person marek = personRepository.findByGedcomDataGedRefId("@I3@").orElseThrow();

        SaveEventRequestDto createBaptismReq = SaveEventRequestDto.builder()
                .typeCodes(List.of("BAPTISM", "BAPTISM_CEREMONY"))
                .title("Chrzest Marka")
                .description("## Przygotowania\nOpis chrztu w **Gdańsku**.")
                .parentEventIds(List.of(vacationEvent.getId()))
                .locationName("Gdańsk, Kościół św. Mikołaja")
                .startQualifier("EXACT")
                .startYear(1960)
                .startMonth(7)
                .startDay(11)
                .startTimeQualifier("EXACT")
                .startHour(9)
                .startMinute(15)
                .startSecond(30)
                .hasEndDate(true)
                .endQualifier("EXACT")
                .endYear(1960)
                .endMonth(7)
                .endDay(11)
                .endTimeQualifier("EXACT")
                .endHour(11)
                .endMinute(0)
                .endSecond(0)
                .participants(List.of(
                        new SaveEventParticipantRequestDto(marek.getId(), null, null, "PRINCIPAL"),
                        new SaveEventParticipantRequestDto(jan.getId(), null, null, "GODPARENT"),
                        new SaveEventParticipantRequestDto(null, "Stanisława Wiśniewska (sąsiadka)", PersonSex.FEMALE, "WITNESS")
                ))
                .build();

        MvcResult createdRes = mockMvc.perform(post("/events")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBaptismReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.assignedTypeCodes", containsInAnyOrder("BAPTISM", "BAPTISM_CEREMONY")))
                .andExpect(jsonPath("$.dateText").value("od 11.07.1960, godz. 09:15:30 do 11.07.1960, godz. 11:00:00"))
                .andExpect(jsonPath("$.parentEvents", hasSize(1)))
                .andExpect(jsonPath("$.parentEvents[0].eventId").value(vacationEvent.getId()))
                .andExpect(jsonPath("$.parentEvents[0].primaryFolderParent").value(true))
                .andExpect(jsonPath("$.participants", hasSize(3)))
                .andReturn();

        Long subEventId = objectMapper.readTree(createdRes.getResponse().getContentAsString()).get("eventId").asLong();
        Event createdSubEvent = eventRepository.findById(subEventId).orElseThrow();

        // Verify that child event directory is nested inside first parent event's folder (no participants added after custom titles)
        String resolvedSubDir = mediaService.resolveEventDirectoryPath(createdSubEvent, null);
        assertThat(resolvedSubDir).isEqualTo(
                "dated/1960s/1960/1960_07_10_vacation_jan_aleksander_kowalski/1960_07_11_chrzest_marka"
        );
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldValidateChronologicalOrderAndRequireTitleWhenMoreThanThreeParticipants() throws Exception {
        // 1. Reject end date earlier than start date
        SaveEventRequestDto invalidDatesReq = SaveEventRequestDto.builder()
                .typeCodes(List.of("TRIP"))
                .title("Błędny wyjazd")
                .startYear(1990)
                .startMonth(5)
                .startDay(20)
                .hasEndDate(true)
                .endYear(1990)
                .endMonth(5)
                .endDay(10)
                .build();

        mockMvc.perform(post("/events")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidDatesReq)))
                .andExpect(status().isBadRequest());

        // 2. Allow overlapping BETWEEN ranges when startMin <= endMin and startMax <= endMax
        SaveEventRequestDto overlappingBetweenReq = SaveEventRequestDto.builder()
                .typeCodes(List.of("SUMMER_VACATION"))
                .title("Wakacje nad morzem")
                .isStartBetweenRange(true)
                .startYear(1995)
                .startMonth(7)
                .startDay(10)
                .startRangeEndYear(1995)
                .startRangeEndMonth(7)
                .startRangeEndDay(15)
                .hasEndDate(true)
                .isEndBetweenRange(true)
                .endYear(1995)
                .endMonth(7)
                .endDay(12)
                .endRangeEndYear(1995)
                .endRangeEndMonth(7)
                .endRangeEndDay(20)
                .build();

        mockMvc.perform(post("/events")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(overlappingBetweenReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dateText").value("od między 10.07.1995 a 15.07.1995 do między 12.07.1995 a 20.07.1995"));

        // 3. Reject >3 participants when title is blank
        SaveEventRequestDto fourParticipantsNoTitle = SaveEventRequestDto.builder()
                .typeCodes(List.of("FAMILY_GATHERING"))
                .title("")
                .startYear(2000)
                .participants(List.of(
                        new SaveEventParticipantRequestDto(null, "Osoba 1", PersonSex.MALE, "PARTICIPANT"),
                        new SaveEventParticipantRequestDto(null, "Osoba 2", PersonSex.FEMALE, "PARTICIPANT"),
                        new SaveEventParticipantRequestDto(null, "Osoba 3", PersonSex.MALE, "PARTICIPANT"),
                        new SaveEventParticipantRequestDto(null, "Osoba 4", PersonSex.FEMALE, "PARTICIPANT")
                ))
                .build();

        mockMvc.perform(post("/events")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(fourParticipantsNoTitle)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("więcej niż 3 osoby")));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldAllowGuestToViewAllFamilyEvents() throws Exception {
        mockMvc.perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEvents").value(8))
                .andExpect(jsonPath("$.decades[*].years[*].year", hasItem(1952)));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldKeepEventVisibleOnTimelineAfterRemovingAllParticipants() throws Exception {
        SaveEventRequestDto removeParticipantsReq = SaveEventRequestDto.builder()
                .typeCodes(List.of("VACATION"))
                .title("Wakacje bez przypisanych osób")
                .startYear(1960)
                .startMonth(7)
                .startDay(10)
                .participants(List.of())
                .build();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/events/{id}", vacationEvent.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(removeParticipantsReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participants", hasSize(0)));

        mockMvc.perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decades[*].years[*].events[*].title", hasItem("Wakacje bez przypisanych osób")));
    }
}