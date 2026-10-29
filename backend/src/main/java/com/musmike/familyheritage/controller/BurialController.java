package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.enums.PersonSex;
import com.musmike.familyheritage.service.BurialService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/burials")
@RequiredArgsConstructor
public class BurialController {

    private final BurialService burialService;

    @GetMapping
    public ResponseEntity<BurialsOverviewDto> getBurialsOverview(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "sex", required = false) PersonSex sex,
            @RequestParam(name = "includeNonCurrent", defaultValue = "false") boolean includeNonCurrent,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "sortBy", defaultValue = "SURNAME_ASC") String sortBy
    ) {
        return ResponseEntity.ok(
                burialService.getBurialsOverview(
                        search, sex, includeNonCurrent, includeArchived, sortBy, isCurrentUserAdmin()
                )
        );
    }

    @GetMapping("/graves/{graveId}")
    public ResponseEntity<GraveGroupDto> getGraveDetails(@PathVariable Long graveId) {
        return ResponseEntity.ok(burialService.getGraveDetails(graveId, isCurrentUserAdmin()));
    }

    @PostMapping("/cemeteries")
    public ResponseEntity<CemeteryGroupDto> createCemetery(@RequestBody SaveCemeteryRequestDto request) {
        ensureAdmin();
        return ResponseEntity.status(HttpStatus.CREATED).body(burialService.createCemetery(request));
    }

    @PutMapping("/cemeteries/{cemeteryId}")
    public ResponseEntity<CemeteryGroupDto> updateCemetery(
            @PathVariable Long cemeteryId,
            @RequestBody SaveCemeteryRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(burialService.updateCemetery(cemeteryId, request));
    }

    @DeleteMapping("/cemeteries/{cemeteryId}")
    public ResponseEntity<Void> deleteCemetery(@PathVariable Long cemeteryId) {
        ensureAdmin();
        burialService.deleteCemetery(cemeteryId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/cemeteries/{cemeteryId}/assign-graves")
    public ResponseEntity<Void> assignGravesToCemetery(
            @PathVariable Long cemeteryId,
            @RequestBody BulkAssignGravesRequestDto request
    ) {
        ensureAdmin();
        burialService.assignGravesToCemetery(cemeteryId, request.getGraveIds());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/graves")
    public ResponseEntity<GraveGroupDto> createGrave(@RequestBody SaveGraveRequestDto request) {
        ensureAdmin();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(burialService.createGrave(request, true));
    }

    @PutMapping("/graves/{graveId}")
    public ResponseEntity<GraveGroupDto> updateGrave(
            @PathVariable Long graveId,
            @RequestBody SaveGraveRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(burialService.updateGrave(graveId, request, true));
    }

    @DeleteMapping("/graves/{graveId}")
    public ResponseEntity<Void> deleteGrave(@PathVariable Long graveId) {
        ensureAdmin();
        burialService.deleteGrave(graveId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/graves/{graveId}/people")
    public ResponseEntity<GraveGroupDto> addPersonToGrave(
            @PathVariable Long graveId,
            @RequestBody AddPersonToGraveRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(burialService.addPersonToGrave(graveId, request, true));
    }

    @PutMapping("/items/{burialId}/toggle-current")
    public ResponseEntity<GraveGroupDto> toggleBurialCurrent(@PathVariable Long burialId) {
        ensureAdmin();
        return ResponseEntity.ok(burialService.toggleBurialCurrent(burialId, true));
    }

    @PostMapping("/items/{burialId}/split")
    public ResponseEntity<GraveGroupDto> splitBurialToNewGrave(@PathVariable Long burialId) {
        ensureAdmin();
        return ResponseEntity.ok(burialService.splitBurialToNewGrave(burialId, true));
    }

    @DeleteMapping("/items/{burialId}")
    public ResponseEntity<Void> removeBurialFromGrave(@PathVariable Long burialId) {
        ensureAdmin();
        burialService.removeBurialFromGrave(burialId);
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

    private void ensureAdmin() {
        if (!isCurrentUserAdmin()) {
            throw new AccessDeniedException("Admin privileges required.");
        }
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
