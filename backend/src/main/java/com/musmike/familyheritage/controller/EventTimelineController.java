package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.ErrorResponse;
import com.musmike.familyheritage.dto.EventsTimelinePageDto;
import com.musmike.familyheritage.dto.TimelineEventDto;
import com.musmike.familyheritage.dto.UpdateEventDetailsRequestDto;
import com.musmike.familyheritage.service.EventTimelineService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/events")
@RequiredArgsConstructor
public class EventTimelineController {

    private final EventTimelineService timelineService;

    @GetMapping
    public ResponseEntity<EventsTimelinePageDto> getEventsTimeline(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "types", required = false) String typesParam,
            @RequestParam(name = "yearFrom", required = false) Integer yearFrom,
            @RequestParam(name = "yearTo", required = false) Integer yearTo,
            @RequestParam(name = "includeUndated", defaultValue = "true") boolean includeUndated,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "sortOrder", defaultValue = "ASC") String sortOrder,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "5000") int size
    ) {
        List<String> types = (typesParam == null || typesParam.isBlank())
                ? List.of()
                : Arrays.asList(typesParam.split(","));

        return ResponseEntity.ok(
                timelineService.getEventsTimeline(
                        search, types, yearFrom, yearTo, includeUndated, includeArchived, sortOrder, page, size
                )
        );
    }

    @GetMapping("/{eventId}")
    public ResponseEntity<TimelineEventDto> getEventById(@PathVariable Long eventId) {
        return ResponseEntity.ok(timelineService.getEventById(eventId));
    }

    @PutMapping("/{eventId}/details")
    public ResponseEntity<TimelineEventDto> updateEventDetails(
            @PathVariable Long eventId,
            @RequestBody UpdateEventDetailsRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(timelineService.updateEventDetails(eventId, request));
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