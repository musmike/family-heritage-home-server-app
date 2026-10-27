package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.ActivityActionType;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.repository.UserRepository;
import com.musmike.familyheritage.service.ActivityLogService;
import com.musmike.familyheritage.service.GedcomImportService;
import com.musmike.familyheritage.service.GedcomImportSessionService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class ActivityLogControllerTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ActivityLogService activityLogService;
    @Autowired private GedcomImportService importService;
    @Autowired private GedcomImportSessionService sessionService;
    @Autowired private UserRepository userRepository;
    @Autowired private PersonRepository personRepository;
    @Autowired private EntityManager entityManager;

    @BeforeEach
    void setUpActivities() throws Exception {
        // 1. Simulate login with private LAN IP in X-Forwarded-For
        MockHttpServletRequest loginReq = new MockHttpServletRequest();
        loginReq.addHeader("X-Forwarded-For", "192.168.100.55");
        activityLogService.logUserLogin("admin", loginReq);

        // 2. Import GEDCOM (creates person Jan, birth event, burial/grave)
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID act-uid-1
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 JAN 1920
            2 PLAC Warszawa
            1 BURI
            2 PLAC Cmentarz Rakowicki, Kraków
            0 TRLR
            """;
        importService.importGedcom(new ByteArrayInputStream(gedcom.getBytes(StandardCharsets.UTF_8)));

        // Link user "admin" to Person "Jan Kowalski" to test "Kowalski Jan (admin)" formatting
        Person jan = personRepository.findByExternalIdsUidValue("act-uid-1").orElseThrow();
        User adminUser = userRepository.findByUsername("admin").orElseGet(() -> {
            User u = new User();
            u.setUsername("admin");
            u.setPassword("pw");
            u.setRole(UserRole.ADMIN);
            return u;
        });
        adminUser.setPerson(jan);
        userRepository.saveAndFlush(adminUser);

        activityLogService.logActivity(
                ActivityActionType.USER_CREATED,
                "Utworzono konto użytkownika: ciocia",
                "USER",
                null
        );

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldReturnAllActivitiesIncludingLoginWithPrivateIpAndFormattedActorForAdmin() throws Exception {
        mockMvc.perform(get("/activities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].actionType", hasItems(
                        "USER_LOGIN",
                        "PERSON_CREATED",
                        "EVENT_CREATED",
                        "GRAVE_CREATED",
                        "USER_CREATED"
                )))
                .andExpect(jsonPath("$.content[?(@.actionType=='USER_LOGIN')].ipAddress").value(hasItem("192.168.100.55")))
                .andExpect(jsonPath("$.content[?(@.actorUsername=='admin')].actorDisplayName").value(hasItem("Kowalski Jan (admin)")));

        // Reset tree -> preserves previous activities and adds TREE_RESET!
        sessionService.resetTreeData();

        mockMvc.perform(get("/activities").param("types", "TREE_RESET,PERSON_CREATED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].actionType", hasItems("TREE_RESET", "PERSON_CREATED")));
    }

    @Test
    @Transactional
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldHideAdminOnlyLoginAndUserManagementActivitiesFromNonAdmin() throws Exception {
        mockMvc.perform(get("/activities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].actionType", hasItems("PERSON_CREATED", "EVENT_CREATED", "GRAVE_CREATED")))
                .andExpect(jsonPath("$.content[*].actionType", not(hasItem("USER_LOGIN"))))
                .andExpect(jsonPath("$.content[*].actionType", not(hasItem("USER_CREATED"))));
    }
}