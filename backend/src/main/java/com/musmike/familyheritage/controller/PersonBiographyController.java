package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.AncestorTreeNodeDto;
import com.musmike.familyheritage.dto.BiographyPageDto;
import com.musmike.familyheritage.dto.ErrorResponse;
import com.musmike.familyheritage.dto.PersonBiographyDto;
import com.musmike.familyheritage.model.enums.LifeState;
import com.musmike.familyheritage.model.enums.PersonSex;
import com.musmike.familyheritage.service.PersonBiographyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/biographies")
@RequiredArgsConstructor
public class PersonBiographyController {

    private final PersonBiographyService biographyService;

    @GetMapping
    public ResponseEntity<BiographyPageDto> listPeople(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "sex", required = false) PersonSex sex,
            @RequestParam(name = "lifeState", required = false) LifeState lifeState,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "sortBy", defaultValue = "SURNAME_ASC") String sortBy,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "24") int size
    ) {
        boolean isGuest = isCurrentUserGuestOnly();
        return ResponseEntity.ok(
                biographyService.listPeople(search, sex, lifeState, includeArchived, sortBy, page, size, isGuest)
        );
    }

    @GetMapping("/{personId}")
    public ResponseEntity<PersonBiographyDto> getBiography(@PathVariable Long personId) {
        boolean isGuest = isCurrentUserGuestOnly();
        boolean isAdmin = isCurrentUserAdmin();
        return ResponseEntity.ok(biographyService.getBiography(personId, isGuest, isAdmin));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponse("FORBIDDEN", ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("NOT_FOUND", ex.getMessage()));
    }

    @GetMapping("/{personId}/ancestor-tree")
    public ResponseEntity<AncestorTreeNodeDto> getAncestorTree(
            @PathVariable Long personId,
            @RequestParam(name = "generations", defaultValue = "3") int generations
    ) {
        boolean isGuest = isCurrentUserGuestOnly();
        return ResponseEntity.ok(biographyService.getAncestorTree(personId, generations, isGuest));
    }

    private Set<String> getCurrentAuthorities() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) {
            return Set.of();
        }
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.replaceFirst("^ROLE_", "").toUpperCase())
                .collect(Collectors.toSet());
    }

    private boolean isCurrentUserAdmin() {
        return getCurrentAuthorities().contains("ADMIN");
    }

    private boolean isCurrentUserGuestOnly() {
        Set<String> roles = getCurrentAuthorities();
        return !roles.contains("ADMIN") && !roles.contains("PRIVILEGED_GUEST");
    }
}