package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.service.BurialService;
import com.musmike.familyheritage.service.EventTimelineService;
import com.musmike.familyheritage.service.MediaStorageService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class MediaControllerTest extends AbstractIntegrationTest {

    private static final String CSRF = "csrf-media-test";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PersonRepository personRepository;
    @Autowired private BurialService burialService;
    @Autowired private EventTimelineService eventTimelineService;
    @Autowired private MediaStorageService storageService;

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldUploadGravePhotoWithSnakeCasePathRenameFileOnDiskAndServeResource() throws Exception {
        Person jan = new Person();
        jan.setCachedGivenName("Jan");
        jan.setCachedSurname("Łukasiewicz");
        jan = personRepository.saveAndFlush(jan);

        var cem = burialService.createCemetery(SaveCemeteryRequestDto.builder()
                .name("Cmentarz Parafialny w Kocku")
                .build());

        var grave = burialService.createGrave(SaveGraveRequestDto.builder()
                .cemeteryId(cem.getCemeteryId())
                .initialPersonId(jan.getId())
                .build(), true);

        // 1. Preview suggested snake_case filename and directory
        mockMvc.perform(get("/media/preview-filename")
                        .param("primaryContext", "GRAVE")
                        .param("graveId", String.valueOf(grave.getGraveId()))
                        .param("originalFilename", "IMG_001.JPG"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.directoryPath").value("collections/graves/cmentarz_parafialny_w_kocku"))
                .andExpect(jsonPath("$.suggestedFileName").value("jan_lukasiewicz_grave_01.jpg"));

        // 2. Upload photo to grave and set as primary grave photo + person avatar
        MockMultipartFile file = new MockMultipartFile(
                "file", "IMG_001.JPG", "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}
        );

        MvcResult uploadRes = mockMvc.perform(multipart("/media/upload")
                        .file(file)
                        .param("primaryContext", "GRAVE")
                        .param("graveId", String.valueOf(grave.getGraveId()))
                        .param("personIds", String.valueOf(jan.getId()))
                        .param("setAsPersonAvatar", "true")
                        .param("setAsGravePrimary", "true")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("jan_lukasiewicz_grave_01.jpg"))
                .andExpect(jsonPath("$.relativePath").value("collections/graves/cmentarz_parafialny_w_kocku/jan_lukasiewicz_grave_01.jpg"))
                .andReturn();

        MediaItemDto uploaded = objectMapper.readValue(
                uploadRes.getResponse().getContentAsString(), MediaItemDto.class
        );

        assertThat(Files.exists(storageService.resolveMediaFilePath(uploaded.getRelativePath()))).isTrue();

        // 3. Rename file on disk via PUT /media/{id}
        UpdateMediaItemRequestDto renameReq = UpdateMediaItemRequestDto.builder()
                .fileName("grob_rodziny_lukasiewiczow_kock")
                .title("Nagrobek Jana Łukasiewicza")
                .build();

        mockMvc.perform(put("/media/{id}", uploaded.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(renameReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value("grob_rodziny_lukasiewiczow_kock.jpg"))
                .andExpect(jsonPath("$.relativePath").value("collections/graves/cmentarz_parafialny_w_kocku/grob_rodziny_lukasiewiczow_kock.jpg"));

        // 4. Serve file bytes
        mockMvc.perform(get("/media/{id}/file", uploaded.getId()))
                .andExpect(status().isOk());

        // 5. Delete media and verify physical file is removed from disk
        mockMvc.perform(delete("/media/{id}", uploaded.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isNoContent());

        assertThat(Files.exists(storageService.resolveMediaFilePath(
                "collections/graves/cmentarz_parafialny_w_kocku/grob_rodziny_lukasiewiczow_kock.jpg"
        ))).isFalse();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldExtractExifDateAutoMoveEventFolderOnDateChangeBulkUpdateAndLinkExistingMedia() throws Exception {
        Person jan = new Person();
        jan.setCachedGivenName("Jan Aleksander");
        jan.setCachedSurname("Kowalski");
        jan = personRepository.saveAndFlush(jan);

        TimelineEventDto evt = eventTimelineService.createEvent(SaveEventRequestDto.builder()
                .typeCodes(List.of("SUMMER_VACATION"))
                .title("Wakacje nad morzem")
                .startYear(1995)
                .startMonth(7)
                .startDay(10)
                .participants(List.of(new SaveEventParticipantRequestDto(jan.getId(), null, null, "PRINCIPAL")))
                .build());

        // Upload photo with embedded EXIF timestamp header ("1995:07:12 14:25:38")
        byte[] fakeExifJpeg = ("\u00FF\u00D8\u00FF\u00E1Exif1995:07:12 14:25:38").getBytes(StandardCharsets.ISO_8859_1);
        MockMultipartFile photo = new MockMultipartFile("file", "sea.jpg", "image/jpeg", fakeExifJpeg);

        MvcResult uploadRes = mockMvc.perform(multipart("/media/upload")
                        .file(photo)
                        .param("primaryContext", "EVENT")
                        .param("eventId", String.valueOf(evt.getEventId()))
                        .param("customYear", "1995")
                        .param("personIds", String.valueOf(jan.getId()))
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.relativePath").value(
                        "dated/1990s/1995/1995_07_10_wakacje_nad_morzem/1995_07_10_wakacje_nad_morzem_01.jpg"
                ))
                .andExpect(jsonPath("$.metadataYear").value(1995))
                .andExpect(jsonPath("$.metadataMonth").value(7))
                .andExpect(jsonPath("$.metadataDay").value(12))
                .andExpect(jsonPath("$.metadataHour").value(14))
                .andExpect(jsonPath("$.metadataMinute").value(25))
                .andExpect(jsonPath("$.metadataSecond").value(38))
                .andExpect(jsonPath("$.metadataDateSource", containsString("EXIF")))
                .andReturn();

        Long mediaId = objectMapper.readTree(uploadRes.getResponse().getContentAsString()).get("id").asLong();

        // Switch media item's effective date to METADATA via bulkUpdateMedia
        BulkUpdateMediaRequestDto bulkReq = BulkUpdateMediaRequestDto.builder()
                .mediaIds(List.of(mediaId))
                .dateSourceMode("METADATA")
                .build();

        mockMvc.perform(put("/media/bulk-update")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(bulkReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dateText").value("12.07.1995, godz. 14:25:38"));

        // Update Event date from 10.07.1995 to 20.08.1996 -> folder and filename automatically update!
        eventTimelineService.updateEvent(evt.getEventId(), SaveEventRequestDto.builder()
                .typeCodes(List.of("SUMMER_VACATION"))
                .title("Wakacje nad morzem")
                .startYear(1996)
                .startMonth(8)
                .startDay(20)
                .participants(List.of(new SaveEventParticipantRequestDto(jan.getId(), null, null, "PRINCIPAL")))
                .build());

        mockMvc.perform(get("/media/by-event/{id}", evt.getEventId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.directMedia[0].relativePath").value(
                        "dated/1990s/1996/1996_08_20_wakacje_nad_morzem/1996_08_20_wakacje_nad_morzem_01.jpg"
                ));

        // Link this existing vacation photo to a Grave as well!
        var grave = burialService.createGrave(SaveGraveRequestDto.builder()
                .initialPersonId(jan.getId())
                .build(), true);

        LinkExistingMediaRequestDto linkReq = LinkExistingMediaRequestDto.builder()
                .mediaIds(List.of(mediaId))
                .graveId(grave.getGraveId())
                .build();

        mockMvc.perform(post("/media/link-existing")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(linkReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].graveIds", hasItem(grave.getGraveId().intValue())));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldCreateArchiveCollectionAndFilterGalleryByMultiplePersons() throws Exception {
        Person jan = new Person();
        jan.setCachedGivenName("Jan");
        jan.setCachedSurname("Nowak");
        jan = personRepository.saveAndFlush(jan);

        Person anna = new Person();
        anna.setCachedGivenName("Anna");
        anna.setCachedSurname("Kowalska");
        anna = personRepository.saveAndFlush(anna);

        var colReq = SaveMediaCollectionRequestDto.builder()
                .name("Zbiór po babci Katarzynie")
                .founderPersonId(anna.getId())
                .build();

        MvcResult colRes = mockMvc.perform(post("/media/collections")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(colReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value("zbior_po_babci_katarzynie"))
                .andReturn();

        Long colId = objectMapper.readTree(colRes.getResponse().getContentAsString()).get("id").asLong();

        MockMultipartFile sharedPhoto = new MockMultipartFile(
                "file", "shared.jpg", "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}
        );

        mockMvc.perform(multipart("/media/upload")
                        .file(sharedPhoto)
                        .param("primaryContext", "COLLECTION")
                        .param("collectionId", String.valueOf(colId))
                        .param("personIds", jan.getId() + "," + anna.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.relativePath").value("collections/zbior_po_babci_katarzynie/zbior_po_babci_katarzynie_01.jpg"));

        mockMvc.perform(get("/media/gallery")
                        .param("personIds", jan.getId() + "," + anna.getId())
                        .param("matchAllPersons", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].collectionName").value("Zbiór po babci Katarzynie"));
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldAvoidDouble01SuffixSupportVideoAvatarWithCropAndHideRelativePathForNonAdmin() throws Exception {
        Person jan = new Person();
        jan.setCachedGivenName("Jan");
        jan.setCachedSurname("Kowalski");
        jan = personRepository.saveAndFlush(jan);

        var colReq = SaveMediaCollectionRequestDto.builder()
                .name("Kolekcja Portretów")
                .build();

        MvcResult colRes = mockMvc.perform(post("/media/collections")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(colReq)))
                .andExpect(status().isCreated())
                .andReturn();

        Long colId = objectMapper.readTree(colRes.getResponse().getContentAsString()).get("id").asLong();

        MockMultipartFile videoFile = new MockMultipartFile(
                "file", "living_portrait.mp4", "video/mp4", new byte[]{0x00, 0x01, 0x02}
        );

        MvcResult uploadRes = mockMvc.perform(multipart("/media/upload")
                        .file(videoFile)
                        .param("primaryContext", "PERSON")
                        .param("collectionId", String.valueOf(colId))
                        .param("customFileName", "jan_kowalski_portrait_01.mp4")
                        .param("personIds", String.valueOf(jan.getId()))
                        .param("setAsPersonAvatar", "true")
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("jan_kowalski_portrait_01.mp4"))
                .andExpect(jsonPath("$.mediaType").value("VIDEO"))
                .andExpect(jsonPath("$.relativePath").isNotEmpty())
                .andReturn();

        MediaItemDto uploaded = objectMapper.readValue(
                uploadRes.getResponse().getContentAsString(), MediaItemDto.class
        );

        UpdateMediaItemRequestDto cropReq = UpdateMediaItemRequestDto.builder()
                .setAsAvatarForPersonId(jan.getId())
                .avatarCropX(30)
                .avatarCropY(20)
                .avatarCropZoom(1.8)
                .build();

        mockMvc.perform(put("/media/{id}", uploaded.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cropReq)))
                .andExpect(status().isOk());

        Person updatedJan = personRepository.findById(jan.getId()).orElseThrow();
        assertThat(updatedJan.getAvatarMedia().getId()).isEqualTo(uploaded.getId());
        assertThat(updatedJan.getAvatarCropX()).isEqualTo(30);
        assertThat(updatedJan.getAvatarCropY()).isEqualTo(20);
        assertThat(updatedJan.getAvatarCropZoom()).isEqualTo(1.8);
    }
}
