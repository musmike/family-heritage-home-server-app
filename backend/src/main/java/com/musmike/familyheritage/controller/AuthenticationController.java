package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.ErrorResponse;
import com.musmike.familyheritage.dto.LoginRequest;
import com.musmike.familyheritage.service.ActivityLogService;
import com.musmike.familyheritage.service.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.annotation.CookieValue;

import java.util.UUID;

@RestController
@RequestMapping("/auth")
public class AuthenticationController {

    private static final Logger logger = LoggerFactory.getLogger(AuthenticationController.class);
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final ActivityLogService activityLogService;

    @Value("${app.jwt.access-expiration-ms}")
    private long accessExpirationMs;

    @Value("${app.jwt.refresh-expiration-ms}")
    private long refreshExpirationMs;

    public AuthenticationController(JwtService jwtService, AuthenticationManager authenticationManager,
                                    UserDetailsService userDetailsService, ActivityLogService activityLogService) {
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.activityLogService = activityLogService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse response) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );

            UserDetails userDetails = (UserDetails) authentication.getPrincipal();
            activityLogService.logUserLogin(userDetails.getUsername(), httpRequest);

            String accessToken = jwtService.generateAccessToken(userDetails);
            String refreshToken = jwtService.generateRefreshToken(userDetails);
            String xsrfToken = UUID.randomUUID().toString();

            ResponseCookie accessTokenCookie = createCookie("access_token", accessToken, accessExpirationMs / 1000, "/", true);
            ResponseCookie refreshTokenCookie = createCookie("refresh_token", refreshToken, refreshExpirationMs / 1000, "/api/auth", true);
            ResponseCookie xsrfTokenCookie = createCookie("XSRF-TOKEN", xsrfToken, accessExpirationMs / 1000, "/", false);

            HttpHeaders headers = new HttpHeaders();
            headers.add(HttpHeaders.SET_COOKIE, accessTokenCookie.toString());
            headers.add(HttpHeaders.SET_COOKIE, refreshTokenCookie.toString());
            headers.add(HttpHeaders.SET_COOKIE, xsrfTokenCookie.toString());

            return ResponseEntity.ok().headers(headers).build();

        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ErrorResponse("BAD_CREDENTIALS", "Invalid username or password."));
        } catch (LockedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ErrorResponse("ACCOUNT_LOCKED", "This account has been locked."));
        } catch (DisabledException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ErrorResponse("ACCOUNT_DISABLED", "This account has been disabled."));
        } catch (AuthenticationException e) {
            logger.warn("Authentication failed for user {}: {}", request.getUsername(), e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ErrorResponse("AUTHENTICATION_FAILED", "Authentication failed."));
        } catch (Exception e) {
            logger.error("An unexpected error occurred during login for user {}", request.getUsername(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred."));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refreshToken(@CookieValue(name = "refresh_token") String refreshToken, HttpServletResponse response) {
        try {
            String username = jwtService.extractUsername(refreshToken);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (jwtService.isTokenValid(refreshToken, userDetails)) {
                String newAccessToken = jwtService.generateAccessToken(userDetails);
                String newXsrfToken = UUID.randomUUID().toString();

                ResponseCookie accessTokenCookie = createCookie("access_token", newAccessToken, accessExpirationMs / 1000, "/", true);
                ResponseCookie xsrfTokenCookie = createCookie("XSRF-TOKEN", newXsrfToken, accessExpirationMs / 1000, "/", false);

                response.addHeader(HttpHeaders.SET_COOKIE, accessTokenCookie.toString());
                response.addHeader(HttpHeaders.SET_COOKIE, xsrfTokenCookie.toString());

                return ResponseEntity.ok().build();
            }
        } catch (Exception e) {
            logger.error("Refresh token error: ", e);
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        ResponseCookie accessTokenCookie = createCookie("access_token", "", 0, "/", true);
        ResponseCookie refreshTokenCookie = createCookie("refresh_token", "", 0, "/api/auth", true);
        ResponseCookie xsrfTokenCookie = createCookie("XSRF-TOKEN", "", 0, "/", false);

        response.addHeader(HttpHeaders.SET_COOKIE, accessTokenCookie.toString());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshTokenCookie.toString());
        response.addHeader(HttpHeaders.SET_COOKIE, xsrfTokenCookie.toString());
        return ResponseEntity.ok().build();
    }

    private ResponseCookie createCookie(String name, String value, long maxAgeInSeconds, String path, boolean httpOnly) {
        return ResponseCookie.from(name, value)
                .httpOnly(httpOnly)
                .secure(false) // Set to true in production with HTTPS
                .path(path)
                .maxAge(maxAgeInSeconds)
                .sameSite("Lax")
                .build();
    }
}