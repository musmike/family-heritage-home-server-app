package com.musmike.familyheritage.unit.config;

import com.musmike.familyheritage.config.JwtAuthenticationFilter;
import com.musmike.familyheritage.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock
    private JwtService jwtService;

    @Mock
    private UserDetailsService userDetailsService;

    @Mock
    private FilterChain filterChain;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        filter = new JwtAuthenticationFilter(jwtService, userDetailsService);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void shouldAuthenticateUserWhenValidAccessTokenCookiePresent() throws Exception {
        // GIVEN
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "valid.jwt.token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        UserDetails userDetails = new User("jan", "pass", List.of());
        when(jwtService.extractUsername("valid.jwt.token")).thenReturn("jan");
        when(userDetailsService.loadUserByUsername("jan")).thenReturn(userDetails);
        when(jwtService.isTokenValid("valid.jwt.token", userDetails)).thenReturn(true);

        // WHEN
        filter.doFilter(request, response, filterChain);

        // THEN
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("jan");
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void shouldContinueFilterChainWhenTokenThrowsException() throws Exception {
        // GIVEN
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "corrupted.token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        when(jwtService.extractUsername("corrupted.token")).thenThrow(new RuntimeException("Invalid JWT"));

        // WHEN
        filter.doFilter(request, response, filterChain);

        // THEN
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }
}