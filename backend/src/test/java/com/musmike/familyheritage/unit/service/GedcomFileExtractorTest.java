package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.dto.ParsedGedcomFileDto;
import com.musmike.familyheritage.service.GedcomFileExtractor;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class GedcomFileExtractorTest {

    private final GedcomFileExtractor extractor = new GedcomFileExtractor();

    @Test
    void shouldExtractMyHeritageGedcomWithDoubleSpacesBeforePublishAndBom() throws Exception {
        String myHeritageGedcom = "\uFEFF" + """
            0 HEAD
            1 GEDC
            2 VERS 5.5.1
            1 CHAR UTF-8
            1 SOUR MYHERITAGE
            1 _RINS I1452,F561,N3,M0,R0,S0,U1,L0,P261,Q0,IF2523,FF558
            1 _UID 37BD5A7C-FE8C-45A2-A6C7-8B4B03114A0C
            1 _DESCRIPTION_AWARE Y
            0  _PUBLISH
            1 _SITEADDRESS siteh18d089ea7qe1615218
            1 _SITENAME moja rodzina Web Site
            1 _SITEID 1705109890
            0 @I1@ INDI
            1 NAME Jan /Kowalski/
            1 SEX M
            1 NOTE Pierwsza linia notatki
            Druga linia notatki bez tagu CONT
            0 TRLR
            """;

        ParsedGedcomFileDto parsed = extractor.extract(
                new ByteArrayInputStream(myHeritageGedcom.getBytes(StandardCharsets.UTF_8))
        );

        assertThat(parsed.getSourceSystem()).isEqualTo("MYHERITAGE");
        assertThat(parsed.getIndividuals()).hasSize(1);
        assertThat(parsed.getIndividuals().getFirst().getGivenName()).isEqualTo("Jan");
        assertThat(parsed.getIndividuals().getFirst().getSurname()).isEqualTo("Kowalski");
    }
}