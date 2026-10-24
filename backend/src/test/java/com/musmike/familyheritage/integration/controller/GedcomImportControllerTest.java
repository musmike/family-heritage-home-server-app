package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.FamilyDecisionDto;
import com.musmike.familyheritage.dto.ImportSessionResponseDto;
import com.musmike.familyheritage.dto.IndividualDecisionDto;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.enums.DecisionAction;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class GedcomImportControllerTest extends AbstractIntegrationTest {

    private static final String CSRF_TOKEN = "test-csrf-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldExecuteFullWizardFlowViaRestEndpoints() throws Exception {
        // 1. Upload GEDCOM file to create session
        String gedcom = """
            0 HEAD
            1 SOUR MYHERITAGE
            1 CHAR UTF-8
            0 @I1@ INDI
            1 _UID rest-uid-1
            1 NAME Jan /Kowalski/
            1 SEX M
            1 FAMS @F1@
            0 @F1@ FAM
            1 _UID rest-fam-1
            1 HUSB @I1@
            1 MARR
            2 DATE 1990
            0 TRLR
            """;

        MockMultipartFile file = new MockMultipartFile(
                "file", "tree.ged", "text/plain", gedcom.getBytes(StandardCharsets.UTF_8)
        );

        MvcResult createResult = mockMvc.perform(multipart("/gedcom/import/sessions")
                        .file(file)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                        .header("X-XSRF-TOKEN", CSRF_TOKEN))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REVIEW_INDIVIDUALS"))
                .andExpect(jsonPath("$.individualMatches").isArray())
                .andReturn();

        ImportSessionResponseDto createdSession = objectMapper.readValue(
                createResult.getResponse().getContentAsString(),
                ImportSessionResponseDto.class
        );
        Long sessionId = createdSession.getSessionId();

        // 2. Get session state via GET
        mockMvc.perform(get("/gedcom/import/sessions/{id}", sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value(sessionId))
                .andExpect(jsonPath("$.status").value("REVIEW_INDIVIDUALS"));

        // 3. Confirm individuals
        List<IndividualDecisionDto> indiDecisions = List.of(
                new IndividualDecisionDto("@I1@", DecisionAction.CREATE_NEW, null)
        );

        mockMvc.perform(post("/gedcom/import/sessions/{id}/individuals", sessionId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                        .header("X-XSRF-TOKEN", CSRF_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(indiDecisions)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW_FAMILIES"))
                .andExpect(jsonPath("$.familyMatches").isArray());

        // 4. Confirm families
        List<FamilyDecisionDto> famDecisions = List.of(
                new FamilyDecisionDto("@F1@", DecisionAction.CREATE_NEW, null)
        );

        mockMvc.perform(post("/gedcom/import/sessions/{id}/families", sessionId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                        .header("X-XSRF-TOKEN", CSRF_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(famDecisions)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW_SUMMARY"))
                .andExpect(jsonPath("$.summaryPreview.individualsToCreate").value(1))
                .andExpect(jsonPath("$.summaryPreview.familiesToCreate").value(1));

        // 5. Apply session
        mockMvc.perform(post("/gedcom/import/sessions/{id}/apply", sessionId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                        .header("X-XSRF-TOKEN", CSRF_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        // 6. Get import history list
        mockMvc.perform(get("/gedcom/import/sessions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fileName").value("tree.ged"))
                .andExpect(jsonPath("$[0].status").value("COMPLETED"));

        // 7. Restore completed session
        mockMvc.perform(post("/gedcom/import/sessions/{id}/restore", sessionId)
                        .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                        .header("X-XSRF-TOKEN", CSRF_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldReturnBadRequestWhenSessionNotFoundOrInvalidState() throws Exception {
        mockMvc.perform(get("/gedcom/import/sessions/{id}", 999999L))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_IMPORT_REQUEST"));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldLookupPeopleAndFamiliesViaRestEndpoints() throws Exception {
        mockMvc.perform(get("/gedcom/import/sessions/lookup/people").param("query", "jan"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(get("/gedcom/import/sessions/lookup/families").param("query", "jan"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    @WithMockUser(username = "guest", roles = {"GUEST"})
    void shouldReturnForbiddenWhenNonAdminAccessesGedcomImport() throws Exception {
        mockMvc.perform(get("/gedcom/import/sessions"))
                .andExpect(status().isForbidden());
    }
}