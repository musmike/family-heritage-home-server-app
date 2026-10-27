package com.musmike.familyheritage.integration.controller;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
public class UserControllerTest extends AbstractIntegrationTest {

    private static final String CSRF = "csrf-test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PersonRepository personRepository;

    @Test
    @WithMockUser(username = "testuser", roles = {"ADMIN"})
    void shouldReturnCurrentUserWhenAuthenticated() throws Exception {
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("testuser"))
                .andExpect(jsonPath("$.roles[0]").value("ROLE_ADMIN"));
    }

    @Test
    void shouldReturnForbiddenWhenNotAuthenticated() throws Exception {
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
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldCreateUpdateAssignPersonAndDeleteUsersForAdmin() throws Exception {
        User adminSelf = new User();
        adminSelf.setUsername("admin");
        adminSelf.setPassword("pw");
        adminSelf.setRole(UserRole.ADMIN);
        adminSelf = userRepository.saveAndFlush(adminSelf);

        Person person = new Person();
        person.setCachedGivenName("Anna");
        person.setCachedSurname("Kowalska");
        person = personRepository.saveAndFlush(person);

        // 1. Create a new PRIVILEGED_GUEST user with assigned person
        String createJson = String.format(
                "{\"username\":\"ciocia\",\"password\":\"sekret123\",\"role\":\"PRIVILEGED_GUEST\",\"personId\":%d}",
                person.getId()
        );

        mockMvc.perform(post("/users")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createJson))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("ciocia"))
                .andExpect(jsonPath("$.role").value("PRIVILEGED_GUEST"))
                .andExpect(jsonPath("$.personId").value(person.getId()))
                .andExpect(jsonPath("$.personGivenName").value("Anna"));

        User ciocia = userRepository.findByUsername("ciocia").orElseThrow();

        // 2. Update user role, username, and password
        String updateJson = String.format(
                "{\"username\":\"ciocia_anna\",\"password\":\"nowe123\",\"role\":\"ADMIN\",\"personId\":%d}",
                person.getId()
        );

        mockMvc.perform(put("/users/{id}", ciocia.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("ciocia_anna"))
                .andExpect(jsonPath("$.role").value("ADMIN"));

        // 3. Reject assigning person to a GUEST account
        String invalidGuestWithPerson = String.format(
                "{\"username\":\"gosc\",\"password\":\"pw\",\"role\":\"GUEST\",\"personId\":%d}",
                person.getId()
        );

        mockMvc.perform(post("/users")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidGuestWithPerson))
                .andExpect(status().isBadRequest());

        // 4. List all users
        mockMvc.perform(get("/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].username", hasItems("admin", "ciocia_anna")));

        // 5. Reject deleting own currently logged-in account
        mockMvc.perform(delete("/users/{id}", adminSelf.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isBadRequest());

        // 6. Delete another user
        mockMvc.perform(delete("/users/{id}", ciocia.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isNoContent());
    }
}