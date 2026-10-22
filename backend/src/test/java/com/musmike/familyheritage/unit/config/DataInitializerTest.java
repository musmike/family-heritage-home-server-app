package com.musmike.familyheritage.unit.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.config.DataInitializer;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DataInitializerTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private DataInitializer dataInitializer;

    @BeforeEach
    void setUp() {
        dataInitializer = new DataInitializer(userRepository, passwordEncoder, new ObjectMapper());
    }

    @Test
    void shouldSkipWhenSeedUsersJsonIsBlank() {
        // GIVEN
        ReflectionTestUtils.setField(dataInitializer, "seedUsersJson", "");

        // WHEN
        dataInitializer.run();

        // THEN
        verifyNoInteractions(userRepository);
    }

    @Test
    void shouldHandleInvalidJsonGracefully() {
        // GIVEN
        ReflectionTestUtils.setField(dataInitializer, "seedUsersJson", "{invalid-json}");

        // WHEN
        dataInitializer.run();

        // THEN
        verifyNoInteractions(userRepository);
    }

    @Test
    void shouldCreateNewUserAndUpdateExistingUserWhenChanged() {
        // GIVEN
        String json = """
            [
              {"username": "newadmin", "password": "pw1", "role": "ADMIN"},
              {"username": "existingChanged", "password": "newpw", "role": "PRIVILEGED_GUEST"},
              {"username": "existingUnchanged", "password": "samepw", "role": "GUEST"},
              {"username": "invalidRoleExisting", "password": "samepw", "role": "INVALID_ROLE"},
              {"username": "invalidRoleNew", "password": "pw2", "role": "INVALID_ROLE"}
            ]
            """;
        ReflectionTestUtils.setField(dataInitializer, "seedUsersJson", json);

        User existingChanged = new User();
        existingChanged.setUsername("existingChanged");
        existingChanged.setPassword("oldHashed");
        existingChanged.setRole(UserRole.GUEST);

        User existingUnchanged = new User();
        existingUnchanged.setUsername("existingUnchanged");
        existingUnchanged.setPassword("sameHashed");
        existingUnchanged.setRole(UserRole.GUEST);

        User invalidRoleExisting = new User();
        invalidRoleExisting.setUsername("invalidRoleExisting");
        invalidRoleExisting.setPassword("sameHashed");
        invalidRoleExisting.setRole(UserRole.GUEST);

        when(userRepository.findByUsername("newadmin")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("existingChanged")).thenReturn(Optional.of(existingChanged));
        when(userRepository.findByUsername("existingUnchanged")).thenReturn(Optional.of(existingUnchanged));
        when(userRepository.findByUsername("invalidRoleExisting")).thenReturn(Optional.of(invalidRoleExisting));
        when(userRepository.findByUsername("invalidRoleNew")).thenReturn(Optional.empty());

        when(passwordEncoder.encode(any())).thenReturn("encodedPw");
        when(passwordEncoder.matches("newpw", "oldHashed")).thenReturn(false);
        when(passwordEncoder.matches("samepw", "sameHashed")).thenReturn(true);

        // WHEN
        dataInitializer.run();

        // THEN
        verify(userRepository, times(2)).save(any(User.class));
        assertThat(existingChanged.getRole()).isEqualTo(UserRole.PRIVILEGED_GUEST);
        assertThat(existingChanged.getPassword()).isEqualTo("encodedPw");
    }
}