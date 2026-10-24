package com.musmike.familyheritage.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.UserSeedDto;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;

@Component
@Slf4j
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    @Value("${app.seed-users-json:}")
    private String seedUsersJson;

    @Override
    public void run(String... args) {
        if (!StringUtils.hasText(seedUsersJson)) {
            log.info("SKIP: No seed user data found in configuration.");
            return;
        }

        try {
            List<UserSeedDto> usersToSeed = objectMapper.readValue(seedUsersJson, new TypeReference<>() {});
            int updatedCount = 0;

            for (UserSeedDto dto : usersToSeed) {
                if (processUser(dto)) {
                    updatedCount++;
                }
            }

            if (updatedCount > 0) {
                log.info("DataInitializer: Updated or created {} users.", updatedCount);
            } else {
                log.info("DataInitializer: All users are up-to-date. No database changes.");
            }

        } catch (Exception e) {
            log.error("CRITICAL: Error parsing seed-users-json: ", e);
        }
    }

    /**
     * @return true if the database was modified, false if skipped
     */
    private boolean processUser(UserSeedDto dto) {
        Optional<User> existingUserOpt = userRepository.findByUsername(dto.getUsername());

        // SCENARIO 1: User does not exist -> Create new
        if (existingUserOpt.isEmpty()) {
            createNewUser(dto);
            return true;
        }

        // SCENARIO 2: User exists -> Check if update is needed
        User existingUser = existingUserOpt.get();
        boolean needsUpdate = false;

        // 1. Check role
        try {
            UserRole vaultUserRole = UserRole.valueOf(dto.getRole());
            if (!existingUser.getRole().equals(vaultUserRole)) {
                log.info("Role changed for {}: {} -> {}", dto.getUsername(), existingUser.getRole(), vaultUserRole);
                existingUser.setRole(vaultUserRole);
                needsUpdate = true;
            }
        } catch (IllegalArgumentException e) {
            log.warn("Invalid role in Vault for user {}: {}", dto.getUsername(), dto.getRole());
        }

        // 2. Check password
        if (!passwordEncoder.matches(dto.getPassword(), existingUser.getPassword())) {
            log.info("Password change detected in Vault for user: {}", dto.getUsername());
            existingUser.setPassword(passwordEncoder.encode(dto.getPassword()));
            needsUpdate = true;
        }

        // Save only if something changed
        if (needsUpdate) {
            userRepository.save(existingUser);
            log.info("Saved changes for user: {}", dto.getUsername());
            return true;
        } else {
            log.debug("No changes for user: {}", dto.getUsername());
            return false;
        }
    }

    private void createNewUser(UserSeedDto dto) {
        try {
            User newUser = new User();
            newUser.setUsername(dto.getUsername());
            newUser.setPassword(passwordEncoder.encode(dto.getPassword()));
            newUser.setRole(UserRole.valueOf(dto.getRole()));
            userRepository.save(newUser);
            log.info("Created new user: {}", dto.getUsername());
        } catch (Exception e) {
            log.error("Failed to create user {}: {}", dto.getUsername(), e.getMessage());
        }
    }
}
