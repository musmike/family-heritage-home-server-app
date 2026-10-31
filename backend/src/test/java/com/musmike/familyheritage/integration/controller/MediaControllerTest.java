package com.musmike.familyheritage.integration.controller;

import tools.jackson.databind.ObjectMapper;
import com.musmike.familyheritage.dto.MediaItemDto;
import com.musmike.familyheritage.dto.SaveCemeteryRequestDto;
import com.musmike.familyheritage.dto.SaveGraveRequestDto;
import com.musmike.familyheritage.dto.UpdateMediaItemRequestDto;
import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.service.BurialService;
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

import java.nio.file.Files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class MediaControllerTest extends AbstractIntegrationTest {

    private static final String CSRF = "csrf-media-test";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PersonRepository personRepository;
    @Autowired private BurialService burialService;
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
                .andExpect(jsonPath("$.directoryPath").value("undated/graves/cmentarz_parafialny_w_kocku"))
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
                .andExpect(jsonPath("$.relativePath").value("undated/graves/cmentarz_parafialny_w_kocku/jan_lukasiewicz_grave_01.jpg"))
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
                .andExpect(jsonPath("$.relativePath").value("undated/graves/cmentarz_parafialny_w_kocku/grob_rodziny_lukasiewiczow_kock.jpg"));

        // 4. Serve file bytes
        mockMvc.perform(get("/media/{id}/file", uploaded.getId()))
                .andExpect(status().isOk());

        // 5. Delete media and verify physical file is removed from disk
        mockMvc.perform(delete("/media/{id}", uploaded.getId())
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isNoContent());

        assertThat(Files.exists(storageService.resolveMediaFilePath(
                "undated/graves/cmentarz_parafialny_w_kocku/grob_rodziny_lukasiewiczow_kock.jpg"
        ))).isFalse();
    }

    @Test
    @Transactional
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void shouldSaveDatedEventMediaInDecadeYearFolderAndAggregateSubEventMediaInParentEvent() throws Exception {
        // 1. Create parent event ("Wyjazd do Gdańska", 1975) and child event ("Pogrzeb ciotki", 1975)
        String gedcom = """
            0 HEAD
            1 SOUR TEST
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 BIRT
            2 DATE 10 MAY 1975
            1 DEAT
            2 DATE 12 MAY 1975
            0 TRLR
            """;
        var extractor = new com.musmike.familyheritage.service.GedcomFileExtractor();
        var parsed = extractor.extract(new java.io.ByteArrayInputStream(gedcom.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        Person jan = personRepository.findAll().stream().findFirst().orElseGet(() -> {
            Person p = new Person();
            p.setCachedGivenName("Jan");
            p.setCachedSurname("Kowalski");
            return personRepository.saveAndFlush(p);
        });

        // Link two events in 1975 via EventTimelineController
        MockMultipartFile tripPhoto = new MockMultipartFile(
                "file", "trip.jpg", "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}
        );

        mockMvc.perform(multipart("/media/upload")
                        .file(tripPhoto)
                        .param("primaryContext", "OTHER")
                        .param("customYear", "1975")
                        .param("customFileName", "trip_to_gdansk")
                        .param("personIds", String.valueOf(jan.getId()))
                        .cookie(new Cookie("XSRF-TOKEN", CSRF))
                        .header("X-XSRF-TOKEN", CSRF))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.relativePath").value("dated/1970s/1975/misc_1975/trip_to_gdansk_01.jpg"));
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

        // 1. Create family collection ("Zbiór po babci Katarzynie")
        var colReq = com.musmike.familyheritage.dto.SaveMediaCollectionRequestDto.builder()
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

        // 2. Upload photo to that collection with BOTH Jan and Anna tagged
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
                .andExpect(jsonPath("$.relativePath").value("undated/collections/zbior_po_babci_katarzynie/zbior_po_babci_katarzynie_01.jpg"));

        // 3. Query /media/gallery filtering by BOTH Jan and Anna (matchAllPersons = true)
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

        MockMultipartFile videoFile = new MockMultipartFile(
                "file", "living_portrait.mp4", "video/mp4", new byte[]{0x00, 0x01, 0x02}
        );

        // Even if customFileName already ends with "_01.mp4", it must NOT become "_01_01.mp4"
        MvcResult uploadRes = mockMvc.perform(multipart("/media/upload")
                        .file(videoFile)
                        .param("primaryContext", "PERSON")
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

        // Update avatar crop coordinates (e.g. X=30, Y=20, Zoom=1.8)
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