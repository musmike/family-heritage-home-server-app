package com.musmike.familyheritage.service;

import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GedcomDateParser {

    private static final Map<String, Integer> MONTHS = new HashMap<>();
    private static final Pattern DATE_PATTERN = Pattern.compile("^(\\d{1,2}\\s+)?([A-Z]{3}\\s+)?(\\d{3,4})$");

    static {
        MONTHS.put("JAN", 1); MONTHS.put("FEB", 2); MONTHS.put("MAR", 3);
        MONTHS.put("APR", 4); MONTHS.put("MAY", 5); MONTHS.put("JUN", 6);
        MONTHS.put("JUL", 7); MONTHS.put("AUG", 8); MONTHS.put("SEP", 9);
        MONTHS.put("OCT", 10); MONTHS.put("NOV", 11); MONTHS.put("DEC", 12);
    }

    public DateParseResult parse(String rawDate) {
        // Null or empty string
        if (rawDate == null || rawDate.trim().isEmpty()) {
            return new DateParseResult(createFreeTextDescriptor(rawDate));
        }

        String cleaned = rawDate.trim().toUpperCase();

        // FROM ... TO ...
        if (cleaned.startsWith("FROM ") && cleaned.contains(" TO ")) {
            String[] parts = cleaned.substring(5).split(" TO ");
            if (parts.length == 2) {
                DateDescriptor start = parseSingleDate(parts[0], DateQualifier.EXACT, parts[0]);
                DateDescriptor end = parseSingleDate(parts[1], DateQualifier.EXACT, parts[1]);
                return new DateParseResult(start, end);
            }
        }

        // BET ... AND ...
        if (cleaned.startsWith("BET ") && cleaned.contains(" AND ")) {
            String[] parts = cleaned.substring(4).split(" AND ");
            if (parts.length == 2) {
                DateDescriptor rangeDescriptor = parseRange(parts[0], parts[1], rawDate);
                return new DateParseResult(rangeDescriptor);
            }
        }

        // FROM ...
        if (cleaned.startsWith("FROM ")) {
            DateDescriptor start = parseSingleDate(cleaned.substring(5), DateQualifier.EXACT, rawDate);
            if (start.getDateType() == DateType.FREE_TEXT) {
                return new DateParseResult(createFreeTextDescriptor(rawDate));
            }
            return new DateParseResult(start);
        }

        // TO ...
        if (cleaned.startsWith("TO ")) {
            DateDescriptor end = parseSingleDate(cleaned.substring(3), DateQualifier.EXACT, rawDate);
            if (end.getDateType() == DateType.FREE_TEXT) {
                return new DateParseResult(createFreeTextDescriptor(rawDate));
            }
            return new DateParseResult(null, end);
        }

        // Single date
        if (cleaned.startsWith("BEF ")) return singleResult(parseSingleDate(cleaned.substring(4),
                DateQualifier.BEFORE, rawDate), rawDate);
        if (cleaned.startsWith("AFT ")) return singleResult(parseSingleDate(cleaned.substring(4),
                DateQualifier.AFTER, rawDate), rawDate);
        if (cleaned.startsWith("ABT ")) return singleResult(parseSingleDate(cleaned.substring(4),
                DateQualifier.ABOUT, rawDate), rawDate);
        if (cleaned.startsWith("EST ")) return singleResult(parseSingleDate(cleaned.substring(4),
                DateQualifier.ESTIMATED, rawDate), rawDate);
        if (cleaned.startsWith("CAL ")) return singleResult(parseSingleDate(cleaned.substring(4),
                DateQualifier.CALCULATED, rawDate), rawDate);

        // Default EXACT
        return new DateParseResult(parseSingleDate(cleaned, DateQualifier.EXACT, rawDate));
    }

    private DateParseResult singleResult(DateDescriptor descriptor, String originalRaw) {
        if (descriptor.getDateType() == DateType.FREE_TEXT) {
            descriptor.setFreeText(originalRaw);
        }
        return new DateParseResult(descriptor);
    }

    private DateDescriptor createFreeTextDescriptor(String text) {
        DateDescriptor dd = new DateDescriptor();
        dd.setDateType(DateType.FREE_TEXT);
        dd.setFreeText(text);
        return dd;
    }

    private DateDescriptor parseRange(String dateStr1, String dateStr2, String originalFullText) {
        DateDescriptor d1 = parseSingleDate(dateStr1, DateQualifier.EXACT, dateStr1);
        DateDescriptor d2 = parseSingleDate(dateStr2, DateQualifier.EXACT, dateStr2);

        if (d1.getDateType() == DateType.FREE_TEXT || d2.getDateType() == DateType.FREE_TEXT) {
            return createFreeTextDescriptor(originalFullText);
        }

        DateDescriptor range = new DateDescriptor();
        range.setDateType(DateType.RANGE);

        range.setStartQualifier(DateQualifier.EXACT);
        range.setStartYear(d1.getStartYear());
        range.setStartMonth(d1.getStartMonth());
        range.setStartDay(d1.getStartDay());

        range.setEndQualifier(DateQualifier.EXACT);
        range.setEndYear(d2.getStartYear());
        range.setEndMonth(d2.getStartMonth());
        range.setEndDay(d2.getStartDay());

        range.setSortDateTimeMin(d1.getSortDateTimeMin());
        range.setSortDateTimeMax(d2.getSortDateTimeMax());

        return range;
    }

    private DateDescriptor parseSingleDate(String dateStr, DateQualifier qualifier, String originalTextFallback) {
        DateDescriptor dd = new DateDescriptor();
        Matcher matcher = DATE_PATTERN.matcher(dateStr);

        if (matcher.matches()) {
            dd.setDateType(DateType.SINGLE);
            dd.setStartQualifier(qualifier);

            String dayGroup = matcher.group(1);
            String monthGroup = matcher.group(2);
            String yearGroup = matcher.group(3);

            if (dayGroup != null) {
                dd.setStartDay(Integer.parseInt(dayGroup.trim()));
            }
            if (monthGroup != null) {
                dd.setStartMonth(MONTHS.get(monthGroup.trim()));
            }
            if (yearGroup != null) {
                dd.setStartYear(Integer.parseInt(yearGroup));
            }

            calculateSortDates(dd);
            return dd;
        }

        return createFreeTextDescriptor(originalTextFallback);
    }

    private void calculateSortDates(DateDescriptor dd) {
        Integer y = dd.getStartYear();
        Integer m = dd.getStartMonth();
        Integer d = dd.getStartDay();

        if (y == null) return;

        LocalDateTime min;
        LocalDateTime max;

        if (m != null && d != null) {
            // Full Date
            min = LocalDateTime.of(y, m, d, 0, 0);
            max = LocalDateTime.of(y, m, d, 23, 59);
        } else if (m != null) {
            // Month Year
            min = LocalDateTime.of(y, m, 1, 0, 0);
            int lastDay = YearMonth.of(y, m).lengthOfMonth();
            max = LocalDateTime.of(y, m, lastDay, 23, 59);
        } else {
            // Year Only
            min = LocalDateTime.of(y, 1, 1, 0, 0);
            max = LocalDateTime.of(y, 12, 31, 23, 59);
        }

        dd.setSortDateTimeMin(min);
        dd.setSortDateTimeMax(max);
    }

    public static class DateParseResult {
        private final DateDescriptor start;
        private final DateDescriptor end;

        public DateParseResult(DateDescriptor start) {
            this(start, null);
        }

        public DateParseResult(DateDescriptor start, DateDescriptor end) {
            this.start = start;
            this.end = end;
        }

        public DateDescriptor getStartDate() { return start; }
        public DateDescriptor getEndDate() { return end; }
        public boolean isRange() { return end != null; }
    }
}