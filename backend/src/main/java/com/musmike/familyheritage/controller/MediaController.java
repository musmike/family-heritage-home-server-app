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

    @PutMapping("/collections/{collectionId}")
    public ResponseEntity<MediaCollectionDto> updateCollection(
            @PathVariable Long collectionId,
            @RequestBody SaveMediaCollectionRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.updateCollection(collectionId, request));
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
            @RequestParam(name = "customFolderName", required = false) String customFolderName,
            @RequestParam(name = "customFileName", required = false) String customFileName,
            @RequestParam(name = "originalFilename", required = false) String originalFilename,
            @RequestParam(name = "mimeType", required = false) String mimeType,
            @RequestParam(name = "portraitMedia", required = false) Boolean portraitMedia,
            @RequestParam(name = "unknownMedia", required = false) Boolean unknownMedia,
            @RequestParam(name = "personsCount", required = false) Integer personsCount
    ) {
        ensureAdmin();
        return ResponseEntity.ok(
                mediaService.previewFilenameWithFolder(
                        primaryContext, graveId, personId, eventId, collectionId,
                        customYear, customFolderName, customFileName, originalFilename, mimeType,
                        portraitMedia, unknownMedia, personsCount
                )
        );
    }

    @PostMapping(value = "/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaItemDto> uploadMedia(
            @RequestParam("file") MultipartFile file,
            @RequestParam("primaryContext") MediaPrimaryContext primaryContext,
            @RequestParam(name = "customFolderName", required = false) String customFolderName,
            @RequestParam(name = "customFileName", required = false) String customFileName,
            @RequestParam(name = "title", required = false) String title,
            @RequestParam(name = "inscriptionText", required = false) String inscriptionText,
            @RequestParam(name = "description", required = false) String description,
            @RequestParam(name = "sourceText", required = false) String sourceText,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "eventId", required = false) Long eventId,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "portraitMedia", required = false) Boolean portraitMedia,
            @RequestParam(name = "unknownMedia", required = false) Boolean unknownMedia,
            @RequestParam(name = "isBetweenRange", defaultValue = "false") boolean isBetweenRange,
            @RequestParam(name = "dateQualifier", required = false) String dateQualifier,
            @RequestParam(name = "customYear", required = false) Integer customYear,
            @RequestParam(name = "customMonth", required = false) Integer customMonth,
            @RequestParam(name = "customDay", required = false) Integer customDay,
            @RequestParam(name = "timeQualifier", required = false) String timeQualifier,
            @RequestParam(name = "customHour", required = false) Integer customHour,
            @RequestParam(name = "customMinute", required = false) Integer customMinute,
            @RequestParam(name = "customSecond", required = false) Integer customSecond,
            @RequestParam(name = "rangeEndQualifier", required = false) String rangeEndQualifier,
            @RequestParam(name = "rangeEndYear", required = false) Integer rangeEndYear,
            @RequestParam(name = "rangeEndMonth", required = false) Integer rangeEndMonth,
            @RequestParam(name = "rangeEndDay", required = false) Integer rangeEndDay,
            @RequestParam(name = "rangeEndTimeQualifier", required = false) String rangeEndTimeQualifier,
            @RequestParam(name = "rangeEndHour", required = false) Integer rangeEndHour,
            @RequestParam(name = "rangeEndMinute", required = false) Integer rangeEndMinute,
            @RequestParam(name = "rangeEndSecond", required = false) Integer rangeEndSecond,
            @RequestParam(name = "selectedMetadataSourceTag", required = false) String selectedMetadataSourceTag,
            @RequestParam(name = "clientLastModifiedMs", required = false) Long clientLastModifiedMs,
            @RequestParam(name = "personIds", required = false) String personIdsParam,
            @RequestParam(name = "setAsPersonAvatar", defaultValue = "false") boolean setAsPersonAvatar,
            @RequestParam(name = "setAsGravePrimary", defaultValue = "false") boolean setAsGravePrimary
    ) throws IOException {
        ensureAdmin();
        List<Long> personIds = parseIdsList(personIdsParam);

        MediaItemDto created = mediaService.uploadMediaExtended(
                file,
                primaryContext,
                customFolderName,
                customFileName,
                title,
                inscriptionText,
                description,
                sourceText,
                graveId,
                eventId,
                collectionId,
                portraitMedia,
                unknownMedia,
                isBetweenRange,
                dateQualifier,
                customYear,
                customMonth,
                customDay,
                timeQualifier,
                customHour,
                customMinute,
                customSecond,
                rangeEndQualifier,
                rangeEndYear,
                rangeEndMonth,
                rangeEndDay,
                rangeEndTimeQualifier,
                rangeEndHour,
                rangeEndMinute,
                rangeEndSecond,
                selectedMetadataSourceTag,
                clientLastModifiedMs,
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
            @RequestParam(name = "customFolderName", required = false) String customFolderName,
            @RequestParam(name = "customFileNames", required = false) List<String> customFileNames,
            @RequestParam(name = "titles", required = false) List<String> titles,
            @RequestParam(name = "customYears", required = false) List<Integer> customYears,
            @RequestParam(name = "customMonths", required = false) List<Integer> customMonths,
            @RequestParam(name = "customDays", required = false) List<Integer> customDays,
            @RequestParam(name = "customHours", required = false) List<Integer> customHours,
            @RequestParam(name = "customMinutes", required = false) List<Integer> customMinutes,
            @RequestParam(name = "customSeconds", required = false) List<Integer> customSeconds,
            @RequestParam(name = "selectedMetadataSourceTags", required = false) List<String> selectedMetadataSourceTags,
            @RequestParam(name = "clientLastModifiedList", required = false) List<Long> clientLastModifiedList,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "eventId", required = false) Long eventId,
            @RequestParam(name = "collectionId", required = false) Long collectionId,
            @RequestParam(name = "portraitMedia", required = false) Boolean portraitMedia,
            @RequestParam(name = "unknownMedia", required = false) Boolean unknownMedia,
            @RequestParam(name = "defaultYear", required = false) Integer defaultYear,
            @RequestParam(name = "personIds", required = false) String personIdsParam
    ) throws IOException {
        ensureAdmin();
        List<Long> personIds = parseIdsList(personIdsParam);

        List<MediaItemDto> created = mediaService.uploadBatchMediaExtended(
                files,
                primaryContext,
                customFolderName,
                customFileNames,
                titles,
                customYears,
                customMonths,
                customDays,
                customHours,
                customMinutes,
                customSeconds,
                selectedMetadataSourceTags,
                clientLastModifiedList,
                graveId,
                eventId,
                collectionId,
                portraitMedia,
                unknownMedia,
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

    @PostMapping(value = "/{mediaId}/versions", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaItemDto> uploadMediaVersion(
            @PathVariable Long mediaId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "versionType", defaultValue = "RESTORED") String versionType,
            @RequestParam(name = "versionLabel", required = false) String versionLabel,
            @RequestParam(name = "setAsMain", defaultValue = "true") boolean setAsMain
    ) throws IOException {
        ensureAdmin();
        return ResponseEntity.status(HttpStatus.CREATED).body(
                mediaService.uploadMediaVersion(mediaId, file, versionType, versionLabel, setAsMain)
        );
    }

    @PutMapping("/{mediaId}/versions/{versionId}/set-main")
    public ResponseEntity<MediaItemDto> setMainMediaVersion(
            @PathVariable Long mediaId,
            @PathVariable Long versionId
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.setMainMediaVersion(mediaId, versionId));
    }

    @DeleteMapping("/{mediaId}/versions/{versionId}")
    public ResponseEntity<MediaItemDto> deleteMediaVersion(
            @PathVariable Long mediaId,
            @PathVariable Long versionId
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.deleteMediaVersion(mediaId, versionId));
    }

    @GetMapping("/{mediaId}/versions/{versionId}/file")
    public ResponseEntity<Resource> serveVersionFile(
            @PathVariable Long mediaId,
            @PathVariable Long versionId
    ) {
        Resource resource = mediaService.getMediaVersionFileResource(mediaId, versionId);
        String mimeType = mediaService.getVersionMimeType(versionId);
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(mimeType))
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate())
                .body(resource);
    }

    @PutMapping("/bulk-update")
    public ResponseEntity<List<MediaItemDto>> bulkUpdateMedia(
            @RequestBody BulkUpdateMediaRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.bulkUpdateMedia(request));
    }

    @PostMapping("/link-existing")
    public ResponseEntity<List<MediaItemDto>> linkExistingMedia(
            @RequestBody LinkExistingMediaRequestDto request
    ) {
        ensureAdmin();
        return ResponseEntity.ok(mediaService.linkExistingMedia(request));
    }

    @DeleteMapping("/{mediaId}/unlink")
    public ResponseEntity<Void> unlinkMediaFromContext(
            @PathVariable Long mediaId,
            @RequestParam(name = "graveId", required = false) Long graveId,
            @RequestParam(name = "personId", required = false) Long personId,
            @RequestParam(name = "eventId", required = false) Long eventId
    ) {
        ensureAdmin();
        mediaService.unlinkMediaFromContext(mediaId, graveId, personId, eventId);
        return ResponseEntity.noContent().build();
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
        boolean hasCustomThumb = mediaService.hasThumbnail(mediaId);
        org.springframework.http.MediaType contentType;
        if (hasCustomThumb) {
            contentType = org.springframework.http.MediaType.IMAGE_JPEG;
        } else if (mime != null) {
            try {
                contentType = org.springframework.http.MediaType.parseMediaType(mime);
            } catch (Exception ignored) {
                contentType = org.springframework.http.MediaType.IMAGE_JPEG;
            }
        } else {
            contentType = org.springframework.http.MediaType.IMAGE_JPEG;
        }
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