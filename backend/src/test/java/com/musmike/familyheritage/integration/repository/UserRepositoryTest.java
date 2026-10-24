package com.musmike.familyheritage.integration.repository;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;


public class UserRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldFindUserByUsernameWhenUserExists() {
        // GIVEN
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password");
        user.setRole(UserRole.GUEST);
        userRepository.save(user);

        // WHEN
        Optional<User> foundUser = userRepository.findByUsername("testuser");

        // THEN
        assertTrue(foundUser.isPresent());
        assertEquals("testuser", foundUser.get().getUsername());
    }

    @Test
    void shouldReturnEmptyWhenUserDoesNotExist() {
        // WHEN
        Optional<User> foundUser = userRepository.findByUsername("nonexistent");

        // THEN
        assertFalse(foundUser.isPresent());
    }
}