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
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class MediaService {

    private static final Pattern DATED_PATH_YEAR_PATTERN = Pattern.compile("^dated/\\d{4}s/(\\d{4})/");

    private final MediaItemRepository mediaItemRepository;
    private final MediaCollectionRepository mediaCollectionRepository;
    private final PersonRepository personRepository;
    private final GraveRepository graveRepository;
    private final BurialRepository burialRepository;
    private final EventRepository eventRepository;
    private final MediaStorageService storageService;
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

        List<MediaItem> allItems = mediaItemRepository.findAll();

        long totalImages = allItems.stream().filter(m -> m.getMediaType() == MediaType.IMAGE).count();
        long totalVideos = allItems.stream().filter(m -> m.getMediaType() == MediaType.VIDEO).count();

        List<MediaItemDto> filtered = allItems.stream()
                .filter(m -> mediaType == null || m.getMediaType() == mediaType)
                .filter(m -> primaryContext == null || m.getPrimaryContext() == primaryContext)
                .filter(m -> collectionId == null || (m.getCollection() != null && m.getCollection().getId().equals(collectionId)))
                .filter(m -> matchesPersonFilter(m, filterPersonIds, matchAllPersons))
                .map(m -> toDto(m, isAdmin))
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
        String ext = storageService.extractExtension(originalFilename, mimeType);
        String dir = resolveDirectoryForContext(primaryContext, graveId, personId, eventId, collectionId, customYear);
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
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file cannot be empty.");
        }

        String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        MediaType mediaType = mimeType.toLowerCase(Locale.ROOT).startsWith("video/")
                ? MediaType.VIDEO
                : MediaType.IMAGE;

        Long primaryPersonId = (personIds != null && !personIds.isEmpty()) ? personIds.getFirst() : null;
        MediaFilenamePreviewDto preview = previewFilename(
                primaryContext,
                graveId,
                primaryPersonId,
                eventId,
                collectionId,
                customYear,
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

        if (eventId != null) {
            Event linkedEvent = eventRepository.findById(eventId)
                    .orElseThrow(() -> new IllegalArgumentException("Event not found: " + eventId));
            item.getEvents().add(linkedEvent);
        }

        item = mediaItemRepository.saveAndFlush(item);

        boolean isGif = mimeType.toLowerCase(Locale.ROOT).contains("gif");
        storageService.saveFileAndThumbnail(
                item.getRelativePath(),
                item.getId(),
                file.getBytes(),
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

        return toDto(item, true);
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
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("Files list cannot be empty.");
        }

        List<MediaItemDto> results = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            MultipartFile f = files.get(i);
            String cName = (customFileNames != null && i < customFileNames.size()) ? customFileNames.get(i) : null;
            String cTitle = (titles != null && i < titles.size()) ? titles.get(i) : null;
            Integer cYear = (customYears != null && i < customYears.size() && customYears.get(i) != null)
                    ? customYears.get(i)
                    : defaultYear;

            results.add(uploadMedia(
                    f,
                    primaryContext,
                    cName,
                    cTitle,
                    null,
                    graveId,
                    eventId,
                    collectionId,
                    cYear,
                    null,
                    null,
                    null,
                    null,
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

        if (req.getYear() != null) {
            DateDescriptor dd = item.getDateDescriptor() != null ? item.getDateDescriptor() : new DateDescriptor();
            dd.setDateType(DateType.SINGLE);
            dd.setStartQualifier(DateQualifier.EXACT);
            dd.setStartYear(req.getYear());
            dd.setStartMonth(req.getMonth());
            dd.setStartDay(req.getDay());
            if (req.getHour() != null) {
                dd.setStartTimeQualifier(DateQualifier.EXACT);
                dd.setStartHour(req.getHour());
                dd.setStartMinute(req.getMinute());
            } else {
                dd.setStartTimeQualifier(null);
                dd.setStartHour(null);
                dd.setStartMinute(null);
            }
            dd.recalculateSortDates();
            item.setDateDescriptor(dd);
        }

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

        return toDto(item, true);
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
        return mediaItemRepository.findByGravesIdOrderByIdAsc(graveId).stream()
                .map(m -> toDto(m, isAdmin))
                .toList();
    }

    @Transactional
    public List<MediaItemDto> getMediaByPerson(Long personId, boolean isAdmin) {
        return mediaItemRepository.findByPersonsIdOrderByIdAsc(personId).stream()
                .map(m -> toDto(m, isAdmin))
                .toList();
    }

    @Transactional
    public EventMediaOverviewDto getMediaByEventWithSubEvents(Long eventId, boolean isAdmin) {
        List<MediaItemDto> direct = mediaItemRepository.findByEventsIdOrderByIdAsc(eventId).stream()
                .map(m -> toDto(m, isAdmin))
                .toList();

        List<Event> subEvents = eventRepository
                .findByParentEventIdOrderByCachedStartSortDateTimeAscIdAsc(eventId);

        List<SubEventMediaGroupDto> subGroups = new ArrayList<>();
        for (Event sub : subEvents) {
            List<MediaItemDto> subMedia = mediaItemRepository.findByEventsIdOrderByIdAsc(sub.getId()).stream()
                    .map(m -> toDto(m, isAdmin))
                    .toList();
            if (!subMedia.isEmpty()) {
                String label = (sub.getTitle() != null && !sub.getTitle().isBlank())
                        ? sub.getTitle()
                        : sub.getEventType().getCode();
                String dateText = (sub.getStartDate() != null && sub.getStartDate().getStartYear() != null)
                        ? String.valueOf(sub.getStartDate().getStartYear())
                        : null;
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
        Comparator<Integer> nullSafeYearAsc = Comparator.nullsLast(Integer::compareTo);
        Comparator<Integer> nullSafeYearDesc = Comparator.nullsLast(Comparator.reverseOrder());

        return switch (mode) {
            case "YEAR_ASC" -> Comparator
                    .comparing(MediaItemDto::getYear, nullSafeYearAsc)
                    .thenComparingLong(MediaItemDto::getId);
            case "YEAR_DESC" -> Comparator
                    .comparing(MediaItemDto::getYear, nullSafeYearDesc)
                    .thenComparingLong(MediaItemDto::getId);
            case "FILENAME_ASC" -> Comparator
                    .comparing(MediaItemDto::getFileName, String.CASE_INSENSITIVE_ORDER)
                    .thenComparingLong(MediaItemDto::getId);
            default -> Comparator
                    .comparing(MediaItemDto::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(MediaItemDto::getId, Comparator.reverseOrder());
        };
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
                Integer year = customYear != null ? customYear : extractYearFromEvent(evt);
                String evtSlug = buildEventFolderSlug(evt, year);
                if (year != null) {
                    int decade = (year / 10) * 10;
                    return String.format("dated/%ds/%d/%s", decade, year, evtSlug);
                }
                return "undated/events/" + evtSlug;
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
                return buildEventFolderSlug(evt, year);
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

        List<String> participantSurnames = evt.getParticipants().stream()
                .filter(ep -> ep.getPerson() != null)
                .map(ep -> ep.getPerson().getCachedSurname())
                .filter(Objects::nonNull)
                .filter(s -> !s.isBlank())
                .distinct()
                .limit(2)
                .map(storageService::toSnakeCase)
                .toList();

        String suffix = participantSurnames.isEmpty()
                ? namePart
                : namePart + "_" + String.join("_", participantSurnames);

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

    private MediaItemDto toDto(MediaItem item, boolean isAdmin) {
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
                .map(e -> (e.getTitle() != null && !e.getTitle().isBlank()) ? e.getTitle() : e.getEventType().getCode())
                .distinct()
                .toList();

        DateDescriptor dd = item.getDateDescriptor();

        return MediaItemDto.builder()
                .id(item.getId())
                .mediaType(item.getMediaType())
                .primaryContext(item.getPrimaryContext())
                .relativePath(isAdmin ? item.getRelativePath() : null)
                .fileName(item.getFileName())
                .mimeType(item.getMimeType())
                .fileSize(item.getFileSize())
                .title(item.getTitle())
                .description(item.getDescription())
                .year(resolveMediaItemYear(item))
                .month(dd != null ? dd.getStartMonth() : null)
                .day(dd != null ? dd.getStartDay() : null)
                .hour(dd != null ? dd.getStartHour() : null)
                .minute(dd != null ? dd.getStartMinute() : null)
                .dateText(dd != null ? EventTimelineService.formatEventDates(dd, null) : null)
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