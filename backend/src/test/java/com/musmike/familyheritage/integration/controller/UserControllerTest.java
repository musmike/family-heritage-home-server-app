package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
public class UserControllerTest extends AbstractIntegrationTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "testuser", roles = {"ADMIN"})
    void shouldReturnCurrentUserWhenAuthenticated() throws Exception {
        // WHEN & THEN
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("testuser"))
                .andExpect(jsonPath("$.roles[0]").value("ROLE_ADMIN"));
    }

    @Test
    void shouldReturnForbiddenWhenNotAuthenticated() throws Exception {
        // WHEN & THEN
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "testuser", roles = {"ADMIN"})
    void shouldReturnHealthCheckMessage() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello from Backend!"));
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldAssignPersonToPrivilegedUserAndRejectGuestUser(
            @Autowired com.musmike.familyheritage.repository.UserRepository userRepository,
            @Autowired com.musmike.familyheritage.repository.PersonRepository personRepository
    ) throws Exception {
        com.musmike.familyheritage.model.User privUser = new com.musmike.familyheritage.model.User();
        privUser.setUsername("ciocia");
        privUser.setPassword("pw");
        privUser.setRole(com.musmike.familyheritage.model.enums.UserRole.PRIVILEGED_GUEST);
        privUser = userRepository.saveAndFlush(privUser);

        com.musmike.familyheritage.model.User guestUser = new com.musmike.familyheritage.model.User();
        guestUser.setUsername("gosc");
        guestUser.setPassword("pw");
        guestUser.setRole(com.musmike.familyheritage.model.enums.UserRole.GUEST);
        guestUser = userRepository.saveAndFlush(guestUser);

        com.musmike.familyheritage.model.Person person = new com.musmike.familyheritage.model.Person();
        person.setCachedGivenName("Anna");
        person.setCachedSurname("Kowalska");
        person = personRepository.saveAndFlush(person);

        // Assign person to PRIVILEGED_GUEST -> 200 OK
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/users/{id}/person", privUser.getId())
                        .cookie(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "csrf-1"))
                        .header("X-XSRF-TOKEN", "csrf-1")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"personId\":" + person.getId() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personId").value(person.getId()))
                .andExpect(jsonPath("$.personGivenName").value("Anna"));

        // Attempting to assign person to GUEST -> 400 Bad Request
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/users/{id}/person", guestUser.getId())
                        .cookie(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "csrf-1"))
                        .header("X-XSRF-TOKEN", "csrf-1")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"personId\":" + person.getId() + "}"))
                .andExpect(status().isBadRequest());

        // List assignable users -> contains "ciocia", does NOT contain "gosc"
        mockMvc.perform(get("/users/assignable"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='ciocia')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.username=='gosc')]").isEmpty());
    }
}
