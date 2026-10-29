package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.service.GedcomImportSessionService;
import lombok.RequiredArgsConstructor;
import org.gedcom4j.exception.GedcomParserException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/gedcom/import/sessions")
@RequiredArgsConstructor
public class GedcomImportController {

    private final GedcomImportSessionService sessionService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportSessionResponseDto> createSession(@RequestParam("file") MultipartFile file) throws Exception {
        ImportSessionResponseDto response = sessionService.createSession(file.getInputStream(), file.getOriginalFilename());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<ImportSessionHistoryItemDto>> getImportHistory() {
        return ResponseEntity.ok(sessionService.getImportHistory());
    }

    @GetMapping("/active")
    public ResponseEntity<ImportSessionResponseDto> getActiveSession() {
        return sessionService.getActiveSession()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<ImportSessionResponseDto> getSession(@PathVariable Long sessionId) {
        return ResponseEntity.ok(sessionService.getSession(sessionId));
    }

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> cancelSession(@PathVariable Long sessionId) {
        sessionService.cancelSession(sessionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/lookup/people")
    public ResponseEntity<List<PersonMatchCandidateDto>> lookupPeople(
            @RequestParam(name = "query", required = false) String query
    ) {
        return ResponseEntity.ok(sessionService.searchPeopleCandidates(query));
    }

    @GetMapping("/lookup/families")
    public ResponseEntity<List<FamilyMatchCandidateDto>> lookupFamilies(
            @RequestParam(name = "query", required = false) String query
    ) {
        return ResponseEntity.ok(sessionService.searchFamilyCandidates(query));
    }

    @PostMapping("/{sessionId}/individuals")
    public ResponseEntity<ImportSessionResponseDto> confirmIndividuals(
            @PathVariable Long sessionId,
            @RequestBody List<IndividualDecisionDto> decisions
    ) {
        return ResponseEntity.ok(sessionService.confirmIndividuals(sessionId, decisions));
    }

    @PostMapping("/{sessionId}/families")
    public ResponseEntity<ImportSessionResponseDto> confirmFamilies(
            @PathVariable Long sessionId,
            @RequestBody List<FamilyDecisionDto> decisions
    ) {
        return ResponseEntity.ok(sessionService.confirmFamilies(sessionId, decisions));
    }

    @PostMapping("/{sessionId}/apply")
    public ResponseEntity<ImportSessionResponseDto> applySession(
            @PathVariable Long sessionId,
            @RequestBody(required = false) List<AbsentPersonDecisionDto> absentPersonDecisions
    ) {
        return ResponseEntity.ok(sessionService.applySession(sessionId, absentPersonDecisions));
    }

    @PostMapping("/{sessionId}/restore")
    public ResponseEntity<ImportSessionResponseDto> restoreSession(@PathVariable Long sessionId) {
        return ResponseEntity.ok(sessionService.restoreSession(sessionId));
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            IllegalStateException.class,
            GedcomParserException.class
    })
    public ResponseEntity<ErrorResponse> handleBadRequest(Exception ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("INVALID_IMPORT_REQUEST", ex.getMessage()));
    }

    @DeleteMapping("/reset-tree")
    public ResponseEntity<Void> resetTreeData() {
        sessionService.resetTreeData();
        return ResponseEntity.noContent().build();
    }
}