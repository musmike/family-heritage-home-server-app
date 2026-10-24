package com.musmike.familyheritage.unit.service;

import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import com.musmike.familyheritage.service.GedcomDateParser;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

class GedcomDateParserTest {
    private final GedcomDateParser dateParser = new GedcomDateParser();

    // --- SINGLE - EXACT ---

    @Test
    void shouldParseExactFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("15 FEB 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1990, 2, 15,
                LocalDateTime.of(1990, 2, 15, 0, 0),
                LocalDateTime.of(1990, 2, 15, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseExactMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("MAR 2001");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 2001, 3, null,
                LocalDateTime.of(2001, 3, 1, 0, 0),
                LocalDateTime.of(2001, 3, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseExactYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("1975");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1975, null, null,
                LocalDateTime.of(1975, 1, 1, 0, 0),
                LocalDateTime.of(1975, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- SINGLE - BEFORE ---

    @Test
    void shouldParseBeforeFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BEF 14 JUL 2000");

        assertSingleDate(result.getStartDate(), DateQualifier.BEFORE, 2000, 7, 14,
                LocalDateTime.of(2000, 7, 14, 0, 0),
                LocalDateTime.of(2000, 7, 14, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseBeforeMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BEF AUG 1999");

        assertSingleDate(result.getStartDate(), DateQualifier.BEFORE, 1999, 8, null,
                LocalDateTime.of(1999, 8, 1, 0, 0),
                LocalDateTime.of(1999, 8, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseBeforeYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BEF 1850");

        assertSingleDate(result.getStartDate(), DateQualifier.BEFORE, 1850, null, null,
                LocalDateTime.of(1850, 1, 1, 0, 0),
                LocalDateTime.of(1850, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- SINGLE - AFTER ---

    @Test
    void shouldParseAfterFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("AFT 01 DEC 1945");

        assertSingleDate(result.getStartDate(), DateQualifier.AFTER, 1945, 12, 1,
                LocalDateTime.of(1945, 12, 1, 0, 0),
                LocalDateTime.of(1945, 12, 1, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseAfterMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("AFT JUN 1980");

        assertSingleDate(result.getStartDate(), DateQualifier.AFTER, 1980, 6, null,
                LocalDateTime.of(1980, 6, 1, 0, 0),
                LocalDateTime.of(1980, 6, 30, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseAfterYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("AFT 1920");

        assertSingleDate(result.getStartDate(), DateQualifier.AFTER, 1920, null, null,
                LocalDateTime.of(1920, 1, 1, 0, 0),
                LocalDateTime.of(1920, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- SINGLE - ABOUT ---

    @Test
    void shouldParseAboutFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("ABT 05 SEP 1888");

        assertSingleDate(result.getStartDate(), DateQualifier.ABOUT, 1888, 9, 5,
                LocalDateTime.of(1888, 9, 5, 0, 0),
                LocalDateTime.of(1888, 9, 5, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseAboutMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("ABT JUL 1870");

        assertSingleDate(result.getStartDate(), DateQualifier.ABOUT, 1870, 7, null,
                LocalDateTime.of(1870, 7, 1, 0, 0),
                LocalDateTime.of(1870, 7, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseAboutYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("ABT 1810");

        assertSingleDate(result.getStartDate(), DateQualifier.ABOUT, 1810, null, null,
                LocalDateTime.of(1810, 1, 1, 0, 0),
                LocalDateTime.of(1810, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- SINGLE - ESTIMATED ---

    @Test
    void shouldParseEstimatedFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("EST 20 NOV 1932");

        assertSingleDate(result.getStartDate(), DateQualifier.ESTIMATED, 1932, 11, 20,
                LocalDateTime.of(1932, 11, 20, 0, 0),
                LocalDateTime.of(1932, 11, 20, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseEstimatedMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("EST MAY 1925");

        assertSingleDate(result.getStartDate(), DateQualifier.ESTIMATED, 1925, 5, null,
                LocalDateTime.of(1925, 5, 1, 0, 0),
                LocalDateTime.of(1925, 5, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseEstimatedYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("EST 1930");

        assertSingleDate(result.getStartDate(), DateQualifier.ESTIMATED, 1930, null, null,
                LocalDateTime.of(1930, 1, 1, 0, 0),
                LocalDateTime.of(1930, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- SINGLE - CALCULATED ---

    @Test
    void shouldParseCalculatedFullDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("CAL 04 JUL 1776");

        assertSingleDate(result.getStartDate(), DateQualifier.CALCULATED, 1776, 7, 4,
                LocalDateTime.of(1776, 7, 4, 0, 0),
                LocalDateTime.of(1776, 7, 4, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseCalculatedMonthAndYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("CAL FEB 1800");

        assertSingleDate(result.getStartDate(), DateQualifier.CALCULATED, 1800, 2, null,
                LocalDateTime.of(1800, 2, 1, 0, 0),
                LocalDateTime.of(1800, 2, 28, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseCalculatedYearOnly() {
        GedcomDateParser.DateParseResult result = dateParser.parse("CAL 1776");

        assertSingleDate(result.getStartDate(), DateQualifier.CALCULATED, 1776, null, null,
                LocalDateTime.of(1776, 1, 1, 0, 0),
                LocalDateTime.of(1776, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- RANGE - BET ... AND ... ---

    @Test
    void shouldParseRangeFullDatesToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 10 JAN 1980 AND 20 DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, 10,
                DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeFullDatesToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 10 JAN 1980 AND DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, 10,
                DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeFullDatesToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 10 JAN 1980 AND 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, 10,
                DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeMonthYearToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET JAN 1980 AND 20 DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, null,
                DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeMonthYearToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET JAN 1980 AND DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, null,
                DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeMonthYearToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET JAN 1980 AND 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, 1, null,
                DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeYearToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 1980 AND 20 DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, null, null,
                DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeYearToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 1980 AND DEC 1990");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1980, null, null,
                DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseRangeYearToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("BET 1981 AND 1991");

        assertRangeDate(result.getStartDate(),
                DateQualifier.EXACT, 1981, null, null,
                DateQualifier.EXACT, 1991, null, null,
                LocalDateTime.of(1981, 1, 1, 0, 0),
                LocalDateTime.of(1991, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    // --- RANGE – FROM … TO … ---

    @Test
    void shouldParseFromTo_FullDatesToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 10 JAN 1980 TO 20 DEC 1990");

        // Start Date
        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, 10,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1980, 1, 10, 23, 59));

        // End Date
        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1990, 12, 20, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));
    }

    @Test
    void shouldParseFromTo_FullDatesToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 10 JAN 1980 TO DEC 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, 10,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1980, 1, 10, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1990, 12, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_FullDatesToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 10 JAN 1980 TO 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, 10,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1980, 1, 10, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1990, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_FullDatesToNull() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 10 JAN 1980");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, 10,
                LocalDateTime.of(1980, 1, 10, 0, 0),
                LocalDateTime.of(1980, 1, 10, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseFromTo_MonthYearToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM JAN 1980 TO 20 DEC 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 1, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1990, 12, 20, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));
    }

    @Test
    void shouldParseFromTo_MonthYearToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM JAN 1980 TO DEC 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 1, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1990, 12, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_MonthYearToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM JAN 1980 TO 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 1, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1990, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_MonthYearToNull() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM JAN 1980");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, 1, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 1, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseFromTo_YearToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 1980 TO 20 DEC 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, null, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 12, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1990, 12, 20, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));
    }

    @Test
    void shouldParseFromTo_YearToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 1980 TO DEC 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, null, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 12, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1990, 12, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_YearToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 1980 TO 1990");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, null, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 12, 31, 23, 59));

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1990, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_YearToNull() {
        GedcomDateParser.DateParseResult result = dateParser.parse("FROM 1980");

        assertSingleDate(result.getStartDate(), DateQualifier.EXACT, 1980, null, null,
                LocalDateTime.of(1980, 1, 1, 0, 0),
                LocalDateTime.of(1980, 12, 31, 23, 59));

        assertNull(result.getEndDate());
    }

    @Test
    void shouldParseFromTo_NullToFullDates() {
        GedcomDateParser.DateParseResult result = dateParser.parse("TO 20 DEC 1990");

        assertNull(result.getStartDate());

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, 20,
                LocalDateTime.of(1990, 12, 20, 0, 0),
                LocalDateTime.of(1990, 12, 20, 23, 59));
    }

    @Test
    void shouldParseFromTo_NullToMonthYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("TO DEC 1990");

        assertNull(result.getStartDate());

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, 12, null,
                LocalDateTime.of(1990, 12, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    @Test
    void shouldParseFromTo_NullToYear() {
        GedcomDateParser.DateParseResult result = dateParser.parse("TO 1990");

        assertNull(result.getStartDate());

        assertSingleDate(result.getEndDate(), DateQualifier.EXACT, 1990, null, null,
                LocalDateTime.of(1990, 1, 1, 0, 0),
                LocalDateTime.of(1990, 12, 31, 23, 59));
    }

    // --- FREE TEXT ---

    @Test
    void shouldParseFreeTextDate() {
        GedcomDateParser.DateParseResult result = dateParser.parse("Early Spring 1900");

        assertFreeText(result.getStartDate(), "Early Spring 1900");

        assertNull(result.getEndDate());
    }

    // -- Letter size --

    @Test
    void shouldBeCaseInsensitive() {
        GedcomDateParser.DateParseResult upperResult = dateParser.parse("BEF 10 JAN 1980");
        GedcomDateParser.DateParseResult lowerResult = dateParser.parse("bef 10 jan 1980");

        DateDescriptor upperDate = upperResult.getStartDate();
        DateDescriptor lowerDate = lowerResult.getStartDate();

        assertEquals(upperDate.getDateType(), lowerDate.getDateType());

        assertEquals(upperDate.getStartQualifier(), lowerDate.getStartQualifier());
        assertEquals(upperDate.getStartYear(), lowerDate.getStartYear());
        assertEquals(upperDate.getStartMonth(), lowerDate.getStartMonth());
        assertEquals(upperDate.getStartDay(), lowerDate.getStartDay());

        assertEquals(upperDate.getEndQualifier(), lowerDate.getEndQualifier());
        assertEquals(upperDate.getEndYear(), lowerDate.getEndYear());
        assertEquals(upperDate.getEndMonth(), lowerDate.getEndMonth());
        assertEquals(upperDate.getEndDay(), lowerDate.getEndDay());

        assertEquals(upperDate.getSortDateTimeMin(), lowerDate.getSortDateTimeMin());
        assertEquals(upperDate.getSortDateTimeMax(), lowerDate.getSortDateTimeMax());

        assertNull(upperResult.getEndDate());
        assertNull(lowerResult.getEndDate());
    }

    // --- Null ---

    @Test
    void shouldHandleNullInput() {
        GedcomDateParser.DateParseResult result = dateParser.parse(null);
        DateDescriptor startDate = result.getStartDate();

        assertNotNull(result);

        assertEquals(DateType.FREE_TEXT, startDate.getDateType());
        assertNull(startDate.getFreeText());

        assertNull(startDate.getStartQualifier());
        assertNull(startDate.getStartYear());
        assertNull(startDate.getStartMonth());
        assertNull(startDate.getStartDay());

        assertNull(startDate.getEndQualifier());
        assertNull(startDate.getEndYear());
        assertNull(startDate.getEndMonth());
        assertNull(startDate.getEndDay());

        assertNull(startDate.getSortDateTimeMin());
        assertNull(startDate.getSortDateTimeMax());

        assertNull(result.getEndDate());
    }

    // -- Empty string --

    @Test
    void shouldHandleEmptyString() {
        GedcomDateParser.DateParseResult result = dateParser.parse("");
        DateDescriptor startDate = result.getStartDate();

        assertNotNull(result);

        assertEquals(DateType.FREE_TEXT, startDate.getDateType());
        assertEquals("", startDate.getFreeText());

        assertNull(startDate.getStartQualifier());
        assertNull(startDate.getStartYear());
        assertNull(startDate.getStartMonth());
        assertNull(startDate.getStartDay());

        assertNull(startDate.getEndQualifier());
        assertNull(startDate.getEndYear());
        assertNull(startDate.getEndMonth());
        assertNull(startDate.getEndDay());

        assertNull(startDate.getSortDateTimeMin());
        assertNull(startDate.getSortDateTimeMax());

        assertNull(result.getEndDate());
    }

    // --- HELPER METHODS ---

    private void assertSingleDate(DateDescriptor descriptor, DateQualifier qualifier, Integer year,
                                  Integer month, Integer day, LocalDateTime sortMin, LocalDateTime sortMax) {
        assertEquals(DateType.SINGLE, descriptor.getDateType());

        assertEquals(qualifier, descriptor.getStartQualifier());
        assertEquals(year, descriptor.getStartYear());
        assertEquals(month, descriptor.getStartMonth());
        assertEquals(day, descriptor.getStartDay());

        assertNull(descriptor.getEndQualifier());
        assertNull(descriptor.getEndYear());
        assertNull(descriptor.getEndMonth());
        assertNull(descriptor.getEndDay());

        assertEquals(sortMin, descriptor.getSortDateTimeMin());
        assertEquals(sortMax, descriptor.getSortDateTimeMax());
    }


    private void assertRangeDate(DateDescriptor descriptor, DateQualifier startQual, Integer startY,
                                 Integer startM, Integer startD, DateQualifier endQual, Integer endY,
                                 Integer endM, Integer endD, LocalDateTime sortMin, LocalDateTime sortMax) {
        assertEquals(DateType.RANGE, descriptor.getDateType());

        assertEquals(startQual, descriptor.getStartQualifier());
        assertEquals(startY, descriptor.getStartYear());
        assertEquals(startM, descriptor.getStartMonth());
        assertEquals(startD, descriptor.getStartDay());

        assertEquals(endQual, descriptor.getEndQualifier());
        assertEquals(endY, descriptor.getEndYear());
        assertEquals(endM, descriptor.getEndMonth());
        assertEquals(endD, descriptor.getEndDay());

        assertEquals(sortMin, descriptor.getSortDateTimeMin());
        assertEquals(sortMax, descriptor.getSortDateTimeMax());
    }

    private void assertFreeText(DateDescriptor descriptor, String expectedText) {
        assertEquals(DateType.FREE_TEXT, descriptor.getDateType());
        assertEquals(expectedText, descriptor.getFreeText());

        assertNull(descriptor.getStartQualifier());
        assertNull(descriptor.getStartYear());
        assertNull(descriptor.getStartMonth());
        assertNull(descriptor.getStartDay());

        assertNull(descriptor.getEndQualifier());
        assertNull(descriptor.getEndYear());
        assertNull(descriptor.getEndMonth());
        assertNull(descriptor.getEndDay());

        assertNull(descriptor.getSortDateTimeMin());
        assertNull(descriptor.getSortDateTimeMax());
    }
}