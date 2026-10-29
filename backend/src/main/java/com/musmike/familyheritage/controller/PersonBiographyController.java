package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.*;
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
        return ResponseEntity.ok(
                biographyService.listPeople(search, sex, lifeState, includeArchived, sortBy, page, size)
        );
    }

    @GetMapping("/{personId}")
    public ResponseEntity<PersonBiographyDto> getBiography(@PathVariable Long personId) {
        return ResponseEntity.ok(biographyService.getBiography(personId, isCurrentUserAdmin()));
    }

    @PutMapping("/{personId}/biography-content")
    public ResponseEntity<PersonBiographyDto> updateBiographyContent(
            @PathVariable Long personId,
            @RequestBody UpdateBiographyContentRequestDto request
    ) {
        if (!isCurrentUserAdmin()) {
            throw new AccessDeniedException("Only ADMIN can edit person biography content.");
        }
        return ResponseEntity.ok(
                biographyService.updateBiographyContent(personId, request.getBiographyContent(), true)
        );
    }

    @GetMapping("/{personId}/ancestor-tree")
    public ResponseEntity<AncestorTreeNodeDto> getAncestorTree(
            @PathVariable Long personId,
            @RequestParam(name = "generations", defaultValue = "3") int generations
    ) {
        return ResponseEntity.ok(biographyService.getAncestorTree(personId, generations));
    }

    @GetMapping("/default-proband")
    public ResponseEntity<PersonListItemDto> getDefaultProband() {
        return biographyService.getDefaultProband()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{personId}/default-proband")
    public ResponseEntity<PersonListItemDto> setDefaultProband(@PathVariable Long personId) {
        if (!isCurrentUserAdmin()) {
            throw new AccessDeniedException("Only ADMIN can set the default proband.");
        }
        return ResponseEntity.ok(biographyService.setDefaultProband(personId));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("NOT_FOUND", ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponse("FORBIDDEN", ex.getMessage()));
    }

    private boolean isCurrentUserAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) {
            return false;
        }
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.replaceFirst("^ROLE_", "").toUpperCase())
                .anyMatch("ADMIN"::equals);
    }
}