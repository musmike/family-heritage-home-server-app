package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.*;
import com.musmike.familyheritage.model.enums.*;
import com.musmike.familyheritage.model.enums.MediaPersonLinkType;
import com.musmike.familyheritage.model.enums.MediaVersionType;
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
import java.time.ZoneId;
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
    private final MediaVersionRepository mediaVersionRepository;
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

    public static String getMediaTypeSubfolder(MediaType mediaType) {
        if (mediaType == MediaType.VIDEO) return "videos";
        if (mediaType == MediaType.AUDIO) return "audio";
        return "photos";
    }

    public static MediaType detectMediaTypeFromMimeOrName(String mimeType, String originalFilename) {
        String lowerMime = mimeType != null ? mimeType.toLowerCase(Locale.ROOT) : "";
        String lowerName = originalFilename != null ? originalFilename.toLowerCase(Locale.ROOT) : "";
        if (lowerMime.startsWith("video/") || lowerName.matches(".*\\.(mp4|webm|mov|avi|mkv)$")) {
            return MediaType.VIDEO;
        }
        if (lowerMime.startsWith("audio/") || lowerMime.contains("ogg") || lowerMime.contains("mp3")
                || lowerMime.contains("wav") || lowerMime.contains("flac") || lowerMime.contains("aac")
                || lowerMime.contains("m4a") || lowerName.matches(".*\\.(mp3|wav|ogg|flac|aac|m4a)$")) {
            return MediaType.AUDIO;
        }
        return MediaType.IMAGE;
    }

    private String stripMediaTypeSubfolder(String dirPath) {
        if (dirPath == null) return "";
        if (dirPath.endsWith("/photos")) return dirPath.substring(0, dirPath.length() - 7);
        if (dirPath.endsWith("/videos")) return dirPath.substring(0, dirPath.length() - 7);
        if (dirPath.endsWith("/audio")) return dirPath.substring(0, dirPath.length() - 6);
        return dirPath;
    }

    private String ensureMediaTypeSubfolder(String baseDirPath, MediaType mediaType) {
        String stripped = stripMediaTypeSubfolder(baseDirPath);
        return stripped + "/" + getMediaTypeSubfolder(mediaType);
    }

    public String resolveGraveBaseDirectoryPath(Grave g) {
        if (g == null) {
            return "graves/unassigned/unassigned_grave";
        }
        String cemeterySlug = (g.getCemetery() != null && g.getCemetery().getName() != null)
                ? storageService.toSnakeCase(g.getCemetery().getName())
                : "unassigned";
        String graveSlug = resolveEffectiveGraveFolderSlug(g);
        return "graves/" + cemeterySlug + "/" + graveSlug;
    }

    private String resolveEffectiveGraveFolderSlug(Grave g) {
        if (g == null) return "unassigned_grave";
        if (g.getFolderSlug() != null && !g.getFolderSlug().isBlank()) {
            return storageService.toSnakeCase(g.getFolderSlug());
        }
        List<Burial> burials = burialRepository.findByGrave(g);
        if (!burials.isEmpty()) {
            List<String> slugs = burials.stream()
                    .map(Burial::getPerson)
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(Person::getId))
                    .limit(3)
                    .map(this::buildPersonSlug)
                    .filter(s -> !s.isBlank())
                    .toList();
            if (!slugs.isEmpty()) {
                return String.join("_and_", slugs) + "_grave";
            }
        }
        if (g.getSection() != null || g.getGraveNumber() != null) {
            String coords = ((g.getSection() != null ? "sec_" + g.getSection() : "") + "_"
                    + (g.getGraveNumber() != null ? "no_" + g.getGraveNumber() : "")).trim();
            String cleanCoords = storageService.toSnakeCase(coords);
            if (!cleanCoords.isBlank() && !"unnamed".equals(cleanCoords)) {
                return "grave_" + cleanCoords;
            }
        }
        return "unassigned_grave";
    }

    @Transactional
    public void syncGraveMediaPathsOnGraveChange(Grave grave) {
        if (grave == null || grave.getId() == null) return;
        String baseGraveDir = resolveGraveBaseDirectoryPath(grave);
        List<MediaItem> graveMedia = mediaItemRepository.findByGravesIdOrderByIdAsc(grave.getId());
        Set<String> oldParentDirs = new HashSet<>();

        for (MediaItem item : graveMedia) {
            if (item.getPrimaryContext() != MediaPrimaryContext.GRAVE) continue;
            Long firstGraveId = item.getGraves().stream().map(Grave::getId).min(Long::compareTo).orElse(null);
            if (!Objects.equals(firstGraveId, grave.getId())) continue;

            String oldBaseDir = stripMediaTypeSubfolder(extractDirectoryPath(item.getRelativePath()));
            if (!oldBaseDir.equals(baseGraveDir)) {
                oldParentDirs.add(oldBaseDir);
            }
            String targetDir = ensureMediaTypeSubfolder(baseGraveDir, item.getMediaType());
            relocateSingleMediaItemToDirectory(item, targetDir, item.getFileName());
            mediaItemRepository.saveAndFlush(item);
        }

        for (String oldDir : oldParentDirs) {
            storageService.deleteDirectoryRecursively(oldDir);
        }
    }

    @Transactional
    public void mergeGraveMediaIntoTargetGrave(Grave sourceGrave, Grave targetGrave) {
        if (sourceGrave == null || targetGrave == null || sourceGrave.getId() == null) return;
        String oldSourceBaseDir = resolveGraveBaseDirectoryPath(sourceGrave);
        List<MediaItem> sourceMedia = mediaItemRepository.findByGravesIdOrderByIdAsc(sourceGrave.getId());
        for (MediaItem item : sourceMedia) {
            item.getGraves().removeIf(g -> g.getId().equals(sourceGrave.getId()));
            item.getGraves().add(targetGrave);
            if (targetGrave.getPrimaryMedia() == null && item.getMediaType() == MediaType.IMAGE) {
                targetGrave.setPrimaryMedia(item);
            }
            mediaItemRepository.saveAndFlush(item);
        }
        if (sourceGrave.getPrimaryMedia() != null) {
            sourceGrave.setPrimaryMedia(null);
            graveRepository.saveAndFlush(sourceGrave);
        }
        graveRepository.saveAndFlush(targetGrave);
        syncGraveMediaPathsOnGraveChange(targetGrave);
        storageService.deleteDirectoryRecursively(oldSourceBaseDir);
    }

    // ============================================================
    // GALLERY / COLLECTIONS
    // ============================================================

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
        long totalAudios = allItems.stream().filter(m -> m.getMediaType() == MediaType.AUDIO).count();

        List<MediaItemDto> filtered = allItems.stream()
                .filter(m -> mediaType == null || m.getMediaType() == mediaType)
                .filter(m -> primaryContext == null || m.getPrimaryContext() == primaryContext)
                .filter(m -> collectionId == null || m.getOrderedCollections().stream().anyMatch(c -> c.getId().equals(collectionId)))
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
                .totalAudiosCount(totalAudios)
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

        MediaCollection parentCol = null;
        if (req.getParentCollectionId() != null) {
            parentCol = mediaCollectionRepository.findById(req.getParentCollectionId())
                    .orElseThrow(() -> new IllegalArgumentException("Parent collection not found: " + req.getParentCollectionId()));
        }

        Person founder = null;
        if (req.getFounderPersonId() != null) {
            founder = personRepository.findById(req.getFounderPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + req.getFounderPersonId()));
        }

        MediaCollection col = new MediaCollection();
        col.setName(req.getName().trim());
        col.setDescription(trimToNull(req.getDescription()));
        col.setParentCollection(parentCol);
        col.setFounderPerson(founder);

        applyCollectionDateDescriptors(col, req);

        String datePrefix = buildDatePrefix(col.getStartDate(), col.getEndDate());
        String cleanUserSlug = (req.getCustomSlug() != null && !req.getCustomSlug().isBlank())
                ? storageService.toSnakeCase(req.getCustomSlug())
                : storageService.toSnakeCase(req.getName());
        cleanUserSlug = cleanUserSlug.replaceFirst("^\\d{4}(_\\d{2})*(_\\d{2})*(-_)?(\\d{4}(_\\d{2})*(_\\d{2})*_)?", "");
        if (cleanUserSlug.isBlank()) cleanUserSlug = storageService.toSnakeCase(req.getName());

        String rawSlug = !datePrefix.isEmpty() ? datePrefix + "_" + cleanUserSlug : cleanUserSlug;
        String baseSlug = storageService.toSnakeCase(rawSlug);
        String uniqueSlug = baseSlug;
        int counter = 2;
        while (mediaCollectionRepository.findBySlug(uniqueSlug).isPresent()) {
            uniqueSlug = baseSlug + "_" + counter++;
        }
        col.setSlug(uniqueSlug);

        col = mediaCollectionRepository.saveAndFlush(col);

        return toCollectionDto(col);
    }

    @Transactional
    public MediaCollectionDto updateCollection(Long collectionId, SaveMediaCollectionRequestDto req) {
        MediaCollection col = mediaCollectionRepository.findById(collectionId)
                .orElseThrow(() -> new IllegalArgumentException("Collection not found: " + collectionId));
        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("Collection name cannot be blank.");
        }

        String oldDir = resolveCollectionDirectoryPath(col);

        col.setName(req.getName().trim());
        col.setDescription(trimToNull(req.getDescription()));

        if (req.getParentCollectionId() != null) {
            if (req.getParentCollectionId().equals(collectionId)) {
                throw new IllegalArgumentException("Collection cannot be its own parent.");
            }
            MediaCollection parentCol = mediaCollectionRepository.findById(req.getParentCollectionId())
                    .orElseThrow(() -> new IllegalArgumentException("Parent collection not found: " + req.getParentCollectionId()));
            col.setParentCollection(parentCol);
        } else {
            col.setParentCollection(null);
        }

        Person founder = null;
        if (req.getFounderPersonId() != null) {
            founder = personRepository.findById(req.getFounderPersonId())
                    .orElseThrow(() -> new IllegalArgumentException("Person not found: " + req.getFounderPersonId()));
        }
        col.setFounderPerson(founder);

        applyCollectionDateDescriptors(col, req);

        String datePrefix = buildDatePrefix(col.getStartDate(), col.getEndDate());
        String cleanUserSlug = (req.getCustomSlug() != null && !req.getCustomSlug().isBlank())
                ? storageService.toSnakeCase(req.getCustomSlug())
                : storageService.toSnakeCase(req.getName());
        cleanUserSlug = cleanUserSlug.replaceFirst("^\\d{4}(_\\d{2})*(_\\d{2})*(-_)?(\\d{4}(_\\d{2})*(_\\d{2})*_)?", "");
        if (cleanUserSlug.isBlank()) cleanUserSlug = storageService.toSnakeCase(req.getName());

        String desiredSlug = !datePrefix.isEmpty() ? datePrefix + "_" + cleanUserSlug : cleanUserSlug;
        if (!desiredSlug.equals(col.getSlug())) {
            String uniqueSlug = desiredSlug;
            int counter = 2;
            while (mediaCollectionRepository.findBySlug(uniqueSlug)
                    .filter(c -> !c.getId().equals(collectionId))
                    .isPresent()) {
                uniqueSlug = desiredSlug + "_" + counter++;
            }
            col.setSlug(uniqueSlug);
        }

        MediaCollection savedCol = mediaCollectionRepository.saveAndFlush(col);
        String newDir = resolveCollectionDirectoryPath(savedCol);

        if (!oldDir.equals(newDir)) {
            List<MediaItem> items = mediaItemRepository.findAll().stream()
                    .filter(m -> m.getOrderedCollections().stream().anyMatch(c -> c.getId().equals(collectionId)))
                    .toList();
            for (MediaItem item : items) {
                String oldRelPath = item.getRelativePath();
                if (oldRelPath != null && oldRelPath.startsWith(oldDir + "/")) {
                    String sub = oldRelPath.substring(oldDir.length() + 1);
                    String targetRelPath = newDir + "/" + sub;
                    String finalPath = storageService.moveFileToRelativePath(oldRelPath, targetRelPath);
                    item.setRelativePath(finalPath);
                    mediaItemRepository.save(item);
                }
            }
            storageService.deleteDirectoryRecursively(oldDir);
        }

        return toCollectionDto(savedCol);
    }

    @Transactional
    public void deleteCollection(Long collectionId) {
        MediaCollection col = mediaCollectionRepository.findById(collectionId)
                .orElseThrow(() -> new IllegalArgumentException("Collection not found: " + collectionId));

        List<MediaItem> items = mediaItemRepository.findAll().stream()
                .filter(m -> m.getOrderedCollections().stream().anyMatch(c -> c.getId().equals(collectionId)))
                .toList();
        List<MediaItem> exclusiveItems = new ArrayList<>();
        List<MediaItem> sharedItems = new ArrayList<>();

        for (MediaItem item : items) {
            boolean hasOtherCollections = item.getOrderedCollections().stream()
                    .anyMatch(c -> !c.getId().equals(collectionId));
            boolean hasEvents = !item.getEvents().isEmpty();
            boolean hasGraves = !item.getGraves().isEmpty();
            boolean hasPersons = !item.getPersons().isEmpty() || !item.getPersonLinks().isEmpty();
            if (!hasOtherCollections && !hasEvents && !hasGraves && !hasPersons) {
                exclusiveItems.add(item);
            } else {
                sharedItems.add(item);
            }
        }

        if (!exclusiveItems.isEmpty()) {
            throw new IllegalStateException(
                    "Nie można usunąć kolekcji, ponieważ zawiera pliki multimedialne przypisane wyłącznie do niej ("
                            + exclusiveItems.size() + " plików). Usuń lub przenieś te multimedia przed usunięciem kolekcji."
            );
        }

        for (MediaItem item : sharedItems) {
            List<MediaCollection> remainingCols = item.getOrderedCollections().stream()
                    .filter(c -> !c.getId().equals(collectionId))
                    .toList();
            applyOrderedCollectionsToMediaItem(item, remainingCols);
            MediaCollection newPrimary = item.getPrimaryCollection();

            String targetDir = resolveDirectoryForContext(
                    item.getPrimaryContext(),
                    item.getGraves().stream().findFirst().map(Grave::getId).orElse(null),
                    item.getPersons().stream().findFirst().map(Person::getId).orElse(null),
                    item.getEvents().stream().findFirst().map(Event::getId).orElse(null),
                    newPrimary != null ? newPrimary.getId() : null,
                    extractYearFromItem(item),
                    Boolean.TRUE.equals(item.getIsPortrait()),
                    Boolean.TRUE.equals(item.getIsUnknown()),
                    item.getPersons().size()
            );
            relocateSingleMediaItemToDirectory(item, targetDir, item.getFileName());
            mediaItemRepository.save(item);
        }

        String colDir = resolveCollectionDirectoryPath(col);
        storageService.deleteDirectoryRecursively(colDir);

        for (MediaCollection child : mediaCollectionRepository.findAll()) {
            if (child.getParentCollection() != null && child.getParentCollection().getId().equals(collectionId)) {
                child.setParentCollection(col.getParentCollection());
                mediaCollectionRepository.save(child);
            }
        }

        mediaCollectionRepository.delete(col);
        mediaCollectionRepository.flush();
    }

    private Integer extractYearFromItem(MediaItem item) {
        if (item.getDateDescriptor() != null && item.getDateDescriptor().getStartYear() != null) {
            return item.getDateDescriptor().getStartYear();
        }
        if (item.getMetadataDateDescriptor() != null && item.getMetadataDateDescriptor().getStartYear() != null) {
            return item.getMetadataDateDescriptor().getStartYear();
        }
        return null;
    }

    @Transactional
    public void prepareEventDeletion(Long eventId) {
        Event evt = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));

        List<MediaItem> eventMedia = mediaItemRepository.findByEventsIdOrderByIdAsc(eventId);

        List<MediaItem> exclusiveItems = new ArrayList<>();
        List<MediaItem> sharedItems = new ArrayList<>();

        for (MediaItem item : eventMedia) {
            boolean hasOtherEvents = item.getEvents().stream().anyMatch(e -> !e.getId().equals(eventId));
            boolean hasGraves = !item.getGraves().isEmpty();
            boolean hasCollection = !item.getOrderedCollections().isEmpty();
            boolean hasPersons = !item.getPersons().isEmpty() || !item.getPersonLinks().isEmpty();

            if (!hasOtherEvents && !hasGraves && !hasCollection && !hasPersons) {
                exclusiveItems.add(item);
            } else {
                sharedItems.add(item);
            }
        }

        if (!exclusiveItems.isEmpty()) {
            throw new IllegalStateException("Nie można usunąć wydarzenia, ponieważ zawiera pliki multimedialne przypisane wyłącznie do niego ("
                    + exclusiveItems.size() + " plików). Usuń lub przenieś te multimedia przed usunięciem wydarzenia.");
        }

        for (MediaItem item : sharedItems) {
            item.getEvents().removeIf(e -> e.getId().equals(eventId));

            Long remainingEvtId = item.getEvents().stream().findFirst().map(Event::getId).orElse(null);
            Long remainingColId = item.getPrimaryCollection() != null ? item.getPrimaryCollection().getId() : null;
            Long remainingGraveId = item.getGraves().stream().findFirst().map(Grave::getId).orElse(null);
            Long remainingPersonId = item.getPersons().stream().findFirst().map(Person::getId).orElse(null);

            String targetDir = resolveDirectoryForContext(
                    item.getPrimaryContext() == MediaPrimaryContext.EVENT && remainingEvtId == null
                            ? (remainingGraveId != null ? MediaPrimaryContext.GRAVE : (remainingPersonId != null ? MediaPrimaryContext.PERSON : MediaPrimaryContext.OTHER))
                            : item.getPrimaryContext(),
                    remainingGraveId,
                    remainingPersonId,
                    remainingEvtId,
                    remainingColId,
                    extractYearFromItem(item),
                    Boolean.TRUE.equals(item.getIsPortrait()),
                    Boolean.TRUE.equals(item.getIsUnknown()),
                    item.getPersons().size()
            );

            relocateSingleMediaItemToDirectory(item, targetDir, item.getFileName());
            mediaItemRepository.save(item);
        }

        String eventDir = resolveEventDirectoryPath(evt, null);
        storageService.deleteDirectoryRecursively(eventDir);
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
                customYear, null, customFileName, originalFilename, mimeType,
                primaryContext == MediaPrimaryContext.PERSON, false, 1
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
            String mimeType,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Integer personsCount
    ) {
        String ext = storageService.extractExtension(originalFilename, mimeType);
        MediaType detectedType = detectMediaTypeFromMimeOrName(mimeType, originalFilename);
        String baseDir = resolveBaseDirectoryForContext(
                primaryContext, graveId, personId, eventId, collectionId, customYear,
                portraitMedia, unknownMedia, personsCount
        );
        if (customFolderName != null && !customFolderName.isBlank()) {
            String cleanFolderSlug = preserveMandatoryDatePrefixForFolder(
                    primaryContext, eventId, collectionId, customYear, customFolderName
            );
            baseDir = replaceLastDirectorySegment(baseDir, cleanFolderSlug);
        }
        String dir = ensureMediaTypeSubfolder(baseDir, detectedType);
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

    private String preserveMandatoryDatePrefixForFolder(
            MediaPrimaryContext primaryContext,
            Long eventId,
            Long collectionId,
            Integer customYear,
            String rawCustomFolderName
    ) {
        String basePart = storageService.toSnakeCase(rawCustomFolderName)
                .replaceFirst("^\\d{4}(_\\d{2})*(_\\d{2})*(-_)?(\\d{4}(_\\d{2})*(_\\d{2})*_)?", "")
                .replaceFirst("^_", "");
        if (basePart.isBlank()) {
            basePart = storageService.toSnakeCase(rawCustomFolderName);
        }

        String datePrefix = "";
        if (primaryContext == MediaPrimaryContext.EVENT && eventId != null) {
            Event evt = eventRepository.findById(eventId).orElse(null);
            if (evt != null) {
                datePrefix = buildDatePrefix(evt.getStartDate(), evt.getEndDate());
                if (datePrefix.isEmpty() && customYear != null) {
                    datePrefix = String.valueOf(customYear);
                }
            }
        } else if (collectionId != null) {
            MediaCollection col = mediaCollectionRepository.findById(collectionId).orElse(null);
            if (col != null && Boolean.TRUE.equals(col.getIsDatedCollection())) {
                datePrefix = buildDatePrefix(col.getStartDate(), col.getEndDate());
            }
        }
        return datePrefix.isEmpty() ? basePart : datePrefix + "_" + basePart;
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
                null,
                description,
                null,
                graveId,
                eventId,
                collectionId,
                primaryContext == MediaPrimaryContext.PERSON,
                false,
                false,
                "EXACT",
                customYear,
                customMonth,
                customDay,
                "EXACT",
                customHour,
                customMinute,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
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
            String inscriptionText,
            String description,
            String sourceText,
            Long graveId,
            Long eventId,
            Long collectionId,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Boolean isBetweenRange,
            String dateQualifier,
            Integer customYear,
            Integer customMonth,
            Integer customDay,
            String timeQualifier,
            Integer customHour,
            Integer customMinute,
            Integer customSecond,
            String rangeEndQualifier,
            Integer rangeEndYear,
            Integer rangeEndMonth,
            Integer rangeEndDay,
            String rangeEndTimeQualifier,
            Integer rangeEndHour,
            Integer rangeEndMinute,
            Integer rangeEndSecond,
            String selectedMetadataSourceTag,
            Long clientLastModifiedMs,
            List<Long> personIds,
            boolean setAsPersonAvatar,
            boolean setAsGravePrimary
    ) throws IOException {
        List<Long> colIds = collectionId != null ? List.of(collectionId) : List.of();
        return uploadMediaWithCollections(
                file, primaryContext, customFolderName, customFileName,
                title, inscriptionText, description, sourceText,
                graveId, eventId, colIds, portraitMedia, unknownMedia,
                isBetweenRange, dateQualifier, customYear, customMonth, customDay,
                timeQualifier, customHour, customMinute, customSecond,
                rangeEndQualifier, rangeEndYear, rangeEndMonth, rangeEndDay,
                rangeEndTimeQualifier, rangeEndHour, rangeEndMinute, rangeEndSecond,
                selectedMetadataSourceTag, clientLastModifiedMs, personIds,
                setAsPersonAvatar, setAsGravePrimary
        );
    }

    @Transactional
    public MediaItemDto uploadMediaWithCollections(
            MultipartFile file,
            MediaPrimaryContext primaryContext,
            String customFolderName,
            String customFileName,
            String title,
            String inscriptionText,
            String description,
            String sourceText,
            Long graveId,
            Long eventId,
            List<Long> collectionIds,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Boolean isBetweenRange,
            String dateQualifier,
            Integer customYear,
            Integer customMonth,
            Integer customDay,
            String timeQualifier,
            Integer customHour,
            Integer customMinute,
            Integer customSecond,
            String rangeEndQualifier,
            Integer rangeEndYear,
            Integer rangeEndMonth,
            Integer rangeEndDay,
            String rangeEndTimeQualifier,
            Integer rangeEndHour,
            Integer rangeEndMinute,
            Integer rangeEndSecond,
            String selectedMetadataSourceTag,
            Long clientLastModifiedMs,
            List<Long> personIds,
            boolean setAsPersonAvatar,
            boolean setAsGravePrimary
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file cannot be empty.");
        }

        byte[] headerBytes = readHeaderBytes(file, 262144);
        String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        String lowerMime = mimeType.toLowerCase(Locale.ROOT);
        MediaType mediaType;
        if (lowerMime.startsWith("video/")) {
            mediaType = MediaType.VIDEO;
        } else if (lowerMime.startsWith("audio/") || lowerMime.contains("ogg") || lowerMime.contains("mp3")
                || lowerMime.contains("wav") || lowerMime.contains("flac") || lowerMime.contains("aac")
                || lowerMime.contains("m4a")) {
            mediaType = MediaType.AUDIO;
        } else {
            mediaType = MediaType.IMAGE;
        }

        List<MediaCollection> resolvedCollections = resolveOrderedCollections(collectionIds);

        Event linkedEvent = null;
        if (eventId != null) {
            linkedEvent = eventRepository.findById(eventId)
                    .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));
            if (customFolderName != null && !customFolderName.isBlank()) {
                String normalizedFolder = storageService.toSnakeCase(customFolderName);
                if (!normalizedFolder.equals(linkedEvent.getFolderSlug())) {
                    linkedEvent.setFolderSlug(normalizedFolder);
                    linkedEvent = eventRepository.saveAndFlush(linkedEvent);
                    syncEventMediaPathsOnEventChange(linkedEvent);
                }
            }
        }

        Grave linkedGrave = null;
        if (graveId != null) {
            linkedGrave = graveRepository.findById(graveId)
                    .orElseThrow(() -> new IllegalArgumentException("Grave not found: " + graveId));
            if (customFolderName != null && !customFolderName.isBlank() && primaryContext == MediaPrimaryContext.GRAVE) {
                String normalizedGraveFolder = storageService.toSnakeCase(customFolderName);
                if (!normalizedGraveFolder.equals(linkedGrave.getFolderSlug())) {
                    linkedGrave.setFolderSlug(normalizedGraveFolder);
                    linkedGrave = graveRepository.saveAndFlush(linkedGrave);
                    syncGraveMediaPathsOnGraveChange(linkedGrave);
                }
            }
        }

        Long primaryCollectionId = resolvedCollections.isEmpty() ? null : resolvedCollections.getFirst().getId();
        boolean isPortrait = Boolean.TRUE.equals(portraitMedia) || primaryContext == MediaPrimaryContext.PERSON;
        boolean isUnknown = Boolean.TRUE.equals(unknownMedia);
        int personsCount = personIds != null ? personIds.size() : 0;
        Long primaryPersonId = (personIds != null && !personIds.isEmpty()) ? personIds.getFirst() : null;

        MediaFilenamePreviewDto preview = previewFilenameWithFolder(
                primaryContext, graveId, primaryPersonId, eventId,
                primaryCollectionId, customYear, customFolderName, customFileName,
                file.getOriginalFilename(), mimeType, isPortrait, isUnknown, personsCount
        );

        MediaItem item = new MediaItem();
        item.setMediaType(mediaType);
        item.setPrimaryContext(primaryContext);
        item.setIsPortrait(isPortrait);
        item.setIsUnknown(isUnknown);
        item.setRelativePath(preview.getFullRelativePath());
        item.setFileName(preview.getSuggestedFileName());
        item.setMimeType(mimeType);
        item.setFileSize(file.getSize());
        item.setTitle(trimToNull(title));
        item.setInscriptionText(trimToNull(inscriptionText));
        item.setDescription(trimToNull(description));
        item.setSourceText(trimToNull(sourceText));

        List<MediaMetadataExtractor.ExtractedMetadata> allMeta =
                metadataExtractor.extractAllDates(headerBytes, mimeType, clientLastModifiedMs);
        MediaMetadataExtractor.ExtractedMetadata chosenMeta =
                selectMetadataOption(allMeta, selectedMetadataSourceTag);
        if (chosenMeta != null && chosenMeta.year() != null) {
            item.setMetadataDateDescriptor(chosenMeta.toDateDescriptor());
            item.setMetadataDateSource(chosenMeta.sourceTag());
        }

        if (customYear != null && customYear >= 1000 && customYear <= 2999) {
            DateDescriptor dd = new DateDescriptor();
            populateMediaDateDescriptor(
                    dd, isBetweenRange,
                    dateQualifier, customYear, customMonth, customDay,
                    timeQualifier, customHour, customMinute, customSecond,
                    rangeEndQualifier, rangeEndYear, rangeEndMonth, rangeEndDay,
                    rangeEndTimeQualifier, rangeEndHour, rangeEndMinute, rangeEndSecond
            );
            item.setDateDescriptor(dd);
        }

        if (personIds != null && !personIds.isEmpty()) {
            List<Person> people = personRepository.findAllById(personIds.stream().filter(id -> id != null && id > 0).toList());
            item.getPersons().addAll(people);
            for (Person p : people) {
                item.getPersonLinks().add(new MediaPersonLink(item, p, MediaPersonLinkType.DEPICTED));
            }
        }

        if (linkedGrave != null) {
            item.getGraves().add(linkedGrave);
        }
        if (linkedEvent != null) {
            item.getEvents().add(linkedEvent);
        }

        item = mediaItemRepository.saveAndFlush(item);
        applyOrderedCollectionsToMediaItem(item, resolvedCollections);
        item = mediaItemRepository.saveAndFlush(item);

        Long diskTimestampMs = resolveOriginalTimestampMs(clientLastModifiedMs, chosenMeta);
        boolean isGif = mimeType.toLowerCase(Locale.ROOT).contains("gif");
        try (java.io.InputStream fileStream = file.getInputStream()) {
            storageService.saveStreamAndThumbnail(
                    item.getRelativePath(),
                    item.getId(),
                    fileStream,
                    mediaType == MediaType.IMAGE && !isGif,
                    diskTimestampMs
            );
        }

        if (primaryPersonId != null && primaryPersonId > 0 && mediaType != MediaType.AUDIO) {
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
                files, primaryContext, null, customFileNames, titles, customYears,
                null, null, null, null, null, null, null,
                graveId, eventId, collectionId,
                primaryContext == MediaPrimaryContext.PERSON, false,
                defaultYear, commonPersonIds
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
            List<String> selectedMetadataSourceTags,
            List<Long> clientLastModifiedList,
            Long graveId,
            Long eventId,
            Long collectionId,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Integer defaultYear,
            List<Long> commonPersonIds
    ) throws IOException {
        List<Long> colIds = collectionId != null ? List.of(collectionId) : List.of();
        return uploadBatchMediaWithCollections(
                files, primaryContext, customFolderName, customFileNames, titles,
                customYears, customMonths, customDays, customHours, customMinutes, customSeconds,
                selectedMetadataSourceTags, clientLastModifiedList,
                graveId, eventId, colIds, portraitMedia, unknownMedia, defaultYear, commonPersonIds
        );
    }

    @Transactional
    public List<MediaItemDto> uploadBatchMediaWithCollections(
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
            List<String> selectedMetadataSourceTags,
            List<Long> clientLastModifiedList,
            Long graveId,
            Long eventId,
            List<Long> collectionIds,
            Boolean portraitMedia,
            Boolean unknownMedia,
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
            String cMetaTag = getListElem(selectedMetadataSourceTags, i);
            Long cLastMod = getListElem(clientLastModifiedList, i);

            results.add(uploadMediaWithCollections(
                    f, primaryContext, customFolderName, cName, cTitle, null, null, null,
                    graveId, eventId, collectionIds, portraitMedia, unknownMedia,
                    false, "EXACT", cYear, cMonth, cDay, "EXACT", cHour, cMinute, cSecond,
                    null, null, null, null, null, null, null, null,
                    cMetaTag, cLastMod, commonPersonIds, false, false
            ));
        }
        return results;
    }

    @Transactional
    public MediaItemDto updateMedia(Long mediaId, UpdateMediaItemRequestDto req) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        if (req.getPortrait() != null) {
            item.setIsPortrait(req.getPortrait());
            if (Boolean.TRUE.equals(req.getPortrait())) {
                item.setIsUnknown(false);
            }
        }
        if (req.getUnknownMedia() != null) {
            item.setIsUnknown(req.getUnknownMedia());
            if (Boolean.TRUE.equals(req.getUnknownMedia())) {
                item.setIsPortrait(false);
            }
        }

        if (req.getCollectionIds() != null || req.getCollectionId() != null) {
            List<Long> requestedColIds = req.getCollectionIds() != null
                    ? req.getCollectionIds()
                    : List.of(req.getCollectionId());
            List<MediaCollection> resolvedCols = resolveOrderedCollections(requestedColIds);
            applyOrderedCollectionsToMediaItem(item, resolvedCols);
        }

        if (req.getCustomFolderName() != null && !req.getCustomFolderName().isBlank()) {
            String newFolderSlug = storageService.toSnakeCase(req.getCustomFolderName());
            Event targetEvent = resolvePrimaryEventForMedia(item, req.getContextEventId());
            if (targetEvent != null && item.getPrimaryContext() == MediaPrimaryContext.EVENT) {
                targetEvent.setFolderSlug(newFolderSlug);
                targetEvent = eventRepository.saveAndFlush(targetEvent);
                syncEventMediaPathsOnEventChange(targetEvent);
                item = mediaItemRepository.findById(mediaId).orElseThrow();
            } else if (!item.getGraves().isEmpty() && item.getPrimaryContext() == MediaPrimaryContext.GRAVE) {
                Grave targetGrave = item.getGraves().stream()
                        .min(Comparator.comparing(Grave::getId))
                        .orElse(null);
                if (targetGrave != null) {
                    targetGrave.setFolderSlug(newFolderSlug);
                    targetGrave = graveRepository.saveAndFlush(targetGrave);
                    syncGraveMediaPathsOnGraveChange(targetGrave);
                    item = mediaItemRepository.findById(mediaId).orElseThrow();
                }
            } else if (item.getPrimaryCollection() != null && item.getEvents().isEmpty() && item.getGraves().isEmpty()) {
                updateCollectionSlugAndRelocateAll(item.getPrimaryCollection(), newFolderSlug);
                item = mediaItemRepository.findById(mediaId).orElseThrow();
            } else {
                String currentDir = stripMediaTypeSubfolder(extractDirectoryPath(item.getRelativePath()));
                MediaCollection pCol = item.getPrimaryCollection();
                String safeSlug = preserveMandatoryDatePrefixForFolder(
                        item.getPrimaryContext(), null,
                        pCol != null ? pCol.getId() : null,
                        extractYearFromItem(item), newFolderSlug
                );
                String targetDir = replaceLastDirectorySegment(currentDir, safeSlug);
                moveAllMediaInDirectory(currentDir, targetDir);
                item = mediaItemRepository.findById(mediaId).orElseThrow();
            }
        }

        if (req.getFileName() != null && !req.getFileName().isBlank()) {
            String ext = storageService.extractExtension(item.getFileName(), item.getMimeType());
            String sanitizedNewName = storageService.sanitizeFileName(req.getFileName(), ext);
            if (!sanitizedNewName.equals(item.getFileName())) {
                String newRelPath = storageService.renameFileInSameDirectory(item.getRelativePath(), sanitizedNewName);
                item.setFileName(sanitizedNewName);
                item.setRelativePath(newRelPath);
                for (MediaVersion v : item.getVersions()) {
                    if (Boolean.TRUE.equals(v.getIsMain())) {
                        v.setFileName(sanitizedNewName);
                        v.setRelativePath(newRelPath);
                    }
                }
            }
        }

        if (req.getTitle() != null) {
            item.setTitle(trimToNull(req.getTitle()));
        }
        if (req.getInscriptionText() != null) {
            item.setInscriptionText(trimToNull(req.getInscriptionText()));
        }
        if (req.getDescription() != null) {
            item.setDescription(trimToNull(req.getDescription()));
        }
        if (req.getSourceText() != null) {
            item.setSourceText(trimToNull(req.getSourceText()));
        }

        applyDateModeToMediaItem(
                item, req.getDateSourceMode(), req.getSelectedMetadataSourceTag(), req.getContextEventId(),
                req.getIsBetweenRange(),
                req.getDateQualifier(), req.getYear(), req.getMonth(), req.getDay(),
                req.getTimeQualifier(), req.getHour(), req.getMinute(), req.getSecond(),
                req.getRangeEndQualifier(), req.getRangeEndYear(), req.getRangeEndMonth(), req.getRangeEndDay(),
                req.getRangeEndTimeQualifier(), req.getRangeEndHour(), req.getRangeEndMinute(), req.getRangeEndSecond()
        );

        if (req.getPersonLinks() != null) {
            item.getPersonLinks().clear();
            item.getPersons().clear();
            mediaItemRepository.saveAndFlush(item);

            Set<Long> uniqueDbPersonIds = new HashSet<>();
            for (SaveMediaPersonLinkRequestDto linkReq : req.getPersonLinks()) {
                MediaPersonLinkType lType = parsePersonLinkType(linkReq.getLinkType());
                if (linkReq.getPersonId() != null) {
                    Person p = personRepository.findById(linkReq.getPersonId()).orElse(null);
                    if (p != null) {
                        item.getPersonLinks().add(new MediaPersonLink(item, p, lType));
                        if (lType != MediaPersonLinkType.AUTHOR && uniqueDbPersonIds.add(p.getId())) {
                            item.getPersons().add(p);
                        }
                    }
                } else if (linkReq.getPersonText() != null && !linkReq.getPersonText().isBlank()) {
                    PersonSex pSex = linkReq.getPersonSex() != null ? linkReq.getPersonSex() : PersonSex.UNKNOWN;
                    item.getPersonLinks().add(new MediaPersonLink(item, linkReq.getPersonText().trim(), pSex, lType));
                }
            }
        } else if (req.getPersonIds() != null) {
            List<Person> people = personRepository.findAllById(req.getPersonIds());
            item.getPersons().clear();
            item.getPersons().addAll(people);
            item.getPersonLinks().removeIf(l -> l.getLinkType() == MediaPersonLinkType.DEPICTED && l.getPerson() != null);
            for (Person p : people) {
                item.getPersonLinks().add(new MediaPersonLink(item, p, MediaPersonLinkType.DEPICTED));
            }
        }

        relocateCollectionMediaItemIfNeeded(item, req.getGroupPortrait());

        item = mediaItemRepository.saveAndFlush(item);

        if (req.getSetAsAvatarForPersonId() != null) {
            if (item.getMediaType() == MediaType.AUDIO) {
                throw new IllegalArgumentException("Plik dźwiękowy (audio) nie może zostać ustawiony jako portret profilowy osoby.");
            }
            MediaItem finalItem = item;
            personRepository.findById(req.getSetAsAvatarForPersonId()).ifPresent(p -> {
                p.setAvatarMedia(finalItem);
                if (req.getAvatarCropX() != null) p.setAvatarCropX(Math.clamp(req.getAvatarCropX(), 0, 100));
                if (req.getAvatarCropY() != null) p.setAvatarCropY(Math.clamp(req.getAvatarCropY(), 0, 100));
                if (req.getAvatarCropZoom() != null) p.setAvatarCropZoom(Math.clamp(req.getAvatarCropZoom(), 1.0, 5.0));
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
    public MediaItemDto uploadMediaVersion(
            Long mediaId,
            MultipartFile file,
            String versionTypeStr,
            String customLabel,
            boolean setAsMain
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Plik wersji nie może być pusty.");
        }
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        if (item.getVersions().isEmpty()) {
            MediaVersion origVer = new MediaVersion();
            origVer.setMediaItem(item);
            origVer.setVersionType(MediaVersionType.ORIGINAL);
            origVer.setVersionLabel(MediaVersionType.ORIGINAL.getDefaultLabel());
            origVer.setRelativePath(item.getRelativePath());
            origVer.setFileName(item.getFileName());
            origVer.setMimeType(item.getMimeType());
            origVer.setFileSize(item.getFileSize());
            origVer.setIsMain(true);
            item.getVersions().add(origVer);
            item = mediaItemRepository.saveAndFlush(item);
        }

        MediaVersionType vType;
        try {
            vType = versionTypeStr != null
                    ? MediaVersionType.valueOf(versionTypeStr.trim().toUpperCase(Locale.ROOT))
                    : MediaVersionType.OTHER;
        } catch (IllegalArgumentException e) {
            vType = MediaVersionType.OTHER;
        }

        String vLabel = (customLabel != null && !customLabel.isBlank())
                ? customLabel.trim()
                : vType.getDefaultLabel();

        String dir = extractDirectoryPath(item.getRelativePath());
        String mimeType = file.getContentType() != null ? file.getContentType() : item.getMimeType();
        String ext = storageService.extractExtension(file.getOriginalFilename(), mimeType);
        String stem = item.getFileName().replaceFirst("\\.[^.]+$", "")
                .replaceFirst("_(original|restored|colorized|enhanced|reverse|other)(_\\d+)?$", "");
        String verFileName = findAvailableFileName(dir, stem + "_" + vType.name().toLowerCase(Locale.ROOT), ext);
        String verRelPath = dir + "/" + verFileName;

        boolean makeMain = setAsMain && vType != MediaVersionType.REVERSE;

        MediaVersion newVer = new MediaVersion();
        newVer.setMediaItem(item);
        newVer.setVersionType(vType);
        newVer.setVersionLabel(vLabel);
        newVer.setRelativePath(verRelPath);
        newVer.setFileName(verFileName);
        newVer.setMimeType(mimeType);
        newVer.setFileSize(file.getSize());
        newVer.setIsMain(makeMain);

        if (makeMain) {
            for (MediaVersion v : item.getVersions()) {
                v.setIsMain(false);
            }
            item.setRelativePath(verRelPath);
            item.setFileName(verFileName);
            item.setMimeType(mimeType);
            item.setFileSize(file.getSize());
        }

        item.getVersions().add(newVer);
        item = mediaItemRepository.saveAndFlush(item);

        boolean generateMainThumb = makeMain && item.getMediaType() == MediaType.IMAGE
                && !mimeType.toLowerCase(Locale.ROOT).contains("gif");
        try (java.io.InputStream verStream = file.getInputStream()) {
            storageService.saveStreamAndThumbnail(verRelPath, item.getId(), verStream, generateMainThumb, null);
        }

        return toDto(item, true, loadUserCodeTranslations());
    }

    @Transactional
    public MediaItemDto setMainMediaVersion(Long mediaId, Long versionId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        MediaVersion targetVer = item.getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Version not found: " + versionId));

        if (targetVer.getVersionType() == MediaVersionType.REVERSE) {
            throw new IllegalArgumentException("Strona odwrotna (Rewers) nie może być ustawiona jako główna wersja awersu.");
        }

        for (MediaVersion v : item.getVersions()) {
            v.setIsMain(v.getId().equals(versionId));
        }

        item.setRelativePath(targetVer.getRelativePath());
        item.setFileName(targetVer.getFileName());
        item.setMimeType(targetVer.getMimeType());
        item.setFileSize(targetVer.getFileSize());
        item = mediaItemRepository.saveAndFlush(item);

        byte[] bytes = storageService.readFileBytesIfExists(targetVer.getRelativePath());
        if (bytes != null && item.getMediaType() == MediaType.IMAGE && !targetVer.getMimeType().toLowerCase(Locale.ROOT).contains("gif")) {
            storageService.saveFileAndThumbnail(targetVer.getRelativePath(), item.getId(), bytes, true);
        }

        return toDto(item, true, loadUserCodeTranslations());
    }

    @Transactional
    public MediaItemDto deleteMediaVersion(Long mediaId, Long versionId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        MediaVersion targetVer = item.getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Version not found: " + versionId));

        if (Boolean.TRUE.equals(targetVer.getIsMain())) {
            throw new IllegalArgumentException(
                    "Nie można usunąć aktualnie głównej wersji pliku – najpierw ustaw inną wersję jako główną."
            );
        }

        String relPath = targetVer.getRelativePath();
        item.getVersions().remove(targetVer);
        item = mediaItemRepository.saveAndFlush(item);
        storageService.deleteFileAndThumbnail(relPath, null);

        return toDto(item, true, loadUserCodeTranslations());
    }

    @Transactional
    public Resource getMediaVersionFileResource(Long mediaId, Long versionId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));
        MediaVersion ver = item.getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Version not found: " + versionId));

        Path path = storageService.resolveMediaFilePath(ver.getRelativePath());
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("Physical version file not found on disk: " + ver.getRelativePath());
        }
        return new FileSystemResource(path);
    }

    @Transactional
    public String getVersionMimeType(Long versionId) {
        return mediaVersionRepository.findById(versionId)
                .map(MediaVersion::getMimeType)
                .orElse("application/octet-stream");
    }

    @Transactional
    public List<MediaItemDto> bulkUpdateMedia(BulkUpdateMediaRequestDto req) {
        if (req.getMediaIds() == null || req.getMediaIds().isEmpty()) {
            throw new IllegalArgumentException("Lista plików do edycji zbiorowej nie może być pusta.");
        }
        Map<Long, String> userCodeTranslations = loadUserCodeTranslations();

        String newFolderSlug = (req.getCustomFolderName() != null && !req.getCustomFolderName().isBlank())
                ? storageService.toSnakeCase(req.getCustomFolderName())
                : null;

        if (newFolderSlug != null && req.getContextEventId() != null) {
            eventRepository.findById(req.getContextEventId()).ifPresent(evt -> {
                evt.setFolderSlug(newFolderSlug);
                Event savedEvt = eventRepository.saveAndFlush(evt);
                syncEventMediaPathsOnEventChange(savedEvt);
            });
        }

        List<Long> targetColIds = new ArrayList<>();
        if (req.getTargetCollectionIds() != null && !req.getTargetCollectionIds().isEmpty()) {
            targetColIds.addAll(req.getTargetCollectionIds());
        } else if (req.getTargetCollectionId() != null) {
            targetColIds.add(req.getTargetCollectionId());
        }
        List<MediaCollection> targetCollections = resolveOrderedCollections(targetColIds);

        List<MediaItem> items = mediaItemRepository.findAllById(req.getMediaIds()).stream()
                .sorted(Comparator.comparing(MediaItem::getId))
                .toList();

        if (newFolderSlug != null && req.getContextEventId() == null && targetCollections.isEmpty() && !items.isEmpty()) {
            MediaItem first = items.getFirst();
            if (first.getPrimaryCollection() != null && first.getEvents().isEmpty() && first.getGraves().isEmpty()) {
                updateCollectionSlugAndRelocateAll(first.getPrimaryCollection(), newFolderSlug);
                items = mediaItemRepository.findAllById(req.getMediaIds()).stream()
                        .sorted(Comparator.comparing(MediaItem::getId))
                        .toList();
            } else if (!first.getGraves().isEmpty() && first.getPrimaryContext() == MediaPrimaryContext.GRAVE) {
                Grave targetGrave = first.getGraves().stream()
                        .min(Comparator.comparing(Grave::getId))
                        .orElse(null);
                if (targetGrave != null) {
                    targetGrave.setFolderSlug(newFolderSlug);
                    targetGrave = graveRepository.saveAndFlush(targetGrave);
                    syncGraveMediaPathsOnGraveChange(targetGrave);
                    items = mediaItemRepository.findAllById(req.getMediaIds()).stream()
                            .sorted(Comparator.comparing(MediaItem::getId))
                            .toList();
                }
            } else {
                String currentDir = stripMediaTypeSubfolder(extractDirectoryPath(first.getRelativePath()));
                MediaCollection pCol = first.getPrimaryCollection();
                String safeSlug = preserveMandatoryDatePrefixForFolder(
                        first.getPrimaryContext(), null,
                        pCol != null ? pCol.getId() : null,
                        extractYearFromItem(first), newFolderSlug
                );
                String targetDir = replaceLastDirectorySegment(currentDir, safeSlug);
                moveAllMediaInDirectory(currentDir, targetDir);
                items = mediaItemRepository.findAllById(req.getMediaIds()).stream()
                        .sorted(Comparator.comparing(MediaItem::getId))
                        .toList();
            }
        }

        String cleanStem = (req.getBaseFileNameStem() != null && !req.getBaseFileNameStem().isBlank())
                ? storageService.toSnakeCase(req.getBaseFileNameStem()).replaceFirst("_\\d{1,3}$", "")
                : null;

        List<MediaItemDto> updatedDtos = new ArrayList<>();
        int index = 1;
        for (MediaItem item : items) {
            if (!targetCollections.isEmpty()) {
                applyOrderedCollectionsToMediaItem(item, targetCollections);
            }

            Boolean bulkGroupPortrait = null;
            if (req.getCategoryMode() != null && !"NO_CHANGE".equalsIgnoreCase(req.getCategoryMode())) {
                switch (req.getCategoryMode().trim().toUpperCase(Locale.ROOT)) {
                    case "REGULAR" -> {
                        item.setIsPortrait(false);
                        item.setIsUnknown(false);
                        bulkGroupPortrait = false;
                    }
                    case "PORTRAIT_SINGLE" -> {
                        item.setIsPortrait(true);
                        item.setIsUnknown(false);
                        bulkGroupPortrait = false;
                    }
                    case "PORTRAIT_GROUP" -> {
                        item.setIsPortrait(true);
                        item.setIsUnknown(false);
                        bulkGroupPortrait = true;
                    }
                    case "UNKNOWN" -> {
                        item.setIsPortrait(false);
                        item.setIsUnknown(true);
                        bulkGroupPortrait = false;
                    }
                    default -> {
                    }
                }
            }

            relocateCollectionMediaItemIfNeeded(item, bulkGroupPortrait);

            String currentDir = extractDirectoryPath(item.getRelativePath());
            String targetFileName = item.getFileName();
            if (cleanStem != null && !cleanStem.isBlank()) {
                String ext = storageService.extractExtension(item.getFileName(), item.getMimeType());
                String candidate = String.format("%s_%02d.%s", cleanStem, index, ext);
                String candidateRel = currentDir + "/" + candidate;
                if (!candidateRel.equals(item.getRelativePath())
                        && (mediaItemRepository.existsByRelativePath(candidateRel)
                        || Files.exists(storageService.resolveMediaFilePath(candidateRel)))) {
                    candidate = findAvailableFileName(currentDir, cleanStem, ext);
                }
                targetFileName = candidate;
            }
            index++;

            if (!targetFileName.equals(item.getFileName())) {
                relocateSingleMediaItemToDirectory(item, currentDir, targetFileName);
            }

            if (req.getTitle() != null && !req.getTitle().isBlank()) {
                item.setTitle(req.getTitle().trim());
            }
            if (req.getSourceText() != null && !req.getSourceText().isBlank()) {
                item.setSourceText(req.getSourceText().trim());
            }
            if (req.getInscriptionText() != null && !req.getInscriptionText().isBlank()) {
                item.setInscriptionText(req.getInscriptionText().trim());
            }
            if (req.getDescription() != null && !req.getDescription().isBlank()) {
                item.setDescription(req.getDescription().trim());
            }
            if (req.getPersonLinks() != null && !req.getPersonLinks().isEmpty()) {
                item.getPersonLinks().clear();
                item.getPersons().clear();
                mediaItemRepository.saveAndFlush(item);
                Set<Long> uniqueDbPersonIds = new HashSet<>();
                for (SaveMediaPersonLinkRequestDto linkReq : req.getPersonLinks()) {
                    MediaPersonLinkType lType = parsePersonLinkType(linkReq.getLinkType());
                    if (linkReq.getPersonId() != null) {
                        Person p = personRepository.findById(linkReq.getPersonId()).orElse(null);
                        if (p != null) {
                            item.getPersonLinks().add(new MediaPersonLink(item, p, lType));
                            if (lType != MediaPersonLinkType.AUTHOR && uniqueDbPersonIds.add(p.getId())) {
                                item.getPersons().add(p);
                            }
                        }
                    } else if (linkReq.getPersonText() != null && !linkReq.getPersonText().isBlank()) {
                        PersonSex pSex = linkReq.getPersonSex() != null ? linkReq.getPersonSex() : PersonSex.UNKNOWN;
                        item.getPersonLinks().add(new MediaPersonLink(item, linkReq.getPersonText().trim(), pSex, lType));
                    }
                }
            }

            if (req.getDateSourceMode() != null && !"NO_CHANGE".equalsIgnoreCase(req.getDateSourceMode())) {
                applyDateModeToMediaItem(
                        item, req.getDateSourceMode(), req.getSelectedMetadataSourceTag(), req.getContextEventId(),
                        req.getIsBetweenRange(),
                        req.getDateQualifier(), req.getYear(), req.getMonth(), req.getDay(),
                        req.getTimeQualifier(), req.getHour(), req.getMinute(), req.getSecond(),
                        req.getRangeEndQualifier(), req.getRangeEndYear(), req.getRangeEndMonth(), req.getRangeEndDay(),
                        req.getRangeEndTimeQualifier(), req.getRangeEndHour(), req.getRangeEndMinute(), req.getRangeEndSecond()
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

        List<Long> requestedColIds = new ArrayList<>();
        if (req.getCollectionIds() != null && !req.getCollectionIds().isEmpty()) {
            requestedColIds.addAll(req.getCollectionIds());
        } else if (req.getCollectionId() != null) {
            requestedColIds.add(req.getCollectionId());
        }
        List<MediaCollection> collectionsToLink = resolveOrderedCollections(requestedColIds);

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
                if (item.getPersons().add(person)) {
                    item.getPersonLinks().add(new MediaPersonLink(item, person, MediaPersonLinkType.DEPICTED));
                }
            }
            if (event != null) {
                item.getEvents().add(event);
                if (extractYearFromEvent(event) == null) {
                    List<MediaCollection> evtCols = findExistingCollectionsForUndatedEvent(event);
                    if (!evtCols.isEmpty()) {
                        appendCollectionsToMediaItem(item, evtCols);
                    }
                }
            }
            if (!collectionsToLink.isEmpty()) {
                appendCollectionsToMediaItem(item, collectionsToLink);
            }
            MediaItem saved = mediaItemRepository.saveAndFlush(item);
            linkedDtos.add(toDto(saved, true, userCodeTranslations));
        }
        graveRepository.flush();
        return linkedDtos;
    }

    @Transactional
    public void unlinkMediaFromContext(Long mediaId, Long graveId, Long personId, Long eventId) {
        unlinkMediaFromContext(mediaId, graveId, personId, eventId, null, List.of());
    }

    @Transactional
    public void unlinkMediaFromContext(
            Long mediaId,
            Long graveId,
            Long personId,
            Long eventId,
            Long targetCollectionId
    ) {
        unlinkMediaFromContext(
                mediaId, graveId, personId, eventId, null,
                targetCollectionId != null ? List.of(targetCollectionId) : List.of()
        );
    }

    @Transactional
    public void unlinkMediaFromContext(
            Long mediaId,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionIdToUnlink,
            List<Long> targetCollectionIds
    ) {
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
            item.getPersonLinks().removeIf(l -> l.getPerson() != null && l.getPerson().getId().equals(personId));
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
        if (collectionIdToUnlink != null) {
            List<MediaCollection> remaining = item.getOrderedCollections().stream()
                    .filter(c -> !c.getId().equals(collectionIdToUnlink))
                    .toList();
            applyOrderedCollectionsToMediaItem(item, remaining);
        }

        if (targetCollectionIds != null && !targetCollectionIds.isEmpty()) {
            List<MediaCollection> targetCols = resolveOrderedCollections(targetCollectionIds);
            appendCollectionsToMediaItem(item, targetCols);
        }

        boolean hasEvents = !item.getEvents().isEmpty();
        boolean hasGraves = !item.getGraves().isEmpty();
        boolean hasPersons = !item.getPersons().isEmpty() || !item.getPersonLinks().isEmpty();
        boolean hasCollection = !item.getOrderedCollections().isEmpty();

        boolean lostEventFolder = (eventId != null && !hasEvents && item.getPrimaryContext() == MediaPrimaryContext.EVENT);
        boolean lostGraveFolder = (graveId != null && !hasGraves && item.getPrimaryContext() == MediaPrimaryContext.GRAVE);
        boolean lostAllReferences = !hasEvents && !hasGraves && !hasPersons && !hasCollection;

        if ((lostAllReferences || ((lostEventFolder || lostGraveFolder) && !hasCollection && !hasEvents && !hasGraves))) {
            throw new IllegalArgumentException(
                    "Plik traci ostatnie powiązanie – wybierz kolekcję docelową, do której ma zostać przeniesiony."
            );
        }

        if (lostEventFolder || lostGraveFolder || collectionIdToUnlink != null
                || (targetCollectionIds != null && !targetCollectionIds.isEmpty())) {
            String newTargetDir = null;
            if (hasEvents) {
                Event remainingEvent = item.getEvents().stream().min(Comparator.comparing(Event::getId)).orElse(null);
                if (remainingEvent != null) {
                    if (extractYearFromEvent(remainingEvent) == null && item.getPrimaryCollection() != null) {
                        newTargetDir = resolveCollectionDirectoryPath(item.getPrimaryCollection())
                                + "/events/" + resolveEffectiveEventFolderSlug(remainingEvent, null);
                    } else {
                        newTargetDir = resolveEventDirectoryPath(remainingEvent, null);
                    }
                    item.setPrimaryContext(MediaPrimaryContext.EVENT);
                }
            } else if (hasGraves) {
                Grave remainingGrave = item.getGraves().stream().min(Comparator.comparing(Grave::getId)).orElse(null);
                if (remainingGrave != null) {
                    newTargetDir = resolveDirectoryForContext(
                            MediaPrimaryContext.GRAVE, remainingGrave.getId(), null, null, null,
                            extractYearFromItem(item), false, false, 0
                    );
                    item.setPrimaryContext(MediaPrimaryContext.GRAVE);
                }
            } else if (item.getPrimaryCollection() != null) {
                String colDir = resolveCollectionDirectoryPath(item.getPrimaryCollection());
                if (Boolean.TRUE.equals(item.getIsPortrait())) {
                    boolean isGrp = (item.getRelativePath() != null && item.getRelativePath().contains("/portraits/group/"))
                            || countDepictedPersonsOnItem(item) > 1;
                    colDir = colDir + "/" + (isGrp ? "portraits/group" : "portraits/single");
                } else if (Boolean.TRUE.equals(item.getIsUnknown())) {
                    colDir = colDir + "/unknown";
                }
                newTargetDir = colDir;
                item.setPrimaryContext(Boolean.TRUE.equals(item.getIsPortrait())
                        ? MediaPrimaryContext.PERSON
                        : MediaPrimaryContext.COLLECTION);
            }

            if (newTargetDir != null) {
                String finalTargetDir = ensureMediaTypeSubfolder(newTargetDir, item.getMediaType());
                relocateSingleMediaItemToDirectory(item, finalTargetDir, item.getFileName());
            }
        }

        mediaItemRepository.saveAndFlush(item);
        graveRepository.flush();
        personRepository.flush();
    }

    @Transactional
    public void bulkUnlinkMedia(BulkUnlinkMediaRequestDto req) {
        if (req == null || req.getMediaIds() == null || req.getMediaIds().isEmpty()) {
            return;
        }
        List<Long> targetColIds = new ArrayList<>();
        if (req.getTargetCollectionIds() != null && !req.getTargetCollectionIds().isEmpty()) {
            targetColIds.addAll(req.getTargetCollectionIds());
        } else if (req.getTargetCollectionId() != null) {
            targetColIds.add(req.getTargetCollectionId());
        }
        for (Long mediaId : req.getMediaIds()) {
            if (mediaId != null && mediaItemRepository.existsById(mediaId)) {
                unlinkMediaFromContext(
                        mediaId,
                        req.getGraveId(),
                        req.getPersonId(),
                        req.getEventId(),
                        req.getCollectionId(),
                        targetColIds
                );
            }
        }
    }

    @Transactional
    public void bulkDeleteMedia(List<Long> mediaIds) {
        if (mediaIds == null || mediaIds.isEmpty()) {
            return;
        }
        for (Long mediaId : mediaIds) {
            try {
                deleteMedia(mediaId);
            } catch (IllegalArgumentException ignored) {
                // Skip missing item
            }
        }
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
            Long firstEvtId = item.getEvents().stream()
                    .map(Event::getId)
                    .min(Long::compareTo)
                    .orElse(null);
            if (!Objects.equals(firstEvtId, evt.getId())) {
                continue;
            }

            String effectiveTargetDir = targetDir;
            if (extractYearFromEvent(evt) == null && item.getPrimaryCollection() != null) {
                effectiveTargetDir = resolveCollectionDirectoryPath(item.getPrimaryCollection())
                        + "/events/" + resolveEffectiveEventFolderSlug(evt, null);
            }

            String finalItemTargetDir = ensureMediaTypeSubfolder(effectiveTargetDir, item.getMediaType());

            String currentFileName = item.getFileName();
            String updatedFileName = updateLeadingDatePrefixInFileName(currentFileName, newDatePrefix);

            String candidateRelPath = finalItemTargetDir + "/" + updatedFileName;
            if (!candidateRelPath.equals(item.getRelativePath())) {
                if (mediaItemRepository.existsByRelativePath(candidateRelPath)
                        || Files.exists(storageService.resolveMediaFilePath(candidateRelPath))) {
                    String ext = storageService.extractExtension(updatedFileName, item.getMimeType());
                    updatedFileName = findAvailableFileName(finalItemTargetDir, updatedFileName, ext);
                    candidateRelPath = finalItemTargetDir + "/" + updatedFileName;
                }
                String movedPath = storageService.moveFileToRelativePath(item.getRelativePath(), candidateRelPath);
                item.setRelativePath(movedPath);
                item.setFileName(updatedFileName);

                for (MediaVersion ver : item.getVersions()) {
                    if (Boolean.TRUE.equals(ver.getIsMain())) {
                        ver.setRelativePath(movedPath);
                        ver.setFileName(updatedFileName);
                    } else {
                        String verUpdatedName = updateLeadingDatePrefixInFileName(ver.getFileName(), newDatePrefix);
                        String verTargetRel = finalItemTargetDir + "/" + verUpdatedName;
                        if (!verTargetRel.equals(ver.getRelativePath())) {
                            String verMoved = storageService.moveFileToRelativePath(ver.getRelativePath(), verTargetRel);
                            ver.setRelativePath(verMoved);
                            ver.setFileName(verUpdatedName);
                        }
                    }
                }
                mediaItemRepository.saveAndFlush(item);
            }
        }

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

    private Event resolvePrimaryEventForMedia(MediaItem item, Long contextEventId) {
        if (contextEventId != null) {
            return eventRepository.findById(contextEventId).orElse(null);
        }
        return item.getEvents().stream()
                .min(Comparator.comparing(Event::getId))
                .orElse(null);
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

    private void populateMediaDateDescriptor(
            DateDescriptor dd,
            Boolean isBetweenRange,
            String dateQual,
            Integer year,
            Integer month,
            Integer day,
            String timeQual,
            Integer hour,
            Integer minute,
            Integer second,
            String rangeEndQual,
            Integer rangeEndYear,
            Integer rangeEndMonth,
            Integer rangeEndDay,
            String rangeEndTimeQual,
            Integer rangeEndHour,
            Integer rangeEndMinute,
            Integer rangeEndSecond
    ) {
        boolean between = Boolean.TRUE.equals(isBetweenRange)
                && (rangeEndYear != null || rangeEndHour != null);

        dd.setDateType(between ? DateType.RANGE : DateType.SINGLE);
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

        if (between) {
            Integer rYear = rangeEndYear != null ? rangeEndYear : year;
            Integer rMonth = rangeEndMonth != null
                    ? rangeEndMonth
                    : (Objects.equals(rYear, year) ? month : null);
            Integer rDay = rangeEndDay != null
                    ? rangeEndDay
                    : (Objects.equals(rMonth, month) ? day : null);

            dd.setEndQualifier(parseQualifier(rangeEndQual));
            dd.setEndYear(rYear);
            dd.setEndMonth(rMonth);
            dd.setEndDay(rDay);
            if (rangeEndHour != null) {
                dd.setEndTimeQualifier(parseQualifier(rangeEndTimeQual));
                dd.setEndHour(rangeEndHour);
                dd.setEndMinute(rangeEndMinute);
                dd.setEndSecond(rangeEndSecond);
            } else {
                dd.setEndTimeQualifier(null);
                dd.setEndHour(null);
                dd.setEndMinute(null);
                dd.setEndSecond(null);
            }

            LocalDateTime firstMin = DateDescriptor.computePointMin(
                    dd.getStartYear(), dd.getStartMonth(), dd.getStartDay(),
                    dd.getStartHour(), dd.getStartMinute(), dd.getStartSecond()
            );
            LocalDateTime secondMin = DateDescriptor.computePointMin(
                    dd.getEndYear(), dd.getEndMonth(), dd.getEndDay(),
                    dd.getEndHour(), dd.getEndMinute(), dd.getEndSecond()
            );
            if (firstMin != null && secondMin != null && secondMin.isBefore(firstMin)) {
                throw new IllegalArgumentException(
                        "W przedziale 'między ... a ...' dla daty zdjęcia/filmu drugi punkt czasu nie może być wcześniejszy niż pierwszy."
                );
            }
        } else {
            dd.setEndQualifier(null);
            dd.setEndYear(null);
            dd.setEndMonth(null);
            dd.setEndDay(null);
            dd.setEndTimeQualifier(null);
            dd.setEndHour(null);
            dd.setEndMinute(null);
            dd.setEndSecond(null);
        }

        dd.recalculateSortDates();
    }

    private void applyDateModeToMediaItem(
            MediaItem item,
            String dateSourceMode,
            String selectedMetadataSourceTag,
            Long contextEventId,
            Boolean isBetweenRange,
            String dateQual,
            Integer year,
            Integer month,
            Integer day,
            String timeQual,
            Integer hour,
            Integer minute,
            Integer second,
            String rangeEndQual,
            Integer rangeEndYear,
            Integer rangeEndMonth,
            Integer rangeEndDay,
            String rangeEndTimeQual,
            Integer rangeEndHour,
            Integer rangeEndMinute,
            Integer rangeEndSecond
    ) {
        String mode = dateSourceMode != null ? dateSourceMode.trim().toUpperCase(Locale.ROOT) : "";

        if ("UNDATED".equals(mode)) {
            item.setDateDescriptor(null);
            return;
        }

        if ("METADATA".equals(mode)) {
            ensureMetadataExtractedFromDisk(item, selectedMetadataSourceTag);
            DateDescriptor metaDd = item.getMetadataDateDescriptor();
            if (metaDd != null && metaDd.getStartYear() != null) {
                DateDescriptor copy = item.getDateDescriptor() != null ? item.getDateDescriptor() : new DateDescriptor();
                copyDateDescriptorFields(metaDd, copy);
                item.setDateDescriptor(copy);
            }
            return;
        }

        if ("EVENT".equals(mode)) {
            Event sourceEvt = resolvePrimaryEventForMedia(item, contextEventId);
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
            populateMediaDateDescriptor(
                    dd, isBetweenRange,
                    dateQual, year, month, day, timeQual, hour, minute, second,
                    rangeEndQual, rangeEndYear, rangeEndMonth, rangeEndDay,
                    rangeEndTimeQual, rangeEndHour, rangeEndMinute, rangeEndSecond
            );
            item.setDateDescriptor(dd);
        }
    }

    private MediaMetadataExtractor.ExtractedMetadata selectMetadataOption(
            List<MediaMetadataExtractor.ExtractedMetadata> options,
            String preferredSourceTag
    ) {
        if (options == null || options.isEmpty()) {
            return null;
        }
        if (preferredSourceTag != null && !preferredSourceTag.isBlank()) {
            for (MediaMetadataExtractor.ExtractedMetadata opt : options) {
                if (opt.sourceTag().equalsIgnoreCase(preferredSourceTag.trim())
                        || opt.sourceTag().toLowerCase(Locale.ROOT).contains(preferredSourceTag.trim().toLowerCase(Locale.ROOT))) {
                    return opt;
                }
            }
        }
        return options.getFirst();
    }

    private Long resolveOriginalTimestampMs(
            Long clientLastModifiedMs,
            MediaMetadataExtractor.ExtractedMetadata chosenMeta
    ) {
        if (clientLastModifiedMs != null && clientLastModifiedMs > 0) {
            return clientLastModifiedMs;
        }
        if (chosenMeta != null && chosenMeta.year() != null) {
            DateDescriptor dd = chosenMeta.toDateDescriptor();
            if (dd != null && dd.getSortDateTimeMin() != null) {
                return dd.getSortDateTimeMin().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            }
        }
        return null;
    }

    private void ensureMetadataExtractedFromDisk(MediaItem item, String preferredSourceTag) {
        byte[] bytes = storageService.readHeaderBytesIfExists(item.getRelativePath(), 262144);
        if (bytes != null) {
            List<MediaMetadataExtractor.ExtractedMetadata> all = metadataExtractor.extractAllDates(bytes, item.getMimeType(), null);
            MediaMetadataExtractor.ExtractedMetadata chosen = selectMetadataOption(all, preferredSourceTag);
            if (chosen != null && chosen.year() != null) {
                item.setMetadataDateDescriptor(chosen.toDateDescriptor());
                item.setMetadataDateSource(chosen.sourceTag());
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

    private MediaPersonLinkType parsePersonLinkType(String raw) {
        if (raw == null || raw.isBlank()) {
            return MediaPersonLinkType.DEPICTED;
        }
        try {
            return MediaPersonLinkType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return MediaPersonLinkType.DEPICTED;
        }
    }

    @Transactional
    public void deleteMedia(Long mediaId) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));

        String fName = item.getFileName();
        String relPath = item.getRelativePath();
        List<String> versionPaths = item.getVersions().stream()
                .map(MediaVersion::getRelativePath)
                .toList();

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
        for (String vp : versionPaths) {
            storageService.deleteFileAndThumbnail(vp, null);
        }

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
    public MediaItemDto getMediaById(Long mediaId, boolean isAdmin) {
        MediaItem item = mediaItemRepository.findById(mediaId)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + mediaId));
        return toDto(item, isAdmin, loadUserCodeTranslations());
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
        if (item.getMediaType() == MediaType.IMAGE) {
            storageService.ensureThumbnailGenerated(mediaId, item.getRelativePath());
        }
        Path thumbPath = storageService.resolveThumbnailPath(mediaId);
        if (Files.exists(thumbPath)) {
            return new FileSystemResource(thumbPath);
        }
        return getMediaFileResource(mediaId);
    }

    @Transactional
    public boolean hasThumbnail(Long mediaId) {
        Path thumbPath = storageService.resolveThumbnailPath(mediaId);
        return Files.exists(thumbPath);
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

    public static String formatSingleDatePrefix(Integer year, Integer month, Integer day) {
        if (year == null) return "";
        StringBuilder sb = new StringBuilder(String.valueOf(year));
        if (month != null) {
            sb.append(String.format("_%02d", month));
            if (day != null) {
                sb.append(String.format("_%02d", day));
            }
        }
        return sb.toString();
    }

    public static String buildDatePrefix(DateDescriptor start, DateDescriptor end) {
        if (start == null && end == null) {
            return "";
        }
        String startStr = "";
        String endStr = "";

        if (start != null) {
            startStr = formatSingleDatePrefix(start.getStartYear(), start.getStartMonth(), start.getStartDay());
            if (start.getDateType() == DateType.RANGE && start.getEndYear() != null) {
                endStr = formatSingleDatePrefix(start.getEndYear(), start.getEndMonth(), start.getEndDay());
            }
        }
        if (end != null) {
            Integer ey = end.getStartYear() != null ? end.getStartYear() : end.getEndYear();
            Integer em = end.getStartMonth() != null ? end.getStartMonth() : end.getEndMonth();
            Integer ed = end.getStartDay() != null ? end.getStartDay() : end.getEndDay();
            if (ey != null) {
                endStr = formatSingleDatePrefix(ey, em, ed);
            }
        }

        if (!startStr.isEmpty() && !endStr.isEmpty()) {
            if (startStr.equals(endStr)) {
                return startStr;
            }
            return startStr + "-" + endStr;
        }
        if (!startStr.isEmpty()) {
            return startStr;
        }
        return endStr;
    }

    private void applyCollectionDateDescriptors(MediaCollection col, SaveMediaCollectionRequestDto req) {
        boolean isDated = Boolean.TRUE.equals(req.getDatedCollection());
        col.setIsDatedCollection(isDated);
        if (!isDated) {
            col.setStartDate(null);
            col.setEndDate(null);
            col.setStartYear(null);
            col.setEndYear(null);
            return;
        }
        if (req.getStartYear() == null) {
            throw new IllegalArgumentException("Kolekcja datowana wymaga podania roku początkowego.");
        }

        DateDescriptor startDd = col.getStartDate() != null ? col.getStartDate() : new DateDescriptor();
        boolean startIsBetween = Boolean.TRUE.equals(req.getIsStartBetweenRange())
                && (req.getStartRangeEndYear() != null || req.getStartRangeEndHour() != null);
        boolean legacyBetween = !Boolean.TRUE.equals(req.getHasEndDate())
                && Boolean.TRUE.equals(req.getIsRange())
                && (req.getEndYear() != null || req.getEndHour() != null);

        startDd.setDateType((startIsBetween || legacyBetween) ? DateType.RANGE : DateType.SINGLE);
        startDd.setStartQualifier(parseQualifier(req.getStartQualifier()));
        startDd.setStartYear(req.getStartYear());
        startDd.setStartMonth(req.getStartMonth());
        startDd.setStartDay(req.getStartDay());
        startDd.setStartTimeQualifier(req.getStartHour() != null ? parseQualifier(req.getStartTimeQualifier()) : null);
        startDd.setStartHour(req.getStartHour());
        startDd.setStartMinute(req.getStartMinute());
        startDd.setStartSecond(req.getStartSecond());

        if (startIsBetween) {
            Integer rEndYear = req.getStartRangeEndYear() != null ? req.getStartRangeEndYear() : req.getStartYear();
            Integer rEndMonth = req.getStartRangeEndMonth() != null ? req.getStartRangeEndMonth()
                    : (Objects.equals(rEndYear, req.getStartYear()) ? req.getStartMonth() : null);
            Integer rEndDay = req.getStartRangeEndDay() != null ? req.getStartRangeEndDay()
                    : (Objects.equals(rEndMonth, req.getStartMonth()) ? req.getStartDay() : null);

            startDd.setEndQualifier(parseQualifier(req.getStartRangeEndQualifier()));
            startDd.setEndYear(rEndYear);
            startDd.setEndMonth(rEndMonth);
            startDd.setEndDay(rEndDay);
            startDd.setEndTimeQualifier(req.getStartRangeEndHour() != null ? parseQualifier(req.getStartRangeEndTimeQualifier()) : null);
            startDd.setEndHour(req.getStartRangeEndHour());
            startDd.setEndMinute(req.getStartRangeEndMinute());
            startDd.setEndSecond(req.getStartRangeEndSecond());
        } else if (legacyBetween) {
            Integer rEndYear = req.getEndYear() != null ? req.getEndYear() : req.getStartYear();
            Integer rEndMonth = req.getEndMonth() != null ? req.getEndMonth()
                    : (Objects.equals(rEndYear, req.getStartYear()) ? req.getStartMonth() : null);
            Integer rEndDay = req.getEndDay() != null ? req.getEndDay()
                    : (Objects.equals(rEndMonth, req.getStartMonth()) ? req.getStartDay() : null);

            startDd.setEndQualifier(parseQualifier(req.getEndQualifier()));
            startDd.setEndYear(rEndYear);
            startDd.setEndMonth(rEndMonth);
            startDd.setEndDay(rEndDay);
            startDd.setEndTimeQualifier(req.getEndHour() != null ? parseQualifier(req.getEndTimeQualifier()) : null);
            startDd.setEndHour(req.getEndHour());
            startDd.setEndMinute(req.getEndMinute());
            startDd.setEndSecond(req.getEndSecond());
        } else {
            startDd.setEndQualifier(null);
            startDd.setEndYear(null);
            startDd.setEndMonth(null);
            startDd.setEndDay(null);
            startDd.setEndTimeQualifier(null);
            startDd.setEndHour(null);
            startDd.setEndMinute(null);
            startDd.setEndSecond(null);
        }
        startDd.recalculateSortDates();
        col.setStartDate(startDd);
        col.setStartYear(startDd.getStartYear());

        boolean wantsEndDate = Boolean.TRUE.equals(req.getHasEndDate())
                && (req.getEndYear() != null || req.getEndHour() != null);
        if (wantsEndDate) {
            DateDescriptor endDd = col.getEndDate() != null ? col.getEndDate() : new DateDescriptor();
            Integer resolvedEndYear = req.getEndYear() != null ? req.getEndYear() : req.getStartYear();
            Integer resolvedEndMonth = req.getEndMonth() != null ? req.getEndMonth()
                    : (req.getEndYear() == null ? req.getStartMonth() : null);
            Integer resolvedEndDay = req.getEndDay() != null ? req.getEndDay()
                    : (req.getEndYear() == null && req.getEndMonth() == null ? req.getStartDay() : null);

            boolean endIsBetween = Boolean.TRUE.equals(req.getIsEndBetweenRange())
                    && (req.getEndRangeEndYear() != null || req.getEndRangeEndHour() != null);
            endDd.setDateType(endIsBetween ? DateType.RANGE : DateType.SINGLE);
            endDd.setStartQualifier(parseQualifier(req.getEndQualifier()));
            endDd.setStartYear(resolvedEndYear);
            endDd.setStartMonth(resolvedEndMonth);
            endDd.setStartDay(resolvedEndDay);
            endDd.setStartTimeQualifier(req.getEndHour() != null ? parseQualifier(req.getEndTimeQualifier()) : null);
            endDd.setStartHour(req.getEndHour());
            endDd.setStartMinute(req.getEndMinute());
            endDd.setStartSecond(req.getEndSecond());

            if (endIsBetween) {
                Integer rEndYear = req.getEndRangeEndYear() != null ? req.getEndRangeEndYear() : resolvedEndYear;
                Integer rEndMonth = req.getEndRangeEndMonth() != null ? req.getEndRangeEndMonth()
                        : (Objects.equals(rEndYear, resolvedEndYear) ? resolvedEndMonth : null);
                Integer rEndDay = req.getEndRangeEndDay() != null ? req.getEndRangeEndDay()
                        : (Objects.equals(rEndMonth, resolvedEndMonth) ? resolvedEndDay : null);

                endDd.setEndQualifier(parseQualifier(req.getEndRangeEndQualifier()));
                endDd.setEndYear(rEndYear);
                endDd.setEndMonth(rEndMonth);
                endDd.setEndDay(rEndDay);
                endDd.setEndTimeQualifier(req.getEndRangeEndHour() != null ? parseQualifier(req.getEndRangeEndTimeQualifier()) : null);
                endDd.setEndHour(req.getEndRangeEndHour());
                endDd.setEndMinute(req.getEndRangeEndMinute());
                endDd.setEndSecond(req.getEndRangeEndSecond());
            } else {
                endDd.setEndQualifier(null);
                endDd.setEndYear(null);
                endDd.setEndMonth(null);
                endDd.setEndDay(null);
                endDd.setEndTimeQualifier(null);
                endDd.setEndHour(null);
                endDd.setEndMinute(null);
                endDd.setEndSecond(null);
            }
            endDd.recalculateSortDates();
            col.setEndDate(endDd);
            col.setEndYear(endDd.getEndYear() != null ? endDd.getEndYear() : endDd.getStartYear());

            if (startDd.getSortDateTimeMin() != null && endDd.getSortDateTimeMin() != null
                    && endDd.getSortDateTimeMin().isBefore(startDd.getSortDateTimeMin())) {
                throw new IllegalArgumentException(
                        "Początek daty lub godziny końcowej albumu nie może być wcześniejszy niż początek daty początkowej."
                );
            }
        } else {
            col.setEndDate(null);
            col.setEndYear(startDd.getEndYear());
        }
    }

    private String extractDirectoryPath(String relativePath) {
        if (relativePath == null || !relativePath.contains("/")) {
            return "collections/misc";
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
        List<String> partNames = evt.getParticipants().stream()
                .sorted(Comparator.comparing(ep -> ep.getPerson() != null ? ep.getPerson().getId() : Long.MAX_VALUE))
                .map(ep -> {
                    if (ep.getPerson() != null) {
                        String g = ep.getPerson().getCachedGivenName() != null ? ep.getPerson().getCachedGivenName() : "";
                        String s = ep.getPerson().getCachedSurname() != null ? ep.getPerson().getCachedSurname() : "";
                        return (g + " " + s).trim();
                    }
                    return ep.getParticipantText() != null ? ep.getParticipantText().trim() : "";
                })
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(3)
                .toList();
        if (!partNames.isEmpty()) {
            return typeLabel + " — " + String.join(" & ", partNames);
        }
        return typeLabel;
    }

    private Event resolveRootParentEvent(Event evt) {
        Event cursor = evt;
        Set<Long> visited = new HashSet<>();
        while (cursor != null && cursor.getId() != null && visited.add(cursor.getId())) {
            Event parent = cursor.getPrimaryParentEvent();
            if (parent == null) {
                break;
            }
            cursor = parent;
        }
        return cursor != null ? cursor : evt;
    }

    private boolean matchesPersonFilter(MediaItem item, Set<Long> filterPersonIds, boolean matchAll) {
        if (filterPersonIds.isEmpty()) {
            return true;
        }
        Set<Long> itemPersonIds = new HashSet<>();
        for (Person p : item.getPersons()) {
            itemPersonIds.add(p.getId());
        }
        for (MediaPersonLink link : item.getPersonLinks()) {
            if (link.getPerson() != null && link.getLinkType() != MediaPersonLinkType.AUTHOR) {
                itemPersonIds.add(link.getPerson().getId());
            }
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
                + (dto.getInscriptionText() != null ? dto.getInscriptionText() : "") + " "
                + (dto.getDescription() != null ? dto.getDescription() : "") + " "
                + (dto.getSourceText() != null ? dto.getSourceText() : "") + " "
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
            case "OLDEST_UPLOAD" -> Comparator
                    .comparing(MediaItemDto::getCreatedAt, Comparator.nullsLast(LocalDateTime::compareTo))
                    .thenComparingLong(MediaItemDto::getId);
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

    public String resolveCollectionDirectoryPath(MediaCollection col) {
        List<MediaCollection> chain = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        MediaCollection cursor = col;
        while (cursor != null && cursor.getId() != null && visited.add(cursor.getId()) && chain.size() < 6) {
            chain.addFirst(cursor);
            cursor = cursor.getParentCollection();
        }
        if (chain.isEmpty()) {
            chain.add(col);
        }

        MediaCollection rootCol = chain.getFirst();
        StringBuilder sb = new StringBuilder();
        if (Boolean.TRUE.equals(rootCol.getIsDatedCollection()) && rootCol.getStartYear() != null) {
            int dec = (rootCol.getStartYear() / 10) * 10;
            sb.append(String.format("dated/%ds/%d/%s", dec, rootCol.getStartYear(), rootCol.getSlug()));
        } else {
            sb.append("collections/").append(rootCol.getSlug());
        }

        for (int i = 1; i < chain.size(); i++) {
            sb.append("/").append(chain.get(i).getSlug());
        }
        return sb.toString();
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
            pathBuilder.append("collections/events/").append(rootSlug);
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
        String basePart;
        if (evt.getFolderSlug() != null && !evt.getFolderSlug().isBlank()) {
            basePart = storageService.toSnakeCase(evt.getFolderSlug());
            basePart = basePart.replaceFirst("^\\d{4}(_\\d{2})*(_\\d{2})*(-_)?(\\d{4}(_\\d{2})*(_\\d{2})*_)?", "");
            basePart = basePart.replaceFirst("^_", "");
            if (basePart.isBlank()) {
                basePart = storageService.toSnakeCase(evt.getTitle() != null ? evt.getTitle() : evt.getEventType().getCode());
            }
        } else {
            basePart = buildEventFolderSlug(evt, yearOverride);
            basePart = basePart.replaceFirst("^\\d{4}(_\\d{2})*(_\\d{2})*(-_)?(\\d{4}(_\\d{2})*(_\\d{2})*_)?", "");
            basePart = basePart.replaceFirst("^_", "");
        }

        String datePrefix = buildDatePrefix(evt.getStartDate(), evt.getEndDate());
        if (datePrefix.isEmpty() && yearOverride != null) {
            datePrefix = String.valueOf(yearOverride);
        }

        return datePrefix.isEmpty() ? basePart : datePrefix + "_" + basePart;
    }

    private String resolveDirectoryForContext(
            MediaPrimaryContext context,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Integer personsCount
    ) {
        return resolveDirectoryForContext(
                context, graveId, personId, eventId, collectionId,
                customYear, portraitMedia, unknownMedia, personsCount, MediaType.IMAGE
        );
    }

    private String resolveDirectoryForContext(
            MediaPrimaryContext context,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Integer personsCount,
            MediaType mediaType
    ) {
        String baseDir = resolveBaseDirectoryForContext(
                context, graveId, personId, eventId, collectionId,
                customYear, portraitMedia, unknownMedia, personsCount
        );
        return ensureMediaTypeSubfolder(baseDir, mediaType);
    }

    private String resolveBaseDirectoryForContext(
            MediaPrimaryContext context,
            Long graveId,
            Long personId,
            Long eventId,
            Long collectionId,
            Integer customYear,
            Boolean portraitMedia,
            Boolean unknownMedia,
            Integer personsCount
    ) {
        if (context == MediaPrimaryContext.GRAVE) {
            Grave g = graveId != null ? graveRepository.findById(graveId).orElse(null) : null;
            return resolveGraveBaseDirectoryPath(g);
        }

        MediaCollection col = collectionId != null
                ? mediaCollectionRepository.findById(collectionId).orElse(null)
                : null;
        boolean isPortrait = Boolean.TRUE.equals(portraitMedia) || context == MediaPrimaryContext.PERSON;
        boolean isUnknown = Boolean.TRUE.equals(unknownMedia);
        String portraitSubfolder = (personsCount != null && personsCount > 1)
                ? "portraits/group"
                : "portraits/single";

        if (context == MediaPrimaryContext.EVENT && eventId != null) {
            Event evt = eventRepository.findById(eventId).orElse(null);
            if (evt != null) {
                Integer evtYear = extractYearFromEvent(evt);
                if (evtYear == null) {
                    if (col == null) {
                        throw new IllegalArgumentException(
                                "Wybierz istniejącą kolekcję dla wydarzenia bez ustalonej daty."
                        );
                    }
                    return resolveCollectionDirectoryPath(col) + "/events/"
                            + resolveEffectiveEventFolderSlug(evt, null);
                }
                return resolveEventDirectoryPath(evt, null);
            }
        }

        if (col != null) {
            String colDir = resolveCollectionDirectoryPath(col);
            if (isPortrait) {
                return colDir + "/" + portraitSubfolder;
            }
            if (isUnknown) {
                return colDir + "/unknown";
            }
            return colDir;
        }

        if (isPortrait) {
            if (customYear != null && customYear >= 1000 && customYear <= 2999) {
                int decade = (customYear / 10) * 10;
                return String.format("dated/%ds/%d/misc_%d/%s", decade, customYear, customYear, portraitSubfolder);
            }
            throw new IllegalArgumentException(
                    "Wybierz istniejącą kolekcję dla portretu bez ustalonej daty."
            );
        }

        if (customYear != null && customYear >= 1000 && customYear <= 2999) {
            int decade = (customYear / 10) * 10;
            return String.format("dated/%ds/%d/misc_%d", decade, customYear, customYear);
        }

        if (context == MediaPrimaryContext.HEIRLOOM) {
            return "collections/heirlooms";
        }
        if (context == MediaPrimaryContext.LOCATION) {
            return "collections/places";
        }

        throw new IllegalArgumentException(
                "Wybierz istniejącą kolekcję dla plików bez ustalonej daty."
        );
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

        if (context == MediaPrimaryContext.EVENT && eventId != null) {
            Event evt = eventRepository.findById(eventId).orElse(null);
            if (evt != null) {
                Integer evtYear = extractYearFromEvent(evt);
                return resolveEffectiveEventFolderSlug(evt, evtYear);
            }
        }

        if (personId != null && context == MediaPrimaryContext.PERSON) {
            Person p = personRepository.findById(personId).orElse(null);
            if (p != null) {
                return buildPersonSlug(p) + "_portrait";
            }
        }

        if (collectionId != null) {
            MediaCollection col = mediaCollectionRepository.findById(collectionId).orElse(null);
            if (col != null) {
                return col.getSlug();
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
        if (item.getPrimaryCollection() != null
                && Boolean.TRUE.equals(item.getPrimaryCollection().getIsDatedCollection())
                && item.getPrimaryCollection().getStartYear() != null) {
            return item.getPrimaryCollection().getStartYear();
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

        boolean hasCustomTitle = (evt.getTitle() != null && !evt.getTitle().isBlank());
        String namePart = hasCustomTitle
                ? storageService.toSnakeCase(evt.getTitle())
                : storageService.toSnakeCase(evt.getEventType().getCode());

        List<String> participantFullNames = hasCustomTitle || evt.getParticipants().size() > 3
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
            if (!mediaItemRepository.existsByRelativePath(relPath)
                    && !mediaVersionRepository.existsByRelativePath(relPath)
                    && !Files.exists(diskPath)) {
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
        MediaCollection parent = col.getParentCollection();
        List<MediaItem> colItems = mediaItemRepository.findAll().stream()
                .filter(m -> m.getOrderedCollections().stream().anyMatch(c -> c.getId().equals(col.getId())))
                .toList();
        Long previewMediaId = colItems.stream().map(MediaItem::getId).findFirst().orElse(null);

        DateDescriptor startDd = col.getStartDate();
        DateDescriptor endDd = col.getEndDate();
        String dateText = EventTimelineService.formatEventDates(startDd, endDd);

        return MediaCollectionDto.builder()
                .id(col.getId())
                .name(col.getName())
                .slug(col.getSlug())
                .description(col.getDescription())
                .parentCollectionId(parent != null ? parent.getId() : null)
                .parentCollectionName(parent != null ? parent.getName() : null)
                .datedCollection(Boolean.TRUE.equals(col.getIsDatedCollection()))
                .dateText(dateText)
                .startDateType(startDd != null && startDd.getDateType() != null ? startDd.getDateType().name() : null)
                .startQualifier(startDd != null && startDd.getStartQualifier() != null ? startDd.getStartQualifier().name() : null)
                .startYear(startDd != null ? startDd.getStartYear() : col.getStartYear())
                .startMonth(startDd != null ? startDd.getStartMonth() : null)
                .startDay(startDd != null ? startDd.getStartDay() : null)
                .startTimeQualifier(startDd != null && startDd.getStartTimeQualifier() != null ? startDd.getStartTimeQualifier().name() : null)
                .startHour(startDd != null ? startDd.getStartHour() : null)
                .startMinute(startDd != null ? startDd.getStartMinute() : null)
                .startSecond(startDd != null ? startDd.getStartSecond() : null)
                .startRangeEndQualifier(startDd != null && startDd.getEndQualifier() != null ? startDd.getEndQualifier().name() : null)
                .startRangeEndYear(startDd != null ? startDd.getEndYear() : null)
                .startRangeEndMonth(startDd != null ? startDd.getEndMonth() : null)
                .startRangeEndDay(startDd != null ? startDd.getEndDay() : null)
                .startRangeEndTimeQualifier(startDd != null && startDd.getEndTimeQualifier() != null ? startDd.getEndTimeQualifier().name() : null)
                .startRangeEndHour(startDd != null ? startDd.getEndHour() : null)
                .startRangeEndMinute(startDd != null ? startDd.getEndMinute() : null)
                .startRangeEndSecond(startDd != null ? startDd.getEndSecond() : null)
                .isRange((startDd != null && startDd.getDateType() == DateType.RANGE) || endDd != null)
                .hasEndDate(endDd != null)
                .endDateType(endDd != null && endDd.getDateType() != null ? endDd.getDateType().name() : null)
                .endQualifier(endDd != null && endDd.getStartQualifier() != null
                        ? endDd.getStartQualifier().name()
                        : (startDd != null && startDd.getEndQualifier() != null ? startDd.getEndQualifier().name() : null))
                .endYear(endDd != null
                        ? endDd.getStartYear()
                        : (startDd != null && startDd.getEndYear() != null ? startDd.getEndYear() : col.getEndYear()))
                .endMonth(endDd != null ? endDd.getStartMonth() : (startDd != null ? startDd.getEndMonth() : null))
                .endDay(endDd != null ? endDd.getStartDay() : (startDd != null ? startDd.getEndDay() : null))
                .endTimeQualifier(endDd != null && endDd.getStartTimeQualifier() != null
                        ? endDd.getStartTimeQualifier().name()
                        : (startDd != null && startDd.getEndTimeQualifier() != null ? startDd.getEndTimeQualifier().name() : null))
                .endHour(endDd != null ? endDd.getStartHour() : (startDd != null ? startDd.getEndHour() : null))
                .endMinute(endDd != null ? endDd.getStartMinute() : (startDd != null ? startDd.getEndMinute() : null))
                .endSecond(endDd != null ? endDd.getStartSecond() : (startDd != null ? startDd.getEndSecond() : null))
                .endRangeEndQualifier(endDd != null && endDd.getEndQualifier() != null ? endDd.getEndQualifier().name() : null)
                .endRangeEndYear(endDd != null ? endDd.getEndYear() : null)
                .endRangeEndMonth(endDd != null ? endDd.getEndMonth() : null)
                .endRangeEndDay(endDd != null ? endDd.getEndDay() : null)
                .endRangeEndTimeQualifier(endDd != null && endDd.getEndTimeQualifier() != null ? endDd.getEndTimeQualifier().name() : null)
                .endRangeEndHour(endDd != null ? endDd.getEndHour() : null)
                .endRangeEndMinute(endDd != null ? endDd.getEndMinute() : null)
                .endRangeEndSecond(endDd != null ? endDd.getEndSecond() : null)
                .founderPersonId(f != null ? f.getId() : null)
                .founderPersonName(founderName)
                .previewMediaId(previewMediaId)
                .mediaCount(colItems.size())
                .createdAt(col.getCreatedAt())
                .build();
    }

    private MediaPersonLinkDto toPersonLinkDto(MediaPersonLink link) {
        Person p = link.getPerson();
        String displayName = p != null
                ? ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim()
                : link.getPersonText();
        PersonSex sex = p != null ? p.getSex() : link.getPersonSex();

        return MediaPersonLinkDto.builder()
                .linkId(link.getId())
                .personId(p != null ? p.getId() : null)
                .personText(link.getPersonText())
                .displayName(displayName)
                .sex(sex)
                .linkType(link.getLinkType().name())
                .build();
    }

    private MediaVersionDto toVersionDto(MediaVersion v, boolean isAdmin) {
        return MediaVersionDto.builder()
                .id(v.getId())
                .mediaId(v.getMediaItem().getId())
                .versionType(v.getVersionType().name())
                .versionLabel(v.getVersionLabel())
                .relativePath(isAdmin ? v.getRelativePath() : null)
                .fileName(v.getFileName())
                .mimeType(v.getMimeType())
                .fileSize(v.getFileSize())
                .main(Boolean.TRUE.equals(v.getIsMain()))
                .reverseSide(v.getVersionType() == MediaVersionType.REVERSE)
                .createdAt(v.getCreatedAt())
                .build();
    }

    private String buildGraveDisplayLabel(Grave g) {
        List<Burial> burials = burialRepository.findByGrave(g);
        String peopleStr = burials.stream()
                .map(Burial::getPerson)
                .filter(Objects::nonNull)
                .map(p -> ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                        + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.joining(", "));
        String cemName = g.getCemetery() != null ? g.getCemetery().getName() : "Inne";
        if (!peopleStr.isEmpty()) {
            return "Grób: " + peopleStr + " (" + cemName + ")";
        }
        return "Grób na cmentarzu: " + cemName;
    }

    private MediaItemDto toDto(MediaItem item, boolean isAdmin, Map<Long, String> userCodeTranslations) {
        List<Person> sortedPersons = item.getPersons().stream()
                .sorted(Comparator.comparing(Person::getId))
                .toList();

        List<MediaPersonLinkDto> depicted = new ArrayList<>();
        List<MediaPersonLinkDto> related = new ArrayList<>();
        List<MediaPersonLinkDto> authors = new ArrayList<>();

        for (MediaPersonLink link : item.getPersonLinks()) {
            MediaPersonLinkDto lDto = toPersonLinkDto(link);
            if (link.getLinkType() == MediaPersonLinkType.AUTHOR) {
                authors.add(lDto);
            } else if (link.getLinkType() == MediaPersonLinkType.RELATED) {
                related.add(lDto);
            } else {
                depicted.add(lDto);
            }
        }

        if (depicted.isEmpty() && !sortedPersons.isEmpty()) {
            for (Person p : sortedPersons) {
                String fullName = ((p.getCachedGivenName() != null ? p.getCachedGivenName() : "") + " "
                        + (p.getCachedSurname() != null ? p.getCachedSurname() : "")).trim();
                depicted.add(MediaPersonLinkDto.builder()
                        .personId(p.getId())
                        .displayName(fullName)
                        .sex(p.getSex())
                        .linkType(MediaPersonLinkType.DEPICTED.name())
                        .build());
            }
        }

        List<String> personNames = new ArrayList<>();
        for (MediaPersonLinkDto d : depicted) {
            if (d.getDisplayName() != null && !d.getDisplayName().isBlank()) {
                personNames.add(d.getDisplayName());
            }
        }
        for (MediaPersonLinkDto r : related) {
            if (r.getDisplayName() != null && !r.getDisplayName().isBlank() && !personNames.contains(r.getDisplayName())) {
                personNames.add(r.getDisplayName());
            }
        }

        List<Grave> sortedGraves = item.getGraves().stream()
                .sorted(Comparator.comparing(Grave::getId))
                .toList();

        List<String> cemeteryNames = sortedGraves.stream()
                .map(g -> g.getCemetery() != null ? g.getCemetery().getName() : "Inne")
                .distinct()
                .toList();

        List<Long> graveCemeteryIds = sortedGraves.stream()
                .map(g -> g.getCemetery() != null ? g.getCemetery().getId() : -1L)
                .toList();

        List<String> graveLabels = sortedGraves.stream()
                .map(this::buildGraveDisplayLabel)
                .toList();

        List<Event> sortedEvents = item.getEvents().stream()
                .sorted(Comparator.comparing(Event::getId))
                .toList();
        List<String> eventLabels = sortedEvents.stream()
                .map(e -> resolveEventDisplayLabel(e, userCodeTranslations))
                .toList();
        List<Integer> eventStartYears = sortedEvents.stream()
                .map(e -> extractYearFromEvent(e) != null ? extractYearFromEvent(e) : -1)
                .toList();

        List<Event> rootEvents = sortedEvents.stream()
                .map(this::resolveRootParentEvent)
                .toList();
        List<Long> rootEventIds = rootEvents.stream().map(Event::getId).toList();
        List<String> rootEventLabels = rootEvents.stream()
                .map(e -> resolveEventDisplayLabel(e, userCodeTranslations))
                .toList();
        List<String> rootEventTypeLabels = rootEvents.stream()
                .map(e -> EventTimelineService.resolveEventTypeLabel(e.getEventType(), userCodeTranslations))
                .toList();
        List<Integer> rootEventStartYears = rootEvents.stream()
                .map(e -> extractYearFromEvent(e) != null ? extractYearFromEvent(e) : -1)
                .toList();

        Long subEventId = null;
        String subEventLabel = null;
        if (!sortedEvents.isEmpty()) {
            Event firstEvt = sortedEvents.getFirst();
            Event rootEvt = rootEvents.getFirst();
            if (!Objects.equals(firstEvt.getId(), rootEvt.getId())) {
                subEventId = firstEvt.getId();
                String baseSubLbl = resolveEventDisplayLabel(firstEvt, userCodeTranslations);
                String subDate = EventTimelineService.formatEventDates(firstEvt.getStartDate(), firstEvt.getEndDate());
                subEventLabel = (subDate != null && !subDate.isBlank())
                        ? baseSubLbl + " (" + subDate + ")"
                        : baseSubLbl;
            }
        }

        DateDescriptor dd = item.getDateDescriptor();
        DateDescriptor metaDd = item.getMetadataDateDescriptor();
        Integer resolvedYear = resolveMediaItemYear(item);

        List<MetadataDateOptionDto> availableMetaOptions = new ArrayList<>();
        if (isAdmin) {
            // Read at most 256 KB of file header - never load multi-gigabyte files into RAM
            byte[] diskBytes = storageService.readHeaderBytesIfExists(item.getRelativePath(), 262144);
            if (diskBytes != null) {
                for (MediaMetadataExtractor.ExtractedMetadata em : metadataExtractor.extractAllDates(diskBytes, item.getMimeType(), null)) {
                    availableMetaOptions.add(em.toOptionDto());
                }
            }
            if (metaDd != null && metaDd.getStartYear() != null) {
                String storedTag = item.getMetadataDateSource() != null ? item.getMetadataDateSource() : "Metadane pliku";
                boolean alreadyListed = availableMetaOptions.stream()
                        .anyMatch(o -> o.getSourceTag().equalsIgnoreCase(storedTag));
                if (!alreadyListed) {
                    availableMetaOptions.add(MetadataDateOptionDto.builder()
                            .sourceTag(storedTag)
                            .dateText(EventTimelineService.formatEventDates(metaDd, null))
                            .year(metaDd.getStartYear())
                            .month(metaDd.getStartMonth())
                            .day(metaDd.getStartDay())
                            .hour(metaDd.getStartHour())
                            .minute(metaDd.getStartMinute())
                            .second(metaDd.getStartSecond())
                            .build());
                }
            }
        }

        List<MediaVersionDto> versionDtos = item.getVersions().stream()
                .map(v -> toVersionDto(v, isAdmin))
                .toList();

        List<MediaCollection> orderedCols = item.getOrderedCollections();
        MediaCollection primaryCol = orderedCols.isEmpty() ? null : orderedCols.getFirst();
        List<Long> collectionIds = orderedCols.stream().map(MediaCollection::getId).toList();
        List<String> collectionNames = orderedCols.stream().map(MediaCollection::getName).toList();

        boolean isPortraitFlag = Boolean.TRUE.equals(item.getIsPortrait())
                || item.getPrimaryContext() == MediaPrimaryContext.PERSON;
        boolean isGroupPortraitFlag = isPortraitFlag
                && ((item.getRelativePath() != null && item.getRelativePath().contains("/portraits/group/"))
                || depicted.size() > 1);

        return MediaItemDto.builder()
                .id(item.getId())
                .mediaType(item.getMediaType())
                .primaryContext(item.getPrimaryContext())
                .portrait(isPortraitFlag)
                .groupPortrait(isGroupPortraitFlag)
                .unknownMedia(Boolean.TRUE.equals(item.getIsUnknown()))
                .relativePath(isAdmin ? item.getRelativePath() : null)
                .directoryPath(isAdmin ? extractDirectoryPath(item.getRelativePath()) : null)
                .fileName(item.getFileName())
                .mimeType(item.getMimeType())
                .fileSize(item.getFileSize())
                .title(item.getTitle())
                .inscriptionText(item.getInscriptionText())
                .description(item.getDescription())
                .sourceText(item.getSourceText())
                .dateType(dd != null && dd.getDateType() != null ? dd.getDateType().name() : null)
                .betweenRange(dd != null && dd.getDateType() == DateType.RANGE)
                .dateQualifier(dd != null && dd.getStartQualifier() != null ? dd.getStartQualifier().name() : null)
                .year(resolvedYear)
                .month(dd != null ? dd.getStartMonth() : null)
                .day(dd != null ? dd.getStartDay() : null)
                .timeQualifier(dd != null && dd.getStartTimeQualifier() != null ? dd.getStartTimeQualifier().name() : null)
                .hour(dd != null ? dd.getStartHour() : null)
                .minute(dd != null ? dd.getStartMinute() : null)
                .second(dd != null ? dd.getStartSecond() : null)
                .rangeEndQualifier(dd != null && dd.getEndQualifier() != null ? dd.getEndQualifier().name() : null)
                .rangeEndYear(dd != null ? dd.getEndYear() : null)
                .rangeEndMonth(dd != null ? dd.getEndMonth() : null)
                .rangeEndDay(dd != null ? dd.getEndDay() : null)
                .rangeEndTimeQualifier(dd != null && dd.getEndTimeQualifier() != null ? dd.getEndTimeQualifier().name() : null)
                .rangeEndHour(dd != null ? dd.getEndHour() : null)
                .rangeEndMinute(dd != null ? dd.getEndMinute() : null)
                .rangeEndSecond(dd != null ? dd.getEndSecond() : null)
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
                .availableMetadataDates(availableMetaOptions)
                .collectionId(primaryCol != null ? primaryCol.getId() : null)
                .collectionName(primaryCol != null ? primaryCol.getName() : null)
                .collectionIds(collectionIds)
                .collectionNames(collectionNames)
                .datedCollectionItem(primaryCol != null && Boolean.TRUE.equals(primaryCol.getIsDatedCollection()))
                .collectionStartYear(primaryCol != null ? primaryCol.getStartYear() : null)
                .createdAt(item.getCreatedAt())
                .personIds(sortedPersons.stream().map(Person::getId).toList())
                .personNames(personNames)
                .depictedPersons(depicted)
                .relatedPersons(related)
                .authors(authors)
                .versions(versionDtos)
                .graveIds(sortedGraves.stream().map(Grave::getId).toList())
                .cemeteryNames(cemeteryNames)
                .graveCemeteryIds(graveCemeteryIds)
                .graveLabels(graveLabels)
                .eventIds(sortedEvents.stream().map(Event::getId).toList())
                .eventLabels(eventLabels)
                .eventStartYears(eventStartYears)
                .rootEventIds(rootEventIds)
                .rootEventLabels(rootEventLabels)
                .rootEventTypeLabels(rootEventTypeLabels)
                .rootEventStartYears(rootEventStartYears)
                .subEventId(subEventId)
                .subEventLabel(subEventLabel)
                .build();
    }

    private List<MediaCollection> resolveOrderedCollections(List<Long> collectionIds) {
        if (collectionIds == null || collectionIds.isEmpty()) {
            return List.of();
        }
        List<MediaCollection> ordered = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (Long cid : collectionIds) {
            if (cid != null && seen.add(cid)) {
                MediaCollection col = mediaCollectionRepository.findById(cid)
                        .orElseThrow(() -> new IllegalArgumentException("Collection not found: " + cid));
                ordered.add(col);
            }
        }
        return ordered;
    }

    private void applyOrderedCollectionsToMediaItem(MediaItem item, List<MediaCollection> orderedCollections) {
        List<MediaCollection> safeList = orderedCollections != null ? orderedCollections : List.of();
        item.setCollection(safeList.isEmpty() ? null : safeList.getFirst());
        if (item.getId() == null) {
            item = mediaItemRepository.saveAndFlush(item);
        }
        item.getCollectionLinks().clear();
        mediaItemRepository.saveAndFlush(item);
        for (int i = 0; i < safeList.size(); i++) {
            item.getCollectionLinks().add(new MediaCollectionLink(item, safeList.get(i), i));
        }
    }

    private void appendCollectionsToMediaItem(MediaItem item, List<MediaCollection> additionalCollections) {
        if (additionalCollections == null || additionalCollections.isEmpty()) {
            return;
        }
        List<MediaCollection> merged = new ArrayList<>(item.getOrderedCollections());
        for (MediaCollection col : additionalCollections) {
            if (merged.stream().noneMatch(existing -> existing.getId().equals(col.getId()))) {
                merged.add(col);
            }
        }
        applyOrderedCollectionsToMediaItem(item, merged);
    }

    private List<MediaCollection> findExistingCollectionsForUndatedEvent(Event evt) {
        if (evt == null || evt.getId() == null) {
            return List.of();
        }
        List<MediaCollection> fromEvent = evt.getOrderedCollections();
        if (!fromEvent.isEmpty()) {
            return fromEvent;
        }
        List<MediaItem> existingItems = mediaItemRepository.findByEventsIdOrderByIdAsc(evt.getId());
        for (MediaItem m : existingItems) {
            List<MediaCollection> itemCols = m.getOrderedCollections();
            if (!itemCols.isEmpty()) {
                return itemCols;
            }
        }
        return List.of();
    }

    private void syncUndatedEventCollections(Event evt, List<MediaCollection> targetCols) {
        if (evt == null || evt.getId() == null || targetCols == null || targetCols.isEmpty()) {
            return;
        }
        evt.getCollectionLinks().clear();
        eventRepository.saveAndFlush(evt);
        for (int i = 0; i < targetCols.size(); i++) {
            evt.getCollectionLinks().add(new EventCollectionLink(evt, targetCols.get(i), i));
        }
        eventRepository.saveAndFlush(evt);

        MediaCollection primaryCol = targetCols.getFirst();
        String targetDir = resolveCollectionDirectoryPath(primaryCol) + "/events/"
                + resolveEffectiveEventFolderSlug(evt, null);
        List<MediaItem> eventMedia = mediaItemRepository.findByEventsIdOrderByIdAsc(evt.getId());
        for (MediaItem m : eventMedia) {
            applyOrderedCollectionsToMediaItem(m, targetCols);
            String finalDir = ensureMediaTypeSubfolder(targetDir, m.getMediaType());
            relocateSingleMediaItemToDirectory(m, finalDir, m.getFileName());
            mediaItemRepository.saveAndFlush(m);
        }
    }

    private void relocateCollectionMediaItemIfNeeded(MediaItem item, Boolean requestedGroupPortrait) {
        MediaCollection primaryCol = item.getPrimaryCollection();
        if (primaryCol == null || !item.getEvents().isEmpty() || !item.getGraves().isEmpty()) {
            return;
        }
        String colDir = resolveCollectionDirectoryPath(primaryCol);
        boolean isGroup = requestedGroupPortrait != null
                ? requestedGroupPortrait
                : (item.getRelativePath() != null && item.getRelativePath().contains("/portraits/group/"))
                || countDepictedPersonsOnItem(item) > 1;

        String expectedDir = colDir;
        if (Boolean.TRUE.equals(item.getIsPortrait())) {
            expectedDir = colDir + "/" + (isGroup ? "portraits/group" : "portraits/single");
            item.setPrimaryContext(MediaPrimaryContext.PERSON);
        } else if (Boolean.TRUE.equals(item.getIsUnknown())) {
            expectedDir = colDir + "/unknown";
            item.setPrimaryContext(MediaPrimaryContext.COLLECTION);
        } else {
            item.setPrimaryContext(MediaPrimaryContext.COLLECTION);
        }

        expectedDir = ensureMediaTypeSubfolder(expectedDir, item.getMediaType());
        String currentDir = extractDirectoryPath(item.getRelativePath());
        if (!currentDir.equals(expectedDir)) {
            relocateSingleMediaItemToDirectory(item, expectedDir, item.getFileName());
        }
    }

    private void updateCollectionSlugAndRelocateAll(MediaCollection col, String newFolderSlug) {
        String oldDir = resolveCollectionDirectoryPath(col);
        col.setSlug(storageService.toSnakeCase(newFolderSlug));
        MediaCollection saved = mediaCollectionRepository.saveAndFlush(col);
        String newDir = resolveCollectionDirectoryPath(saved);
        if (!oldDir.equals(newDir)) {
            List<MediaItem> items = mediaItemRepository.findAll().stream()
                    .filter(m -> m.getOrderedCollections().stream().anyMatch(c -> c.getId().equals(col.getId())))
                    .toList();
            for (MediaItem item : items) {
                String oldRelPath = item.getRelativePath();
                if (oldRelPath != null && oldRelPath.startsWith(oldDir + "/")) {
                    String sub = oldRelPath.substring(oldDir.length() + 1);
                    String targetRelPath = newDir + "/" + sub;
                    String finalPath = storageService.moveFileToRelativePath(oldRelPath, targetRelPath);
                    item.setRelativePath(finalPath);
                    mediaItemRepository.save(item);
                }
            }
            storageService.deleteDirectoryRecursively(oldDir);
        }
    }

    private void moveAllMediaInDirectory(String currentDir, String targetDir) {
        if (Objects.equals(currentDir, targetDir)) {
            return;
        }
        List<MediaItem> items = mediaItemRepository.findAll().stream()
                .filter(m -> extractDirectoryPath(m.getRelativePath()).equals(currentDir))
                .toList();
        for (MediaItem item : items) {
            String finalTarget = ensureMediaTypeSubfolder(targetDir, item.getMediaType());
            relocateSingleMediaItemToDirectory(item, finalTarget, item.getFileName());
            mediaItemRepository.save(item);
        }
    }

    private void relocateSingleMediaItemToDirectory(MediaItem item, String targetDir, String preferredFileName) {
        if (targetDir == null) {
            return;
        }
        String targetFileName = preferredFileName != null ? preferredFileName : item.getFileName();
        String targetRelPath = targetDir + "/" + targetFileName;
        if (Objects.equals(item.getRelativePath(), targetRelPath)) {
            return;
        }
        if (mediaItemRepository.existsByRelativePath(targetRelPath)
                || Files.exists(storageService.resolveMediaFilePath(targetRelPath))) {
            String ext = storageService.extractExtension(targetFileName, item.getMimeType());
            targetFileName = findAvailableFileName(targetDir, targetFileName, ext);
            targetRelPath = targetDir + "/" + targetFileName;
        }
        String movedPath = storageService.moveFileToRelativePath(item.getRelativePath(), targetRelPath);
        item.setRelativePath(movedPath);
        item.setFileName(targetFileName);
        for (MediaVersion ver : item.getVersions()) {
            if (Boolean.TRUE.equals(ver.getIsMain())) {
                ver.setRelativePath(movedPath);
                ver.setFileName(targetFileName);
            } else {
                String verTargetRel = targetDir + "/" + ver.getFileName();
                if (!verTargetRel.equals(ver.getRelativePath())) {
                    String verMoved = storageService.moveFileToRelativePath(ver.getRelativePath(), verTargetRel);
                    ver.setRelativePath(verMoved);
                }
            }
        }
    }

    private int countDepictedPersonsOnItem(MediaItem item) {
        return (int) item.getPersonLinks().stream()
                .filter(l -> l.getLinkType() == MediaPersonLinkType.DEPICTED && l.getPerson() != null)
                .map(l -> l.getPerson().getId())
                .distinct()
                .count();
    }

    private String trimToNull(String val) {
        if (val == null || val.isBlank()) {
            return null;
        }
        return val.trim();
    }

    private byte[] readHeaderBytes(MultipartFile file, int maxBytes) throws IOException {
        try (java.io.InputStream is = file.getInputStream()) {
            return is.readNBytes(maxBytes);
        }
    }
}