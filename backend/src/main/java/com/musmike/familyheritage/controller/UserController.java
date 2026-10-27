package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.AssignPersonRequestDto;
import com.musmike.familyheritage.dto.ErrorResponse;
import com.musmike.familyheritage.dto.SaveUserRequestDto;
import com.musmike.familyheritage.dto.UserDto;
import com.musmike.familyheritage.dto.UserPersonAssignmentDto;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.UserRole;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.repository.UserRepository;
import com.musmike.familyheritage.service.ActivityLogService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final PersonRepository personRepository;
    private final PasswordEncoder passwordEncoder;
    private final ActivityLogService activityLogService;

    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null ||
                !authentication.isAuthenticated() ||
                "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String username = authentication.getName();
        List<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        UserDto userDto = new UserDto(username, roles);
        return ResponseEntity.ok(userDto);
    }

    @GetMapping
    @Transactional
    public ResponseEntity<List<UserPersonAssignmentDto>> getAllUsers() {
        ensureAdmin();
        List<UserPersonAssignmentDto> result = userRepository.findAll().stream()
                .sorted(Comparator.comparing(User::getUsername, String.CASE_INSENSITIVE_ORDER))
                .map(this::toAssignmentDto)
                .toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/assignable")
    @Transactional
    public ResponseEntity<List<UserPersonAssignmentDto>> getAssignableUsers() {
        ensureAdmin();
        List<UserPersonAssignmentDto> result = userRepository.findAll().stream()
                .filter(u -> u.getRole() != UserRole.GUEST)
                .sorted(Comparator.comparing(User::getUsername, String.CASE_INSENSITIVE_ORDER))
                .map(this::toAssignmentDto)
                .toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<UserPersonAssignmentDto> createUser(@RequestBody SaveUserRequestDto request) {
        ensureAdmin();
        validateUsernameAndRole(request.getUsername(), request.getRole(), null);
        if (request.getPassword() == null || request.getPassword().isBlank()) {
            throw new IllegalArgumentException("Password is required when creating a new user.");
        }

        UserRole role = UserRole.valueOf(request.getRole().trim().toUpperCase());
        if (role == UserRole.GUEST && request.getPersonId() != null) {
            throw new IllegalArgumentException("Cannot assign a person to a universal GUEST account.");
        }

        User newUser = new User();
        newUser.setUsername(request.getUsername().trim());
        newUser.setPassword(passwordEncoder.encode(request.getPassword()));
        newUser.setRole(role);

        if (request.getPersonId() != null) {
            Person person = personRepository.findById(request.getPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + request.getPersonId()));
            newUser.setPerson(person);
        }

        newUser = userRepository.saveAndFlush(newUser);

        activityLogService.logActivity(
                com.musmike.familyheritage.model.enums.ActivityActionType.USER_CREATED,
                "Utworzono konto użytkownika: " + newUser.getUsername() + " (rola: " + newUser.getRole().name() + ")",
                "USER",
                newUser.getId()
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(toAssignmentDto(newUser));
    }

    @PutMapping("/{userId}")
    @Transactional
    public ResponseEntity<UserPersonAssignmentDto> updateUser(
            @PathVariable Long userId,
            @RequestBody SaveUserRequestDto request
    ) {
        ensureAdmin();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        validateUsernameAndRole(request.getUsername(), request.getRole(), userId);
        UserRole role = UserRole.valueOf(request.getRole().trim().toUpperCase());

        if (role == UserRole.GUEST && request.getPersonId() != null) {
            throw new IllegalArgumentException("Cannot assign a person to a universal GUEST account.");
        }

        user.setUsername(request.getUsername().trim());
        user.setRole(role);

        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        if (role == UserRole.GUEST || request.getPersonId() == null) {
            user.setPerson(null);
        } else {
            Person person = personRepository.findById(request.getPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + request.getPersonId()));
            user.setPerson(person);
        }

        user = userRepository.saveAndFlush(user);

        activityLogService.logActivity(
                com.musmike.familyheritage.model.enums.ActivityActionType.USER_UPDATED,
                "Zaktualizowano konto użytkownika: " + user.getUsername(),
                "USER",
                user.getId()
        );

        return ResponseEntity.ok(toAssignmentDto(user));
    }

    @PutMapping("/{userId}/person")
    @Transactional
    public ResponseEntity<UserPersonAssignmentDto> assignPersonToUser(
            @PathVariable Long userId,
            @RequestBody AssignPersonRequestDto request
    ) {
        ensureAdmin();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        if (user.getRole() == UserRole.GUEST) {
            throw new IllegalArgumentException("Cannot assign a person to a universal GUEST account.");
        }

        if (request.getPersonId() == null) {
            user.setPerson(null);
        } else {
            Person person = personRepository.findById(request.getPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + request.getPersonId()));
            user.setPerson(person);
        }

        user = userRepository.saveAndFlush(user);
        return ResponseEntity.ok(toAssignmentDto(user));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> deleteUser(@PathVariable Long userId) {
        ensureAdmin();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && user.getUsername().equalsIgnoreCase(auth.getName())) {
            throw new IllegalArgumentException("Cannot delete your own currently logged-in account.");
        }

        userRepository.delete(user);
        userRepository.flush();

        activityLogService.logActivity(
                com.musmike.familyheritage.model.enums.ActivityActionType.USER_DELETED,
                "Usunięto konto użytkownika: " + user.getUsername(),
                "USER",
                null
        );

        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponse("FORBIDDEN", ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("BAD_REQUEST", ex.getMessage()));
    }

    private void validateUsernameAndRole(String username, String roleStr, Long currentUserId) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("Username cannot be blank.");
        }
        if (roleStr == null || roleStr.isBlank()) {
            throw new IllegalArgumentException("Role cannot be blank.");
        }
        try {
            UserRole.valueOf(roleStr.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid role: " + roleStr);
        }

        Optional<User> existing = userRepository.findByUsername(username.trim());
        if (existing.isPresent() && !existing.get().getId().equals(currentUserId)) {
            throw new IllegalArgumentException("Username is already taken: " + username.trim());
        }
    }

    private UserPersonAssignmentDto toAssignmentDto(User u) {
        Person p = u.getPerson();
        return UserPersonAssignmentDto.builder()
                .userId(u.getId())
                .username(u.getUsername())
                .role(u.getRole().name())
                .personId(p != null ? p.getId() : null)
                .personGivenName(p != null ? p.getCachedGivenName() : null)
                .personSurname(p != null ? p.getCachedSurname() : null)
                .build();
    }

    private void ensureAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAdmin = auth != null && auth.getAuthorities() != null &&
                auth.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority)
                        .map(a -> a.replaceFirst("^ROLE_", "").toUpperCase())
                        .anyMatch("ADMIN"::equals);
        if (!isAdmin) {
            throw new AccessDeniedException("Admin privileges required.");
        }
    }
}