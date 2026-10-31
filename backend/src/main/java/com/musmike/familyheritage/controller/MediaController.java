package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.enums.MediaPrimaryContext;
import com.musmike.familyheritage.model.enums.MediaType;
import com.musmike.familyheritage.service.MediaService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    @GetMapping("/gallery")
    public ResponseEntity<MediaGalleryPageDto> getGalleryPage(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "mediaType", required = false) MediaType mediaType,
            @RequestParam(name = "primaryContext", required = false) MediaPrimaryContext primaryContext,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "personIds", required = false) String personIdsParam,
            @RequestParam(name = "matchAllPersons", defaultValue = "true") boolean matchAllPersons,
            @RequestParam(name = "datedMode", defaultValue = "ALL") String datedMode,
            @RequestParam(name = "sortBy", defaultValue = "NEWEST_UPLOAD") String sortBy,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "36") int size
    ) {
        List<Long> personIds = parseIdsList(personIdsParam);
        return ResponseEntity.ok(
                mediaService.getGalleryPage(
                        search, mediaType, primaryContext, collectionId, personIds, matchAllPersons,
                        datedMode, sortBy, page, size, isCurrentUserAdmin()
                )
        );
    }

    @GetMapping("/collections")
    public ResponseEntity<List<MediaCollectionDto>> getAllCollections() {
        return ResponseEntity.ok(mediaService.getAllCollections());
    }

    @PostMapping("/collections")
    public ResponseEntity<MediaCollectionDto> createCollection(@RequestBody SaveMediaCollectionRequestDto request) {
        ensureAdmin();
        return ResponseEntity.status(HttpStatus.CREATED).body(mediaService.createCollection(request));
    }

    @DeleteMapping("/collections/{collectionId}")
    public ResponseEntity<Void> deleteCollection(@PathVariable Long collectionId) {
        ensureAdmin();
        mediaService.deleteCollection(collectionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/preview-filename")
    public ResponseEntity<MediaFilenamePreviewDto> previewFilename(
            @RequestParam("primaryContext") MediaPrimaryContext primaryContext,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "personId", required = false) Long personId,
            @RequestParam(name = "eventId", required = false) Long eventId,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "customYear", required = false) Integer customYear,
            @RequestParam(name = "customFileName", required = false) String customFileName,
            @RequestParam(name = "originalFilename", required = false) String originalFilename,
            @RequestParam(name = "mimeType", required = false) String mimeType
    ) {
        ensureAdmin();
        return ResponseEntity.ok(
                mediaService.previewFilename(
                        primaryContext, graveId, personId, eventId, collectionId, customYear, customFileName, originalFilename, mimeType
                )
        );
    }

    @PostMapping(value = "/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaItemDto> uploadMedia(
            @RequestParam("file") MultipartFile file,
            @RequestParam("primaryContext") MediaPrimaryContext primaryContext,
            @RequestParam(name = "customFileName", required = false) String customFileName,
            @RequestParam(name = "title", required = false) String title,
            @RequestParam(name = "description", required = false) String description,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "eventId", required = false) Long eventId,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "customYear", required = false) Integer customYear,
            @RequestParam(name = "personIds", required = false) String personIdsParam,
            @RequestParam(name = "setAsPersonAvatar", defaultValue = "false") boolean setAsPersonAvatar,
            @RequestParam(name = "setAsGravePrimary", defaultValue = "false") boolean setAsGravePrimary
    ) throws IOException {
        ensureAdmin();
        List<Long> personIds = parseIdsList(personIdsParam);

        MediaItemDto created = mediaService.uploadMedia(
                file,
                primaryContext,
                customFileName,
                title,
                description,
                graveId,
                eventId,
                collectionId,
                customYear,
                personIds,
                setAsPersonAvatar,
                setAsGravePrimary
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping(value = "/upload-batch", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<MediaItemDto>> uploadBatchMedia(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("primaryContext") MediaPrimaryContext primaryContext,
            @RequestParam(name = "customFileNames", required = false) List<String> customFileNames,
            @RequestParam(name = "titles", required = false) List<String> titles,
            @RequestParam(name = "customYears", required = false) List<Integer> customYears,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "eventId", required = false) Long eventId,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "defaultYear", required = false) Integer defaultYear,
            @RequestParam(name = "personIds", required = false) String personIdsParam
    ) throws IOException {
        ensureAdmin();
        List<Long> personIds = parseIdsList(personIdsParam);

        List<MediaItemDto> created = mediaService.uploadBatchMedia(
                files,
                primaryContext,
                customFileNames,
                titles,
                customYears,
                graveId,
                eventId,
                collectionId,
                defaultYear,
                personIds
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{mediaId}")
    public ResponseEntity<MediaItemDto> updateMedia(
            @PathVariable Long mediaId,
            @RequestBody UpdateMediaItemRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.updateMedia(mediaId, request));
    }

    @DeleteMapping("/{mediaId}")
    public ResponseEntity<Void> deleteMedia(@PathVariable Long mediaId) {
        ensureAdmin();
        mediaService.deleteMedia(mediaId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/by-grave/{graveId}")
    public ResponseEntity<List<MediaItemDto>> getMediaByGrave(@PathVariable Long graveId) {
        return ResponseEntity.ok(mediaService.getMediaByGrave(graveId, isCurrentUserAdmin()));
    }

    @GetMapping("/by-person/{personId}")
    public ResponseEntity<List<MediaItemDto>> getMediaByPerson(@PathVariable Long personId) {
        return ResponseEntity.ok(mediaService.getMediaByPerson(personId, isCurrentUserAdmin()));
    }

    @GetMapping("/by-event/{eventId}")
    public ResponseEntity<EventMediaOverviewDto> getMediaByEvent(@PathVariable Long eventId) {
        return ResponseEntity.ok(mediaService.getMediaByEventWithSubEvents(eventId, isCurrentUserAdmin()));
    }

    @GetMapping("/{mediaId}/file")
    public ResponseEntity<Resource> serveFile(@PathVariable Long mediaId) {
        Resource resource = mediaService.getMediaFileResource(mediaId);
        String mimeType = mediaService.getMimeType(mediaId);
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(mimeType))
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate())
                .body(resource);
    }

    @GetMapping("/{mediaId}/thumbnail")
    public ResponseEntity<Resource> serveThumbnail(@PathVariable Long mediaId) {
        Resource resource = mediaService.getThumbnailResource(mediaId);
        String mime = mediaService.getMimeType(mediaId);
        org.springframework.http.MediaType contentType =
                (mime != null && mime.toLowerCase().contains("gif"))
                        ? org.springframework.http.MediaType.IMAGE_GIF
                        : org.springframework.http.MediaType.IMAGE_JPEG;
        return ResponseEntity.ok()
                .contentType(contentType)
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePrivate())
                .body(resource);
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

    private List<Long> parseIdsList(String rawParam) {
        if (rawParam == null || rawParam.isBlank()) {
            return List.of();
        }
        return Arrays.stream(rawParam.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::valueOf)
                .toList();
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