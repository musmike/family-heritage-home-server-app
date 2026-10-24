package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.LoginRequest;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.repository.UserRepository;
import com.musmike.familyheritage.service.JwtService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class AuthenticationControllerTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserRepository userRepository;

    @TestConfiguration
    static class TestConfig {
        @Bean
        public AuthenticationManager authenticationManager() {
            return Mockito.mock(AuthenticationManager.class);
        }

        @Bean
        public JwtService jwtService() {
            return Mockito.mock(JwtService.class);
        }
    }

    @BeforeEach
    void resetMocks() {
        Mockito.reset(authenticationManager, jwtService);
    }

    @Test
    void shouldSetCookiesOnSuccessfulLogin() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setUsername("user");
        loginRequest.setPassword("password");

        UserDetails userDetails = org.springframework.security.core.userdetails.User
                .withUsername("user")
                .password("pass")
                .authorities("ADMIN").build();
        Authentication auth = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities()
        );

        Mockito.when(authenticationManager.authenticate(any())).thenReturn(auth);
        Mockito.when(jwtService.generateAccessToken(any())).thenReturn("mocked.access.token");
        Mockito.when(jwtService.generateRefreshToken(any())).thenReturn("mocked.refresh.token");

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("access_token"))
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(cookie().exists("refresh_token"))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    void shouldReturnUnauthorizedWhenLoginFailsWithBadCredentials() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setUsername("user");
        loginRequest.setPassword("wrongpassword");

        Mockito.when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("BAD_CREDENTIALS"));
    }

    @Test
    void shouldHandleLockedDisabledGenericAuthAndUnexpectedExceptionsOnLogin() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setUsername("user");
        loginRequest.setPassword("pw");

        Mockito.when(authenticationManager.authenticate(any()))
                .thenThrow(new LockedException("Locked"))
                .thenThrow(new DisabledException("Disabled"))
                .thenThrow(new AuthenticationServiceException("Auth service error"))
                .thenThrow(new RuntimeException("Unexpected"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_LOCKED"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DISABLED"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTHENTICATION_FAILED"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.errorCode").value("INTERNAL_SERVER_ERROR"));
    }

    @Test
    @Transactional
    void shouldRefreshAccessTokenWhenRefreshTokenIsValidAndRejectWhenInvalid() throws Exception {
        User dbUser = new User();
        dbUser.setUsername("refreshuser");
        dbUser.setPassword("hashed");
        dbUser.setRole(UserRole.ADMIN);
        userRepository.saveAndFlush(dbUser);

        Mockito.when(jwtService.extractUsername("valid.refresh")).thenReturn("refreshuser");
        Mockito.when(jwtService.isTokenValid(eq("valid.refresh"), any())).thenReturn(true);
        Mockito.when(jwtService.generateAccessToken(any())).thenReturn("new.access.token");

        mockMvc.perform(post("/auth/refresh")
                        .cookie(new Cookie("refresh_token", "valid.refresh")))
                .andExpect(status().isOk())
                .andExpect(cookie().value("access_token", "new.access.token"))
                .andExpect(cookie().exists("XSRF-TOKEN"));

        Mockito.when(jwtService.extractUsername("invalid.refresh")).thenThrow(new RuntimeException("Expired"));

        mockMvc.perform(post("/auth/refresh")
                        .cookie(new Cookie("refresh_token", "invalid.refresh")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldLogoutAndClearCookies() throws Exception {
        mockMvc.perform(post("/auth/logout"))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("access_token", 0))
                .andExpect(cookie().maxAge("refresh_token", 0))
                .andExpect(cookie().maxAge("XSRF-TOKEN", 0));
    }
}