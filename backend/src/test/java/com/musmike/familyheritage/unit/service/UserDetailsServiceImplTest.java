package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.repository.UserRepository;
import com.musmike.familyheritage.service.UserDetailsServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class UserDetailsServiceImplTest {
    @Mock
    private UserRepository userRepository;

    private UserDetailsServiceImpl userDetailsService;

    @BeforeEach
    public void setUp() {
        userDetailsService = new UserDetailsServiceImpl(userRepository);
    }

    @Test
    void shouldLoadUserByUsernameWhenUserExists() {
        // GIVEN
        User user = new User();
        user.setUsername("admin");
        user.setPassword("hashedPassword");
        user.setRole(UserRole.ADMIN);

        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(user));

        // WHEN
        UserDetails userDetails = userDetailsService.loadUserByUsername("admin");

        // THEN
        assertNotNull(userDetails);
        assertEquals("admin", userDetails.getUsername());
        assertEquals("hashedPassword", userDetails.getPassword());
        assertTrue(userDetails.getAuthorities().stream()
                .anyMatch(grantedAuthority
                        -> grantedAuthority.getAuthority().equals("ADMIN")));
    }

    @Test
    void shouldThrowUsernameNotFoundExceptionWhenUserDoesNotExist() {
        // GIVEN
        when(userRepository.findByUsername("nonexistent")).thenReturn(Optional.empty());

        // WHEN & THEN
        assertThrows(UsernameNotFoundException.class, () -> {
            userDetailsService.loadUserByUsername("nonexistent");
        });
    }
}
