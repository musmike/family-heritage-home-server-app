package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.service.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.util.Collections;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    private final String testSecret = "VGhpcyBpcyBhIHNlY3VyZSB0ZXN0IGtleSBmb3IgSldUIGVuY29kaW5nIGFuZCBtdXN0IGJlIGxvbmc=";
    private final long testAccessExpiration = 3600000;
    private final long testRefreshExpiration = 86400000;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", testSecret);
        ReflectionTestUtils.setField(jwtService, "accessExpirationMs", testAccessExpiration);
        ReflectionTestUtils.setField(jwtService, "refreshExpirationMs", testRefreshExpiration);
        jwtService.init();
    }

    @Test
    void shouldGenerateAccessTokenAndValidateSuccessfully() {
        // GIVEN
        UserDetails userDetails = new User("testuser", "password", Collections.emptyList());
        UserDetails otherUser = new User("otheruser", "password", Collections.emptyList());

        // WHEN
        String token = jwtService.generateAccessToken(userDetails);
        String refreshToken = jwtService.generateRefreshToken(userDetails);

        // THEN
        assertNotNull(token);
        assertNotNull(refreshToken);
        assertEquals("testuser", jwtService.extractUsername(token));
        assertTrue(jwtService.isTokenValid(token, userDetails));
        assertFalse(jwtService.isTokenValid(token, otherUser));

        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

        assertEquals("testuser", claims.getSubject());
        assertTrue(claims.getExpiration().after(new Date()));
    }

    @Test
    void shouldThrowExceptionWhenSecretKeyIsTooShort() {
        // GIVEN
        JwtService shortKeyService = new JwtService();
        ReflectionTestUtils.setField(shortKeyService, "jwtSecret", "c2hvcnRrZXk="); // "shortkey" in Base64 (< 32 bytes)

        // WHEN & THEN
        assertThrows(IllegalArgumentException.class, shortKeyService::init);
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(testSecret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}