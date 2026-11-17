package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.*;
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
            @RequestParam(name = "sortOrder", defaultValue = "DESC") String sortOrder,
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

    @GetMapping("/types")
    public ResponseEntity<List<EventTypeOptionDto>> getAvailableEventTypes() {
        return ResponseEntity.ok(timelineService.getAvailableEventTypes());
    }

    @GetMapping("/{eventId}")
    public ResponseEntity<TimelineEventDto> getEventById(@PathVariable Long eventId) {
        return ResponseEntity.ok(timelineService.getEventById(eventId));
    }

    @PostMapping
    public ResponseEntity<TimelineEventDto> createEvent(@RequestBody SaveEventRequestDto request) {
        ensureAdmin();
        return ResponseEntity.status(HttpStatus.CREATED).body(timelineService.createEvent(request));
    }

    @PutMapping("/{eventId}")
    public ResponseEntity<TimelineEventDto> updateEvent(
            @PathVariable Long eventId,
            @RequestBody SaveEventRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(timelineService.updateEvent(eventId, request));
    }

    @PutMapping("/{eventId}/details")
    public ResponseEntity<TimelineEventDto> updateEventDetails(
            @PathVariable Long eventId,
            @RequestBody UpdateEventDetailsRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(timelineService.updateEventDetails(eventId, request));
    }

    @DeleteMapping("/{eventId}")
    public ResponseEntity<Void> deleteEvent(@PathVariable Long eventId) {
        ensureAdmin();
        timelineService.deleteEvent(eventId);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadRequestOrNotFound(IllegalArgumentException ex) {
        String msg = ex.getMessage() != null ? ex.getMessage() : "Invalid request";
        if (msg.contains("not found") || msg.contains("Nie znaleziono")) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponse("NOT_FOUND", msg));
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("BAD_REQUEST", msg));
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
