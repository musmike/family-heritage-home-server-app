package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MediaService {

    private static final Pattern DATED_PATH_YEAR_PATTERN = Pattern.compile("^dated/\\d{4}s/(\\d{4})/");
    private static final Pattern LEADING_DATE_PREFIX_PATTERN = Pattern.compile("^\\d{4}(?:_\\d{2})?(?:_\\d{2})?_(.+)$");

    private final MediaItemRepository mediaItemRepository;
    private final MediaCollectionRepository mediaCollectionRepository;
    private final PersonRepository personRepository;
    private final GraveRepository graveRepository;
    private final BurialRepository burialRepository;
    private final EventRepository eventRepository;
    private final EventParentLinkRepository eventParentLinkRepository;
    private final TranslationRepository translationRepository;
    private final MediaStorageService storageService;
    private final MediaMetadataExtractor metadataExtractor;
    private final ActivityLogService activityLogService;

    @Transactional
    public MediaGalleryPageDto getGalleryPage(
            String search,
            MediaType mediaType,
            MediaPrimaryContext primaryContext,
            Long collectionId,
            List<Long> personIds,
            boolean matchAllPersons,
            String datedMode,
            String sortBy,
            int page,
            int size,
            boolean isAdmin
    ) {
        String normSearch = search != null ? search.trim().toLowerCase(Locale.ROOT) : "";
        Set<Long> filterPersonIds = (personIds == null || personIds.isEmpty())
                ? Set.of()
                : new HashSet<>(personIds);

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        List<MediaItem> allItems = mediaItemRepository.findAll();

        long totalImages = allItems.stream().filter(m -> m.getMediaType() == MediaType.IMAGE).count();
        long totalVideos = allItems.stream().filter(m -> m.getMediaType() == MediaType.VIDEO).count();

        List<MediaItemDto> filtered = allItems.stream()
                .filter(m -> mediaType == null || m.getMediaType() == mediaType)
                .filter(m -> primaryContext == null || m.getPrimaryContext() == primaryContext)
                .filter(m -> collectionId == null || (m.getCollection() != null && m.getCollection().getId().equals(collectionId)))
                .filter(m -> matchesPersonFilter(m, filterPersonIds, matchAllPersons))
                .map(m -> toDto(m, isAdmin, userCodeTranslations))
                .filter(dto -> matchesDatedMode(dto, datedMode))
                .filter(dto -> matchesGallerySearch(dto, normSearch))
                .sorted(buildGalleryComparator(sortBy))
                .toList();

        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        int totalElements = filtered.size();
        int totalPages = (int) Math.ceil((double) totalElements / safeSize);

        int fromIndex = Math.min(safePage * safeSize, totalElements);
        int toIndex = Math.min(fromIndex + safeSize, totalElements);
        List<MediaItemDto> pageContent = filtered.subList(fromIndex, toIndex);

        return MediaGalleryPageDto.builder()
                .content(pageContent)
                .page(safePage)
                .size(safeSize)
                .totalElements(totalElements)
                .totalPages(totalPages)
                .totalImagesCount(totalImages)
                .totalVideosCount(totalVideos)
                .collections(getAllCollections())
                .build();
    }

    @Transactional
    public List<MediaCollectionDto> getAllCollections() {
        return mediaCollectionRepository.findAll().stream()
                .sorted(Comparator.comparing(MediaCollection::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toCollectionDto)
                .toList();
    }

    @Transactional
    public MediaCollectionDto createCollection(SaveMediaCollectionRequestDto req) {
        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("Collection name cannot be blank.");
        }

        Person founder = null;
        if (req.getFounderPersonId() != null) {
            founder = personRepository.findById(req.getFounderPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + req.getFounderPersonId()));
        }

        String rawSlug = (req.getCustomSlug() != null && !req.getCustomSlug().isBlank())
                ? req.getCustomSlug()
                : req.getName();
        String baseSlug = storageService.toSnakeCase(rawSlug);
        String uniqueSlug = baseSlug;
        int counter = 2;
        while (mediaCollectionRepository.findBySlug(uniqueSlug).isPresent()) {
            uniqueSlug = baseSlug + "_" + counter++;
        }

        MediaCollection col = new MediaCollection();
        col.setName(req.getName().trim());
        col.setSlug(uniqueSlug);
        col.setDescription(trimToNull(req.getDescription()));
        col.setFounderPerson(founder);
        col = mediaCollectionRepository.saveAndFlush(col);

        return toCollectionDto(col);
    }

    @Transactional
    public void deleteCollection(Long collectionId) {
        MediaCollection col = mediaCollectionRepository.findById(collectionId)
                .orElseThrow(() -> new IllegalArgumentException("Collection not found: " + collectionId));

        for (MediaItem item : mediaItemRepository.findByCollectionId(collectionId)) {
            item.setCollection(null);
            mediaItemRepository.save(item);
        }
        mediaItemRepository.flush();
        mediaCollectionRepository.delete(col);
        mediaCollectionRepository.flush();
    }

    @Transactional
    public MediaFilenamePreviewDto previewFilename(
            MediaPrimaryContext primaryContext,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            String customFileName,
            String originalFilename,
            String mimeType
    ) {
        return previewFilenameWithFolder(
                primaryContext, graveId, personId, eventId, collectionId,
                customYear, null, customFileName, originalFilename, mimeType
        );
    }

    @Transactional
    public MediaFilenamePreviewDto previewFilenameWithFolder(
            MediaPrimaryContext primaryContext,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            String customFolderName,
            String customFileName,
            String originalFilename,
            String mimeType
    ) {
        String ext = storageService.extractExtension(originalFilename, mimeType);
        String dir = resolveDirectoryForContext(primaryContext, graveId, personId, eventId, collectionId, customYear);
        if (customFolderName != null && !customFolderName.isBlank()) {
            dir = replaceLastDirectorySegment(dir, storageService.toSnakeCase(customFolderName));
        }

        String baseName = (customFileName != null && !customFileName.isBlank())
                ? customFileName
                : buildDefaultBaseName(primaryContext, graveId, personId, eventId, collectionId, customYear);

        String uniqueFileName = findAvailableFileName(dir, baseName, ext);
        String fullRelativePath = dir + "/" + uniqueFileName;

        return MediaFilenamePreviewDto.builder()
                .directoryPath(dir)
                .suggestedFileName(uniqueFileName)
                .fullRelativePath(fullRelativePath)
                .build();
    }

    @Transactional
    public MediaItemDto uploadMedia(
            MultipartFile file,
            MediaPrimaryContext primaryContext,
            String customFileName,
            String title,
            String description,
            Long graveId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            Integer customMonth,
            Integer customDay,
            Integer customHour,
            Integer customMinute,
            List<Long> personIds,
            boolean setAsPersonAvatar,
            boolean setAsGravePrimary
    ) throws IOException {
        return uploadMediaExtended(
                file,
                primaryContext,
                null,
                customFileName,
                title,
                description,
                graveId,
                eventId,
                collectionId,
                customYear,
                customMonth,
                customDay,
                customHour,
                customMinute,
                null,
                null,
                personIds,
                setAsPersonAvatar,
                setAsGravePrimary
        );
    }

    @Transactional
    public MediaItemDto uploadMediaExtended(
            MultipartFile file,
            MediaPrimaryContext primaryContext,
            String customFolderName,
            String customFileName,
            String title,
            String description,
            Long graveId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            Integer customMonth,
            Integer customDay,
            Integer customHour,
            Integer customMinute,
            Integer customSecond,
            Long clientLastModifiedMs,
            List<Long> personIds,
            boolean setAsPersonAvatar,
            boolean setAsGravePrimary
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file cannot be empty.");
        }

        byte[] fileBytes = file.getBytes();
        String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        MediaType mediaType = mimeType.toLowerCase(Locale.ROOT).startsWith("video/")
                ? MediaType.VIDEO
                : MediaType.IMAGE;

        Event linkedEvent = null;
        if (eventId != null) {
            linkedEvent = eventRepository.findById(eventId)
                    .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));
            if (customFolderName != null && !customFolderName.isBlank()) {
                linkedEvent.setFolderSlug(storageService.toSnakeCase(customFolderName));
                linkedEvent = eventRepository.saveAndFlush(linkedEvent);
            }
        }

        Long primaryPersonId = (personIds != null && !personIds.isEmpty()) ? personIds.getFirst() : null;
        MediaFilenamePreviewDto preview = previewFilenameWithFolder(
                primaryContext,
                graveId,
                primaryPersonId,
                eventId,
                collectionId,
                customYear,
                customFolderName,
                customFileName,
                file.getOriginalFilename(),
                mimeType
        );

        MediaItem item = new MediaItem();
        item.setMediaType(mediaType);
        item.setPrimaryContext(primaryContext);
        item.setRelativePath(preview.getFullRelativePath());
        item.setFileName(preview.getSuggestedFileName());
        item.setMimeType(mimeType);
        item.setFileSize(file.getSize());
        item.setTitle(trimToNull(title));
        item.setDescription(trimToNull(description));

        // 1. Extract & store original metadata date/time in 2nd DateDescriptor + source tag
        MediaMetadataExtractor.ExtractedMetadata extractedMeta =
                metadataExtractor.extract(fileBytes, mimeType, clientLastModifiedMs);
        if (extractedMeta != null && extractedMeta.year() != null) {
            item.setMetadataDateDescriptor(extractedMeta.toDateDescriptor());
            item.setMetadataDateSource(extractedMeta.sourceTag());
        }

        // 2. Store effective DateDescriptor
        if (customYear != null && customYear >= 1000 && customYear <= 2999) {
            DateDescriptor dd = new DateDescriptor();
            dd.setDateType(DateType.SINGLE);
            dd.setStartQualifier(DateQualifier.EXACT);
            dd.setStartYear(customYear);
            dd.setStartMonth(customMonth);
            dd.setStartDay(customDay);
            if (customHour != null) {
                dd.setStartTimeQualifier(DateQualifier.EXACT);
                dd.setStartHour(customHour);
                dd.setStartMinute(customMinute);
                dd.setStartSecond(customSecond);
            }
            dd.recalculateSortDates();
            item.setDateDescriptor(dd);
        }

        if (collectionId != null) {
            mediaCollectionRepository.findById(collectionId).ifPresent(item::setCollection);
        }

        if (personIds != null && !personIds.isEmpty()) {
            List<Person> people = personRepository.findAllById(personIds);
            item.getPersons().addAll(people);
        }

        Grave linkedGrave = null;
        if (graveId != null) {
            linkedGrave = graveRepository.findById(graveId)
                    .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));
            item.getGraves().add(linkedGrave);
        }

        if (linkedEvent != null) {
            item.getEvents().add(linkedEvent);
        }

        item = mediaItemRepository.saveAndFlush(item);

        boolean isGif = mimeType.toLowerCase(Locale.ROOT).contains("gif");
        storageService.saveFileAndThumbnail(
                item.getRelativePath(),
                item.getId(),
                fileBytes,
                mediaType == MediaType.IMAGE && !isGif
        );

        if (primaryPersonId != null) {
            Person person = personRepository.findById(primaryPersonId).orElse(null);
            if (person != null && (setAsPersonAvatar || (primaryContext == MediaPrimaryContext.PERSON && person.getAvatarMedia() == null))) {
                person.setAvatarMedia(item);
                person.setAvatarCropX(50);
                person.setAvatarCropY(50);
                person.setAvatarCropZoom(1.0);
                personRepository.saveAndFlush(person);
            }
        }

        if (linkedGrave != null && mediaType == MediaType.IMAGE) {
            if (setAsGravePrimary || linkedGrave.getPrimaryMedia() == null) {
                linkedGrave.setPrimaryMedia(item);
                graveRepository.saveAndFlush(linkedGrave);
            }
        }

        activityLogService.logActivity(
                ActivityActionType.MEDIA_UPLOADED,
                "Dodano plik multimedialny: " + item.getFileName(),
                "MEDIA",
                item.getId()
        );

        return toDto(item, true, loadUserCodeTranslations());
    }

    @Transactional
    public List<MediaItemDto> uploadBatchMedia(
            List<MultipartFile> files,
            MediaPrimaryContext primaryContext,
            List<String> customFileNames,
            List<String> titles,
            List<Integer> customYears,
            Long graveId,
            Long eventId,
            Long collectionId,
            Integer defaultYear,
            List<Long> commonPersonIds
    ) throws IOException {
        return uploadBatchMediaExtended(
                files,
                primaryContext,
                null,
                customFileNames,
                titles,
                customYears,
                null,
                null,
                null,
                null,
                null,
                null,
                graveId,
                eventId,
                collectionId,
                defaultYear,
                commonPersonIds
        );
    }

    @Transactional
    public List<MediaItemDto> uploadBatchMediaExtended(
            List<MultipartFile> files,
            MediaPrimaryContext primaryContext,
            String customFolderName,
            List<String> customFileNames,
            List<String> titles,
            List<Integer> customYears,
            List<Integer> customMonths,
            List<Integer> customDays,
            List<Integer> customHours,
            List<Integer> customMinutes,
            List<Integer> customSeconds,
            List<Long> clientLastModifiedList,
            Long graveId,
            Long eventId,
            Long collectionId,
            Integer defaultYear,
            List<Long> commonPersonIds
    ) throws IOException {
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("Files list cannot be empty.");
        }

        List<MediaItemDto> results = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            MultipartFile f = files.get(i);
            String cName = getListElem(customFileNames, i);
            String cTitle = getListElem(titles, i);
            Integer cYear = getListElem(customYears, i) != null ? getListElem(customYears, i) : defaultYear;
            Integer cMonth = getListElem(customMonths, i);
            Integer cDay = getListElem(customDays, i);
            Integer cHour = getListElem(customHours, i);
            Integer cMinute = getListElem(customMinutes, i);
            Integer cSecond = getListElem(customSeconds, i);
            Long cLastMod = getListElem(clientLastModifiedList, i);

            results.add(uploadMediaExtended(
                    f,
                    primaryContext,
                    customFolderName,
                    cName,
                    cTitle,
                    null,
                    graveId,
                    eventId,
                    collectionId,
                    cYear,
                    cMonth,
                    cDay,
                    cHour,
                    cMinute,
                    cSecond,
                    cLastMod,
                    commonPersonIds,
                    false,
                    false
            ));
        }
        return results;
    }

    @Transactional
    public MediaItemDto updateMedia(Long mediaId, UpdateMediaItemRequestDto req) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        if (req.getCustomFolderName() != null && !req.getCustomFolderName().isBlank()) {
            String newFolderSlug = storageService.toSnakeCase(req.getCustomFolderName());
            String currentDir = extractDirectoryPath(item.getRelativePath());
            String targetDir = replaceLastDirectorySegment(currentDir, newFolderSlug);
            String targetRelPath = targetDir + "/" + item.getFileName();
            if (!targetRelPath.equals(item.getRelativePath())) {
                String movedPath = storageService.moveFileToRelativePath(item.getRelativePath(), targetRelPath);
                item.setRelativePath(movedPath);
            }
            if (req.getContextEventId() != null) {
                eventRepository.findById(req.getContextEventId()).ifPresent(evt -> {
                    evt.setFolderSlug(newFolderSlug);
                    eventRepository.saveAndFlush(evt);
                });
            }
        }

        if (req.getFileName() != null && !req.getFileName().isBlank()) {
            String ext = storageService.extractExtension(item.getFileName(), item.getMimeType());
            String sanitizedNewName = storageService.sanitizeFileName(req.getFileName(), ext);
            if (!sanitizedNewName.equals(item.getFileName())) {
                String newRelPath = storageService.renameFileInSameDirectory(item.getRelativePath(), sanitizedNewName);
                item.setFileName(sanitizedNewName);
                item.setRelativePath(newRelPath);
            }
        }

        if (req.getTitle() != null) {
            item.setTitle(trimToNull(req.getTitle()));
        }
        if (req.getDescription() != null) {
            item.setDescription(trimToNull(req.getDescription()));
        }

        applyDateModeToMediaItem(
                item,
                req.getDateSourceMode(),
                req.getContextEventId(),
                req.getDateQualifier(),
                req.getYear(),
                req.getMonth(),
                req.getDay(),
                req.getTimeQualifier(),
                req.getHour(),
                req.getMinute(),
                req.getSecond()
        );

        if (req.getPersonIds() != null) {
            item.getPersons().clear();
            item.getPersons().addAll(personRepository.findAllById(req.getPersonIds()));
        }

        item = mediaItemRepository.saveAndFlush(item);

        if (req.getSetAsAvatarForPersonId() != null) {
            MediaItem finalItem = item;
            personRepository.findById(req.getSetAsAvatarForPersonId()).ifPresent(p -> {
                p.setAvatarMedia(finalItem);
                if (req.getAvatarCropX() != null) {
                    p.setAvatarCropX(Math.clamp(req.getAvatarCropX(), 0, 100));
                }
                if (req.getAvatarCropY() != null) {
                    p.setAvatarCropY(Math.clamp(req.getAvatarCropY(), 0, 100));
                }
                if (req.getAvatarCropZoom() != null) {
                    p.setAvatarCropZoom(Math.clamp(req.getAvatarCropZoom(), 1.0, 5.0));
                }
                personRepository.saveAndFlush(p);
            });
        }

        if (req.getSetAsPrimaryForGraveId() != null) {
            MediaItem finalItem = item;
            graveRepository.findById(req.getSetAsPrimaryForGraveId()).ifPresent(g -> {
                g.setPrimaryMedia(finalItem);
                graveRepository.saveAndFlush(g);
            });
        }

        activityLogService.logActivity(
                ActivityActionType.MEDIA_UPDATED,
                "Zaktualizowano plik multimedialny: " + item.getFileName(),
                "MEDIA",
                item.getId()
        );

        return toDto(item, true, loadUserCodeTranslations());
    }

    @Transactional
    public List<MediaItemDto> bulkUpdateMedia(BulkUpdateMediaRequestDto req) {
        if (req.getMediaIds() == null || req.getMediaIds().isEmpty()) {
            throw new IllegalArgumentException("Lista plików do edycji zbiorowej nie może być pusta.");
        }

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        List<MediaItem> items = mediaItemRepository.findAllById(req.getMediaIds()).stream()
                .sorted(Comparator.comparing(MediaItem::getId))
                .toList();

        String newFolderSlug = (req.getCustomFolderName() != null && !req.getCustomFolderName().isBlank())
                ? storageService.toSnakeCase(req.getCustomFolderName())
                : null;

        if (newFolderSlug != null && req.getContextEventId() != null) {
            eventRepository.findById(req.getContextEventId()).ifPresent(evt -> {
                evt.setFolderSlug(newFolderSlug);
                eventRepository.saveAndFlush(evt);
            });
        }

        String cleanStem = (req.getBaseFileNameStem() != null && !req.getBaseFileNameStem().isBlank())
                ? storageService.toSnakeCase(req.getBaseFileNameStem()).replaceFirst("_\\d{1,3}$", "")
                : null;

        List<MediaItemDto> updatedDtos = new ArrayList<>();
        int index = 1;

        for (MediaItem item : items) {
            String currentDir = extractDirectoryPath(item.getRelativePath());
            String targetDir = newFolderSlug != null
                    ? replaceLastDirectorySegment(currentDir, newFolderSlug)
                    : currentDir;

            String targetFileName = item.getFileName();
            if (cleanStem != null && !cleanStem.isBlank()) {
                String ext = storageService.extractExtension(item.getFileName(), item.getMimeType());
                String candidate = String.format("%s_%02d.%s", cleanStem, index, ext);
                String candidateRel = targetDir + "/" + candidate;
                if (!candidateRel.equals(item.getRelativePath())
                        && (mediaItemRepository.existsByRelativePath(candidateRel)
                        || Files.exists(storageService.resolveMediaFilePath(candidateRel)))) {
                    candidate = findAvailableFileName(targetDir, cleanStem, ext);
                }
                targetFileName = candidate;
            }
            index++;

            String targetRelPath = targetDir + "/" + targetFileName;
            if (!targetRelPath.equals(item.getRelativePath())) {
                String movedPath = storageService.moveFileToRelativePath(item.getRelativePath(), targetRelPath);
                item.setRelativePath(movedPath);
                item.setFileName(targetFileName);
            }

            if (req.getDateSourceMode() != null && !"NO_CHANGE".equalsIgnoreCase(req.getDateSourceMode())) {
                applyDateModeToMediaItem(
                        item,
                        req.getDateSourceMode(),
                        req.getContextEventId(),
                        req.getDateQualifier(),
                        req.getYear(),
                        req.getMonth(),
                        req.getDay(),
                        req.getTimeQualifier(),
                        req.getHour(),
                        req.getMinute(),
                        req.getSecond()
                );
            }

            MediaItem saved = mediaItemRepository.saveAndFlush(item);
            updatedDtos.add(toDto(saved, true, userCodeTranslations));
        }

        activityLogService.logActivity(
                ActivityActionType.MEDIA_UPDATED,
                "Zaktualizowano zbiorowo pliki multimedialne (" + updatedDtos.size() + ")",
                "MEDIA",
                null
        );

        return updatedDtos;
    }

    @Transactional
    public List<MediaItemDto> linkExistingMedia(LinkExistingMediaRequestDto req) {
        if (req.getMediaIds() == null || req.getMediaIds().isEmpty()) {
            throw new IllegalArgumentException("Wybierz przynajmniej jedno zdjęcie lub film z galerii.");
        }

        Grave grave = req.getGraveId() != null
                ? graveRepository.findById(req.getGraveId())
                .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + req.getGraveId()))
                : null;
        Person person = req.getPersonId() != null
                ? personRepository.findById(req.getPersonId())
                .orElseThrow(() -> new IllegalArgumentException("Person not found: " + req.getPersonId()))
                : null;
        Event event = req.getEventId() != null
                ? eventRepository.findById(req.getEventId())
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + req.getEventId()))
                : null;
        MediaCollection col = req.getCollectionId() != null
                ? mediaCollectionRepository.findById(req.getCollectionId())
                .orElseThrow(() -> new IllegalArgumentException("Collection not found: " + req.getCollectionId()))
                : null;

        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        List<MediaItem> items = mediaItemRepository.findAllById(req.getMediaIds());
        List<MediaItemDto> linkedDtos = new ArrayList<>();

        for (MediaItem item : items) {
            if (grave != null) {
                item.getGraves().add(grave);
                if (grave.getPrimaryMedia() == null && item.getMediaType() == MediaType.IMAGE) {
                    grave.setPrimaryMedia(item);
                    graveRepository.save(grave);
                }
            }
            if (person != null) {
                item.getPersons().add(person);
            }
            if (event != null) {
                item.getEvents().add(event);
            }
            if (col != null) {
                item.setCollection(col);
            }
            MediaItem saved = mediaItemRepository.saveAndFlush(item);
            linkedDtos.add(toDto(saved, true, userCodeTranslations));
        }
        graveRepository.flush();

        return linkedDtos;
    }

    @Transactional
    public void unlinkMediaFromContext(Long mediaId, Long graveId, Long personId, Long eventId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        if (graveId != null) {
            item.getGraves().removeIf(g -> g.getId().equals(graveId));
            graveRepository.findById(graveId).ifPresent(g -> {
                if (g.getPrimaryMedia() != null && g.getPrimaryMedia().getId().equals(mediaId)) {
                    g.setPrimaryMedia(null);
                    graveRepository.save(g);
                }
            });
        }
        if (personId != null) {
            item.getPersons().removeIf(p -> p.getId().equals(personId));
            personRepository.findById(personId).ifPresent(p -> {
                if (p.getAvatarMedia() != null && p.getAvatarMedia().getId().equals(mediaId)) {
                    p.setAvatarMedia(null);
                    personRepository.save(p);
                }
            });
        }
        if (eventId != null) {
            item.getEvents().removeIf(e -> e.getId().equals(eventId));
        }

        mediaItemRepository.saveAndFlush(item);
        graveRepository.flush();
        personRepository.flush();
    }

    @Transactional
    public void syncEventMediaPathsOnEventChange(Event evt) {
        syncEventMediaPathsRecursive(evt, new HashSet<>());
    }

    private void syncEventMediaPathsRecursive(Event evt, Set<Long> visitedEventIds) {
        if (evt == null || evt.getId() == null || !visitedEventIds.add(evt.getId())) {
            return;
        }

        String targetDir = resolveEventDirectoryPath(evt, null);
        String newDatePrefix = buildEventDatePrefix(evt);

        List<MediaItem> eventMedia = mediaItemRepository.findByEventsIdOrderByIdAsc(evt.getId());
        for (MediaItem item : eventMedia) {
            if (item.getPrimaryContext() != MediaPrimaryContext.EVENT) {
                continue;
            }
            // Only move if this event is the single/first event on the item
            Long firstEvtId = item.getEvents().stream()
                    .map(Event::getId)
                    .min(Long::compareTo)
                    .orElse(null);
            if (!Objects.equals(firstEvtId, evt.getId())) {
                continue;
            }

            String currentFileName = item.getFileName();
            String updatedFileName = updateLeadingDatePrefixInFileName(currentFileName, newDatePrefix);

            String candidateRelPath = targetDir + "/" + updatedFileName;
            if (!candidateRelPath.equals(item.getRelativePath())) {
                if (mediaItemRepository.existsByRelativePath(candidateRelPath)
                        || Files.exists(storageService.resolveMediaFilePath(candidateRelPath))) {
                    String ext = storageService.extractExtension(updatedFileName, item.getMimeType());
                    updatedFileName = findAvailableFileName(targetDir, updatedFileName, ext);
                    candidateRelPath = targetDir + "/" + updatedFileName;
                }
                String movedPath = storageService.moveFileToRelativePath(item.getRelativePath(), candidateRelPath);
                item.setRelativePath(movedPath);
                item.setFileName(updatedFileName);
                mediaItemRepository.saveAndFlush(item);
            }
        }

        // Propagate to child events (since child event folders are nested inside their primary parent's folder)
        List<Event> directSubs = eventRepository
                .findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(evt.getId());
        for (Event sub : directSubs) {
            syncEventMediaPathsRecursive(sub, visitedEventIds);
        }
        for (EventParentLink link : eventParentLinkRepository.findByParentEventIdOrderBySortOrderAscIdAsc(evt.getId())) {
            if (link.getChildEvent() != null) {
                syncEventMediaPathsRecursive(link.getChildEvent(), visitedEventIds);
            }
        }
    }

    private String buildEventDatePrefix(Event evt) {
        DateDescriptor dd = evt.getStartDate();
        if (dd == null || dd.getStartYear() == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append(dd.getStartYear());
        if (dd.getStartMonth() != null) {
            sb.append(String.format("_%02d", dd.getStartMonth()));
            if (dd.getStartDay() != null) {
                sb.append(String.format("_%02d", dd.getStartDay()));
            }
        }
        return sb.toString();
    }

    private String updateLeadingDatePrefixInFileName(String fileName, String newDatePrefix) {
        Matcher m = LEADING_DATE_PREFIX_PATTERN.matcher(fileName);
        if (m.matches()) {
            String rest = m.group(1);
            return newDatePrefix.isEmpty() ? rest : newDatePrefix + "_" + rest;
        }
        return newDatePrefix.isEmpty() ? fileName : newDatePrefix + "_" + fileName;
    }

    private void applyDateModeToMediaItem(
            MediaItem item,
            String dateSourceMode,
            Long contextEventId,
            String dateQual,
            Integer year,
            Integer month,
            Integer day,
            String timeQual,
            Integer hour,
            Integer minute,
            Integer second
    ) {
        String mode = dateSourceMode != null ? dateSourceMode.trim().toUpperCase(Locale.ROOT) : "";

        if ("UNDATED".equals(mode)) {
            item.setDateDescriptor(null);
            return;
        }

        if ("METADATA".equals(mode)) {
            ensureMetadataExtractedFromDiskIfMissing(item);
            DateDescriptor metaDd = item.getMetadataDateDescriptor();
            if (metaDd != null && metaDd.getStartYear() != null) {
                DateDescriptor copy = item.getDateDescriptor() != null ? item.getDateDescriptor() : new DateDescriptor();
                copyDateDescriptorFields(metaDd, copy);
                item.setDateDescriptor(copy);
            }
            return;
        }

        if ("EVENT".equals(mode)) {
            Event sourceEvt = null;
            if (contextEventId != null) {
                sourceEvt = eventRepository.findById(contextEventId).orElse(null);
            }
            if (sourceEvt == null && !item.getEvents().isEmpty()) {
                sourceEvt = item.getEvents().iterator().next();
            }
            if (sourceEvt != null && sourceEvt.getStartDate() != null) {
                DateDescriptor copy = item.getDateDescriptor() != null ? item.getDateDescriptor() : new DateDescriptor();
                copyDateDescriptorFields(sourceEvt.getStartDate(), copy);
                item.setDateDescriptor(copy);
            }
            return;
        }

        if ("MANUAL".equals(mode) || year != null) {
            if (year == null) {
                item.setDateDescriptor(null);
                return;
            }
            DateDescriptor dd = item.getDateDescriptor() != null ? item.getDateDescriptor() : new DateDescriptor();
            dd.setDateType(DateType.SINGLE);
            dd.setStartQualifier(parseQualifier(dateQual));
            dd.setStartYear(year);
            dd.setStartMonth(month);
            dd.setStartDay(day);
            if (hour != null) {
                dd.setStartTimeQualifier(parseQualifier(timeQual));
                dd.setStartHour(hour);
                dd.setStartMinute(minute);
                dd.setStartSecond(second);
            } else {
                dd.setStartTimeQualifier(null);
                dd.setStartHour(null);
                dd.setStartMinute(null);
                dd.setStartSecond(null);
            }
            dd.recalculateSortDates();
            item.setDateDescriptor(dd);
        }
    }

    private void ensureMetadataExtractedFromDiskIfMissing(MediaItem item) {
        if (item.getMetadataDateDescriptor() != null) {
            return;
        }
        byte[] bytes = storageService.readFileBytesIfExists(item.getRelativePath());
        if (bytes != null) {
            MediaMetadataExtractor.ExtractedMetadata extracted =
                    metadataExtractor.extract(bytes, item.getMimeType(), null);
            if (extracted != null && extracted.year() != null) {
                item.setMetadataDateDescriptor(extracted.toDateDescriptor());
                item.setMetadataDateSource(extracted.sourceTag());
            }
        }
    }

    private void copyDateDescriptorFields(DateDescriptor src, DateDescriptor dst) {
        dst.setDateType(src.getDateType());
        dst.setFreeText(src.getFreeText());
        dst.setStartQualifier(src.getStartQualifier());
        dst.setStartYear(src.getStartYear());
        dst.setStartMonth(src.getStartMonth());
        dst.setStartDay(src.getStartDay());
        dst.setStartTimeQualifier(src.getStartTimeQualifier());
        dst.setStartHour(src.getStartHour());
        dst.setStartMinute(src.getStartMinute());
        dst.setStartSecond(src.getStartSecond());
        dst.setEndQualifier(src.getEndQualifier());
        dst.setEndYear(src.getEndYear());
        dst.setEndMonth(src.getEndMonth());
        dst.setEndDay(src.getEndDay());
        dst.setEndTimeQualifier(src.getEndTimeQualifier());
        dst.setEndHour(src.getEndHour());
        dst.setEndMinute(src.getEndMinute());
        dst.setEndSecond(src.getEndSecond());
        dst.recalculateSortDates();
    }

    private DateQualifier parseQualifier(String raw) {
        if (raw == null || raw.isBlank()) {
            return DateQualifier.EXACT;
        }
        try {
            return DateQualifier.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return DateQualifier.EXACT;
        }
    }

    @Transactional
    public void deleteMedia(Long mediaId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        String fName = item.getFileName();
        String relPath = item.getRelativePath();

        for (Person p : item.getPersons()) {
            if (p.getAvatarMedia() != null && p.getAvatarMedia().getId().equals(mediaId)) {
                p.setAvatarMedia(null);
                personRepository.save(p);
            }
        }
        for (Grave g : item.getGraves()) {
            if (g.getPrimaryMedia() != null && g.getPrimaryMedia().getId().equals(mediaId)) {
                g.setPrimaryMedia(null);
                graveRepository.save(g);
            }
        }
        personRepository.flush();
        graveRepository.flush();

        mediaItemRepository.delete(item);
        mediaItemRepository.flush();

        storageService.deleteFileAndThumbnail(relPath, mediaId);

        activityLogService.logActivity(
                ActivityActionType.MEDIA_DELETED,
                "Usunięto plik multimedialny: " + fName,
                "MEDIA",
                null
        );
    }

    @Transactional
    public List<MediaItemDto> getMediaByGrave(Long graveId, boolean isAdmin) {
        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        return mediaItemRepository.findByGravesIdOrderByIdAsc(graveId).stream()
                .map(m -> toDto(m, isAdmin, userCodeTranslations))
                .toList();
    }

    @Transactional
    public List<MediaItemDto> getMediaByPerson(Long personId, boolean isAdmin) {
        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();
        return mediaItemRepository.findByPersonsIdOrderByIdAsc(personId).stream()
                .map(m -> toDto(m, isAdmin, userCodeTranslations))
                .toList();
    }

    @Transactional
    public EventMediaOverviewDto getMediaByEventWithSubEvents(Long eventId, boolean isAdmin) {
        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();

        List<MediaItemDto> direct = mediaItemRepository.findByEventsIdOrderByIdAsc(eventId).stream()
                .map(m -> toDto(m, isAdmin, userCodeTranslations))
                .toList();

        List<Event> directSubs = eventRepository
                .findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(eventId);
        List<EventParentLink> linkedSubs = eventParentLinkRepository
                .findByParentEventIdOrderBySortOrderAscIdAsc(eventId);

        List<Event> subEvents = new ArrayList<>();
        Set<Long> seenSubIds = new HashSet<>();
        for (Event s : directSubs) {
            if (seenSubIds.add(s.getId())) {
                subEvents.add(s);
            }
        }
        for (EventParentLink link : linkedSubs) {
            if (link.getChildEvent() != null && seenSubIds.add(link.getChildEvent().getId())) {
                subEvents.add(link.getChildEvent());
            }
        }

        List<SubEventMediaGroupDto> subGroups = new ArrayList<>();
        for (Event sub : subEvents) {
            List<MediaItemDto> subMedia = mediaItemRepository.findByEventsIdOrderByIdAsc(sub.getId()).stream()
                    .map(m -> toDto(m, isAdmin, userCodeTranslations))
                    .toList();
            if (!subMedia.isEmpty()) {
                String label = resolveEventDisplayLabel(sub, userCodeTranslations);
                String dateText = EventTimelineService.formatEventDates(sub.getStartDate(), sub.getEndDate());
                subGroups.add(SubEventMediaGroupDto.builder()
                        .subEventId(sub.getId())
                        .subEventLabel(label)
                        .dateText(dateText)
                        .media(subMedia)
                        .build());
            }
        }

        return EventMediaOverviewDto.builder()
                .directMedia(direct)
                .subEventGroups(subGroups)
                .build();
    }

    @Transactional
    public Resource getMediaFileResource(Long mediaId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));
        Path path = storageService.resolveMediaFilePath(item.getRelativePath());
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("Physical media file not found on disk: " + item.getRelativePath());
        }
        return new FileSystemResource(path);
    }

    @Transactional
    public Resource getThumbnailResource(Long mediaId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));
        if (item.getMimeType() != null && item.getMimeType().toLowerCase(Locale.ROOT).contains("gif")) {
            return getMediaFileResource(mediaId);
        }
        Path thumbPath = storageService.resolveThumbnailPath(mediaId);
        if (Files.exists(thumbPath)) {
            return new FileSystemResource(thumbPath);
        }
        return getMediaFileResource(mediaId);
    }

    @Transactional
    public String getMimeType(Long mediaId) {
        return mediaItemRepository.findById(mediaId)
                .map(MediaItem::getMimeType)
                .orElse("application/octet-stream");
    }

    private <T> T getListElem(List<T> list, int idx) {
        if (list == null || idx < 0 || idx >= list.size()) {
            return null;
        }
        return list.get(idx);
    }

    private String extractDirectoryPath(String relativePath) {
        if (relativePath == null || !relativePath.contains("/")) {
            return "undated/other_family_photos";
        }
        return relativePath.substring(0, relativePath.lastIndexOf('/'));
    }

    private String replaceLastDirectorySegment(String dirPath, String newLastSegment) {
        if (dirPath == null || !dirPath.contains("/")) {
            return newLastSegment;
        }
        return dirPath.substring(0, dirPath.lastIndexOf('/') + 1) + newLastSegment;
    }

    private Map<Long, String> loadUserCodeTranslations() {
        return translationRepository
                .findByTableNameAndLanguageCode("user_codes", LanguageCode.PL_PL.getCode())
                .stream()
                .collect(Collectors.toMap(Translation::getRecordId, Translation::getValue, (a, b) -> a));
    }

    private String resolveEventDisplayLabel(Event evt, Map<Long, String> userCodeTranslations) {
        String typeLabel = EventTimelineService.resolveEventTypeLabel(evt.getEventType(), userCodeTranslations);
        if (evt.getTitle() != null && !evt.getTitle().isBlank()) {
            return evt.getTitle();
        }
        return typeLabel;
    }

    private boolean matchesPersonFilter(MediaItem item, Set<Long> filterPersonIds, boolean matchAll) {
        if (filterPersonIds.isEmpty()) {
            return true;
        }
        Set<Long> itemPersonIds = new HashSet<>();
        for (Person p : item.getPersons()) {
            itemPersonIds.add(p.getId());
        }
        if (matchAll) {
            return itemPersonIds.containsAll(filterPersonIds);
        }
        return filterPersonIds.stream().anyMatch(itemPersonIds::contains);
    }

    private boolean matchesDatedMode(MediaItemDto dto, String datedMode) {
        if ("DATED_ONLY".equalsIgnoreCase(datedMode)) {
            return dto.getYear() != null;
        }
        if ("UNDATED_ONLY".equalsIgnoreCase(datedMode)) {
            return dto.getYear() == null;
        }
        return true;
    }

    private boolean matchesGallerySearch(MediaItemDto dto, String normSearch) {
        if (normSearch.isEmpty()) {
            return true;
        }
        String combined = ((dto.getTitle() != null ? dto.getTitle() : "") + " "
                + (dto.getDescription() != null ? dto.getDescription() : "") + " "
                + (dto.getFileName() != null ? dto.getFileName() : "") + " "
                + (dto.getCollectionName() != null ? dto.getCollectionName() : "") + " "
                + String.join(" ", dto.getPersonNames()) + " "
                + String.join(" ", dto.getCemeteryNames())).toLowerCase(Locale.ROOT);
        return combined.contains(normSearch);
    }

    private Comparator<MediaItemDto> buildGalleryComparator(String sortBy) {
        String mode = sortBy != null ? sortBy.trim().toUpperCase(Locale.ROOT) : "NEWEST_UPLOAD";
        Comparator<LocalDateTime> nullSafeDtAsc = Comparator.nullsLast(LocalDateTime::compareTo);
        Comparator<LocalDateTime> nullSafeDtDesc = Comparator.nullsLast(Comparator.reverseOrder());

        return switch (mode) {
            case "YEAR_ASC" -> Comparator
                    .comparing(MediaItemDto::getSortDateTime, nullSafeDtAsc)
                    .thenComparingLong(MediaItemDto::getId);
            case "YEAR_DESC" -> Comparator
                    .comparing(MediaItemDto::getSortDateTime, nullSafeDtDesc)
                    .thenComparingLong(MediaItemDto::getId);
            case "FILENAME_ASC" -> Comparator
                    .comparing((MediaItemDto m) -> m.getTitle() != null ? m.getTitle() : m.getFileName(), String.CASE_INSENSITIVE_ORDER)
                    .thenComparingLong(MediaItemDto::getId);
            default -> Comparator
                    .comparing(MediaItemDto::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(MediaItemDto::getId, Comparator.reverseOrder());
        };
    }

    public String resolveEventDirectoryPath(Event evt, Integer customYearOverride) {
        List<Event> chain = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        Event cursor = evt;
        while (cursor != null && cursor.getId() != null && visited.add(cursor.getId()) && chain.size() < 6) {
            chain.addFirst(cursor);
            cursor = cursor.getPrimaryParentEvent();
        }
        if (chain.isEmpty()) {
            chain.add(evt);
        }

        Event rootEvent = chain.getFirst();
        Integer rootYear = (chain.size() == 1 && customYearOverride != null)
                ? customYearOverride
                : extractYearFromEvent(rootEvent);
        String rootSlug = resolveEffectiveEventFolderSlug(rootEvent, rootYear);

        StringBuilder pathBuilder = new StringBuilder();
        if (rootYear != null) {
            int decade = (rootYear / 10) * 10;
            pathBuilder.append(String.format("dated/%ds/%d/%s", decade, rootYear, rootSlug));
        } else {
            pathBuilder.append("undated/events/").append(rootSlug);
        }

        for (int i = 1; i < chain.size(); i++) {
            Event childEvt = chain.get(i);
            Integer childYear = (i == chain.size() - 1 && customYearOverride != null)
                    ? customYearOverride
                    : extractYearFromEvent(childEvt);
            pathBuilder.append("/").append(resolveEffectiveEventFolderSlug(childEvt, childYear));
        }

        return pathBuilder.toString();
    }

    private String resolveEffectiveEventFolderSlug(Event evt, Integer yearOverride) {
        if (evt.getFolderSlug() != null && !evt.getFolderSlug().isBlank()) {
            return storageService.toSnakeCase(evt.getFolderSlug());
        }
        return buildEventFolderSlug(evt, yearOverride);
    }

    private String resolveDirectoryForContext(
            MediaPrimaryContext context,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear
    ) {
        if (context == MediaPrimaryContext.GRAVE) {
            String cemeterySlug = "unassigned";
            if (graveId != null) {
                Grave g = graveRepository.findById(graveId).orElse(null);
                if (g != null && g.getCemetery() != null) {
                    cemeterySlug = storageService.toSnakeCase(g.getCemetery().getName());
                }
            }
            return "undated/graves/" + cemeterySlug;
        }

        if (collectionId != null) {
            MediaCollection col = mediaCollectionRepository.findById(collectionId).orElse(null);
            if (col != null) {
                return "undated/collections/" + col.getSlug();
            }
        }

        if (context == MediaPrimaryContext.EVENT && eventId != null) {
            Event evt = eventRepository.findById(eventId).orElse(null);
            if (evt != null) {
                return resolveEventDirectoryPath(evt, customYear);
            }
        }

        if (customYear != null && customYear >= 1000 && customYear <= 2999) {
            int decade = (customYear / 10) * 10;
            return String.format("dated/%ds/%d/misc_%d", decade, customYear, customYear);
        }

        if (context == MediaPrimaryContext.PERSON && personId != null) {
            Person p = personRepository.findById(personId).orElse(null);
            if (p != null) {
                String personSlug = buildPersonSlug(p);
                return "undated/collections/" + personSlug;
            }
        }

        if (context == MediaPrimaryContext.HEIRLOOM) {
            return "undated/heirlooms";
        }
        if (context == MediaPrimaryContext.LOCATION) {
            return "undated/locations";
        }

        return "undated/other_family_photos";
    }

    private String buildDefaultBaseName(
            MediaPrimaryContext context,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear
    ) {
        if (context == MediaPrimaryContext.GRAVE && graveId != null) {
            Grave g = graveRepository.findById(graveId).orElse(null);
            if (g != null) {
                List<Burial> burials = burialRepository.findByGrave(g);
                if (!burials.isEmpty()) {
                    List<String> slugs = burials.stream()
                            .map(Burial::getPerson)
                            .filter(Objects::nonNull)
                            .limit(2)
                            .map(this::buildPersonSlug)
                            .toList();
                    if (!slugs.isEmpty()) {
                        return String.join("_and_", slugs) + "_grave";
                    }
                }
            }
            return "grave_photo";
        }

        if (collectionId != null) {
            MediaCollection col = mediaCollectionRepository.findById(collectionId).orElse(null);
            if (col != null) {
                return col.getSlug();
            }
        }

        if (context == MediaPrimaryContext.EVENT && eventId != null) {
            Event evt = eventRepository.findById(eventId).orElse(null);
            if (evt != null) {
                Integer year = customYear != null ? customYear : extractYearFromEvent(evt);
                return resolveEffectiveEventFolderSlug(evt, year);
            }
        }

        if (personId != null) {
            Person p = personRepository.findById(personId).orElse(null);
            if (p != null) {
                return buildPersonSlug(p) + "_portrait";
            }
        }

        if (customYear != null) {
            return customYear + "_family_media";
        }

        return "family_media";
    }

    private Integer extractYearFromEvent(Event evt) {
        if (evt.getStartDate() != null && evt.getStartDate().getStartYear() != null) {
            return evt.getStartDate().getStartYear();
        }
        if (evt.getEndDate() != null && evt.getEndDate().getStartYear() != null) {
            return evt.getEndDate().getStartYear();
        }
        return null;
    }

    private Integer resolveMediaItemYear(MediaItem item) {
        if (item.getDateDescriptor() != null && item.getDateDescriptor().getStartYear() != null) {
            return item.getDateDescriptor().getStartYear();
        }
        for (Event evt : item.getEvents()) {
            Integer y = extractYearFromEvent(evt);
            if (y != null) {
                return y;
            }
        }
        if (item.getRelativePath() != null) {
            Matcher m = DATED_PATH_YEAR_PATTERN.matcher(item.getRelativePath());
            if (m.find()) {
                return Integer.valueOf(m.group(1));
            }
        }
        return null;
    }

    private LocalDateTime resolveMediaSortDateTime(MediaItem item, Integer resolvedYear) {
        if (item.getDateDescriptor() != null && item.getDateDescriptor().getSortDateTimeMin() != null) {
            return item.getDateDescriptor().getSortDateTimeMin();
        }
        for (Event evt : item.getEvents()) {
            if (evt.getCachedStartSortDateTime() != null) {
                return evt.getCachedStartSortDateTime();
            }
            if (evt.getStartDate() != null && evt.getStartDate().getSortDateTimeMin() != null) {
                return evt.getStartDate().getSortDateTimeMin();
            }
        }
        if (resolvedYear != null) {
            return LocalDateTime.of(resolvedYear, 1, 1, 0, 0);
        }
        return null;
    }

    private String buildEventFolderSlug(Event evt, Integer yearOverride) {
        DateDescriptor dd = evt.getStartDate();
        Integer y = yearOverride != null ? yearOverride : (dd != null ? dd.getStartYear() : null);
        Integer m = dd != null ? dd.getStartMonth() : null;
        Integer d = dd != null ? dd.getStartDay() : null;

        StringBuilder datePrefix = new StringBuilder();
        if (y != null) {
            datePrefix.append(y);
            if (m != null) {
                datePrefix.append(String.format("_%02d", m));
                if (d != null) {
                    datePrefix.append(String.format("_%02d", d));
                }
            }
        }

        String namePart = (evt.getTitle() != null && !evt.getTitle().isBlank())
                ? storageService.toSnakeCase(evt.getTitle())
                : storageService.toSnakeCase(evt.getEventType().getCode());

        List<String> participantFullNames = evt.getParticipants().size() > 3
                ? List.of()
                : evt.getParticipants().stream()
                .sorted(Comparator.comparing(ep -> ep.getPerson() != null ? ep.getPerson().getId() : Long.MAX_VALUE))
                .map(ep -> {
                    if (ep.getPerson() != null) {
                        String given = ep.getPerson().getCachedGivenName() != null ? ep.getPerson().getCachedGivenName() : "";
                        String sur = ep.getPerson().getCachedSurname() != null ? ep.getPerson().getCachedSurname() : "";
                        return (given + " " + sur).trim();
                    }
                    return ep.getParticipantText() != null ? ep.getParticipantText().trim() : "";
                })
                .filter(s -> !s.isEmpty())
                .map(storageService::toSnakeCase)
                .distinct()
                .limit(3)
                .toList();

        String suffix = participantFullNames.isEmpty()
                ? namePart
                : namePart + "_" + String.join("_", participantFullNames);

        return datePrefix.isEmpty() ? suffix : datePrefix + "_" + suffix;
    }

    private String buildPersonSlug(Person p) {
        String given = p.getCachedGivenName() != null ? p.getCachedGivenName() : "";
        String surname = p.getCachedSurname() != null ? p.getCachedSurname() : "";
        Integer birthYear = (p.getBirthEvent() != null && p.getBirthEvent().getStartDate() != null)
                ? p.getBirthEvent().getStartDate().getStartYear()
                : null;
        String raw = (given + " " + surname + (birthYear != null ? " " + birthYear : "")).trim();
        return storageService.toSnakeCase(raw);
    }

    private String findAvailableFileName(String directoryPath, String rawBaseName, String ext) {
        String cleanSelect = storageService.sanitizeFileName(rawBaseName, ext);
        String stem = cleanSelect.substring(0, cleanSelect.length() - ext.length() - 1);
        String normalizedStem = stem.replaceFirst("_\\d{1,3}$", "");
        if (normalizedStem.isBlank()) {
            normalizedStem = stem;
        }

        for (int counter = 1; counter <= 9999; counter++) {
            String candidateName = String.format("%s_%02d.%s", normalizedStem, counter, ext);
            String relPath = directoryPath + "/" + candidateName;
            Path diskPath = storageService.resolveMediaFilePath(relPath);
            if (!mediaItemRepository.existsByRelativePath(relPath) && !Files.exists(diskPath)) {
                return candidateName;
            }
        }
        return normalizedStem + "_" + System.currentTimeMillis() + "." + ext;
    }

    private MediaCollectionDto toCollectionDto(MediaCollection col) {
        Person f = col.getFounderPerson();
        String founderName = f != null
                ? ((f.getCachedGivenName() != null ? f.getCachedGivenName() : "") + " "
                + (f.getCachedSurname() != null ? f.getCachedSurname() : "")).trim()
                : null;

        return MediaCollectionDto.builder()
                .id(col.getId())
                .name(col.getName())
                .slug(col.getSlug())
                .description(col.getDescription())
                .founderPersonId(f != null ? f.getId() : null)
                .founderPersonName(founderName)
                .mediaCount(mediaItemRepository.countByCollectionId(col.getId()))
                .createdAt(col.getCreatedAt())
                .build();
    }

    private MediaItemDto toDto(MediaItem item, boolean isAdmin, Map<Long, String> userCodeTranslations) {
        List<Person> sortedPersons = item.getPersons().stream()
                .sorted(Comparator.comparing(Person::getId))
                .toList();

        List<String> personNames = sortedPersons.stream()
                .map(p -> ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                        + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim())
                .filter(s -> !s.isEmpty())
                .toList();

        List<String> cemeteryNames = item.getGraves().stream()
                .map(g -> g.getCemetery() != null ? g.getCemetery().getName() : "Inne")
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        List<String> eventLabels = item.getEvents().stream()
                .map(e -> resolveEventDisplayLabel(e, userCodeTranslations))
                .distinct()
                .toList();

        DateDescriptor dd = item.getDateDescriptor();
        DateDescriptor metaDd = item.getMetadataDateDescriptor();
        Integer resolvedYear = resolveMediaItemYear(item);

        return MediaItemDto.builder()
                .id(item.getId())
                .mediaType(item.getMediaType())
                .primaryContext(item.getPrimaryContext())
                .relativePath(isAdmin ? item.getRelativePath() : null)
                .directoryPath(isAdmin ? extractDirectoryPath(item.getRelativePath()) : null)
                .fileName(item.getFileName())
                .mimeType(item.getMimeType())
                .fileSize(item.getFileSize())
                .title(item.getTitle())
                .description(item.getDescription())
                .dateQualifier(dd != null && dd.getStartQualifier() != null ? dd.getStartQualifier().name() : null)
                .year(resolvedYear)
                .month(dd != null ? dd.getStartMonth() : null)
                .day(dd != null ? dd.getStartDay() : null)
                .timeQualifier(dd != null && dd.getStartTimeQualifier() != null ? dd.getStartTimeQualifier().name() : null)
                .hour(dd != null ? dd.getStartHour() : null)
                .minute(dd != null ? dd.getStartMinute() : null)
                .second(dd != null ? dd.getStartSecond() : null)
                .dateText(dd != null ? EventTimelineService.formatEventDates(dd, null) : null)
                .sortDateTime(resolveMediaSortDateTime(item, resolvedYear))
                .metadataYear(metaDd != null ? metaDd.getStartYear() : null)
                .metadataMonth(metaDd != null ? metaDd.getStartMonth() : null)
                .metadataDay(metaDd != null ? metaDd.getStartDay() : null)
                .metadataHour(metaDd != null ? metaDd.getStartHour() : null)
                .metadataMinute(metaDd != null ? metaDd.getStartMinute() : null)
                .metadataSecond(metaDd != null ? metaDd.getStartSecond() : null)
                .metadataDateText(metaDd != null ? EventTimelineService.formatEventDates(metaDd, null) : null)
                .metadataDateSource(item.getMetadataDateSource())
                .collectionId(item.getCollection() != null ? item.getCollection().getId() : null)
                .collectionName(item.getCollection() != null ? item.getCollection().getName() : null)
                .createdAt(item.getCreatedAt())
                .personIds(sortedPersons.stream().map(Person::getId).toList())
                .personNames(personNames)
                .graveIds(item.getGraves().stream().map(Grave::getId).sorted().toList())
                .cemeteryNames(cemeteryNames)
                .eventIds(item.getEvents().stream().map(Event::getId).sorted().toList())
                .eventLabels(eventLabels)
                .build();
    }

    private String trimToNull(String val) {
        if (val == null || val.isBlank()) {
            return null;
        }
        return val.trim();
    }
}