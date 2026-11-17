package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.MetadataDateOptionDto;
import com.musmike.familyheritage.model.DateDescriptor;
import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MediaMetadataExtractor {

    private static final Pattern EXIF_DATE_TIME_PATTERN = Pattern.compile(
            "(\\d{4})[:\\-/](\\d{2})[:\\-/](\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})"
    );

    private static final int TAG_ORIENTATION = 0x0112;
    private static final int TAG_DATE_TIME_MODIFY = 0x0132;
    private static final int TAG_EXIF_IFD_POINTER = 0x8769;
    private static final int TAG_DATE_TIME_ORIGINAL = 0x9003;
    private static final int TAG_DATE_TIME_DIGITIZED = 0x9004;

    public record ExtractedMetadata(
            Integer year,
            Integer month,
            Integer day,
            Integer hour,
            Integer minute,
            Integer second,
            String sourceTag
    ) {
        public DateDescriptor toDateDescriptor() {
            if (year == null) {
                return null;
            }
            DateDescriptor dd = new DateDescriptor();
            dd.setDateType(DateType.SINGLE);
            dd.setStartQualifier(DateQualifier.EXACT);
            dd.setStartYear(year);
            dd.setStartMonth(month);
            dd.setStartDay(day);
            if (hour != null) {
                dd.setStartTimeQualifier(DateQualifier.EXACT);
                dd.setStartHour(hour);
                dd.setStartMinute(minute);
                dd.setStartSecond(second);
            }
            dd.recalculateSortDates();
            return dd;
        }

        public MetadataDateOptionDto toOptionDto() {
            String datePart = String.format("%02d.%02d.%d", day != null ? day : 1, month != null ? month : 1, year);
            String timePart = hour != null
                    ? String.format(", godz. %02d:%02d:%02d", hour, minute != null ? minute : 0, second != null ? second : 0)
                    : "";
            return MetadataDateOptionDto.builder()
                    .sourceTag(sourceTag)
                    .dateText(datePart + timePart)
                    .year(year)
                    .month(month)
                    .day(day)
                    .hour(hour)
                    .minute(minute)
                    .second(second)
                    .build();
        }
    }

    public ExtractedMetadata extract(byte[] fileBytes, String mimeType, Long clientLastModifiedMs) {
        List<ExtractedMetadata> all = extractAllDates(fileBytes, mimeType, clientLastModifiedMs);
        return all.isEmpty() ? null : all.getFirst();
    }

    public List<ExtractedMetadata> extractAllDates(byte[] fileBytes, String mimeType, Long clientLastModifiedMs) {
        Map<String, ExtractedMetadata> resultsByTag = new LinkedHashMap<>();

        if (fileBytes != null && fileBytes.length > 12) {
            if (isJpeg(fileBytes) || (mimeType != null && mimeType.toLowerCase().contains("jpeg"))) {
                extractAllFromJpegExif(fileBytes, resultsByTag);
            }

            if (mimeType != null && (mimeType.toLowerCase().contains("mp4") || mimeType.toLowerCase().contains("quicktime"))) {
                ExtractedMetadata mp4Meta = extractFromMp4Mvhd(fileBytes);
                if (mp4Meta != null) {
                    resultsByTag.put(mp4Meta.sourceTag(), mp4Meta);
                }
            }

            if (resultsByTag.isEmpty()) {
                ExtractedMetadata headerScan = scanHeaderForExifDateString(fileBytes);
                if (headerScan != null) {
                    resultsByTag.put(headerScan.sourceTag(), headerScan);
                }
            }
        }

        if (clientLastModifiedMs != null && clientLastModifiedMs > 0) {
            LocalDateTime ldt = LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(clientLastModifiedMs),
                    ZoneId.systemDefault()
            );
            String tag = "Plik: Data modyfikacji (lastModified)";
            resultsByTag.put(tag, new ExtractedMetadata(
                    ldt.getYear(),
                    ldt.getMonthValue(),
                    ldt.getDayOfMonth(),
                    ldt.getHour(),
                    ldt.getMinute(),
                    ldt.getSecond(),
                    tag
            ));
        }

        return new ArrayList<>(resultsByTag.values());
    }

    public int extractExifOrientation(byte[] fileBytes) {
        if (fileBytes == null || fileBytes.length <= 14 || !isJpeg(fileBytes)) {
            return 1;
        }
        int offset = 2;
        while (offset + 4 < fileBytes.length) {
            if ((fileBytes[offset] & 0xFF) != 0xFF) {
                break;
            }
            int marker = fileBytes[offset + 1] & 0xFF;
            if (marker == 0xDA || marker == 0xD9) {
                break;
            }
            int segmentLength = ((fileBytes[offset + 2] & 0xFF) << 8) | (fileBytes[offset + 3] & 0xFF);
            if (segmentLength < 2 || offset + 2 + segmentLength > fileBytes.length) {
                break;
            }

            if (marker == 0xE1 && segmentLength >= 14) {
                int exifHeaderPos = offset + 4;
                if (fileBytes[exifHeaderPos] == 'E'
                        && fileBytes[exifHeaderPos + 1] == 'x'
                        && fileBytes[exifHeaderPos + 2] == 'i'
                        && fileBytes[exifHeaderPos + 3] == 'f'
                        && fileBytes[exifHeaderPos + 4] == 0
                        && fileBytes[exifHeaderPos + 5] == 0) {
                    int tiffStart = exifHeaderPos + 6;
                    int tiffLength = segmentLength - 8;
                    int orientation = readOrientationFromTiff(fileBytes, tiffStart, tiffLength);
                    if (orientation >= 1 && orientation <= 8) {
                        return orientation;
                    }
                }
            }
            offset += 2 + segmentLength;
        }
        return 1;
    }

    private int readOrientationFromTiff(byte[] bytes, int tiffStart, int tiffLength) {
        if (tiffStart + 8 > bytes.length || tiffLength < 8) {
            return 1;
        }
        ByteOrder byteOrder;
        if (bytes[tiffStart] == 'I' && bytes[tiffStart + 1] == 'I') {
            byteOrder = ByteOrder.LITTLE_ENDIAN;
        } else if (bytes[tiffStart] == 'M' && bytes[tiffStart + 1] == 'M') {
            byteOrder = ByteOrder.BIG_ENDIAN;
        } else {
            return 1;
        }

        // Slice buffer so absolute offsets inside TIFF header start at index 0
        ByteBuffer buf = ByteBuffer.wrap(bytes, tiffStart, Math.min(tiffLength, bytes.length - tiffStart)).slice();
        buf.order(byteOrder);

        int firstIfdOffset = buf.getInt(4);
        if (firstIfdOffset < 8 || firstIfdOffset + 2 > buf.limit()) {
            return 1;
        }

        int numEntries = buf.getShort(firstIfdOffset) & 0xFFFF;
        int entryBase = firstIfdOffset + 2;
        for (int i = 0; i < numEntries; i++) {
            int pos = entryBase + i * 12;
            if (pos + 12 > buf.limit()) break;

            int tag = buf.getShort(pos) & 0xFFFF;
            if (tag == TAG_ORIENTATION) {
                int type = buf.getShort(pos + 2) & 0xFFFF;
                int val = buf.getShort(pos + 8) & 0xFFFF;
                if (val >= 1 && val <= 8) {
                    return val;
                }
                if (pos + 10 <= buf.limit() - 2) {
                    int valAlt = buf.getShort(pos + 10) & 0xFFFF;
                    if (valAlt >= 1 && valAlt <= 8) {
                        return valAlt;
                    }
                }
                if (type == 4) {
                    int valLong = buf.getInt(pos + 8);
                    if (valLong >= 1 && valLong <= 8) {
                        return valLong;
                    }
                }
            }
        }
        return 1;
    }

    private boolean isJpeg(byte[] bytes) {
        return (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8;
    }

    private void extractAllFromJpegExif(byte[] bytes, Map<String, ExtractedMetadata> target) {
        int offset = 2;
        while (offset + 4 < bytes.length) {
            if ((bytes[offset] & 0xFF) != 0xFF) {
                break;
            }
            int marker = bytes[offset + 1] & 0xFF;
            if (marker == 0xDA || marker == 0xD9) {
                break;
            }
            int segmentLength = ((bytes[offset + 2] & 0xFF) << 8) | (bytes[offset + 3] & 0xFF);
            if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
                break;
            }

            if (marker == 0xE1 && segmentLength >= 14) {
                int exifHeaderPos = offset + 4;
                if (bytes[exifHeaderPos] == 'E'
                        && bytes[exifHeaderPos + 1] == 'x'
                        && bytes[exifHeaderPos + 2] == 'i'
                        && bytes[exifHeaderPos + 3] == 'f'
                        && bytes[exifHeaderPos + 4] == 0
                        && bytes[exifHeaderPos + 5] == 0) {
                    int tiffStart = exifHeaderPos + 6;
                    int tiffLength = segmentLength - 8;
                    parseTiffExifSegment(bytes, tiffStart, tiffLength, target);
                    if (!target.isEmpty()) {
                        return;
                    }
                }
            }
            offset += 2 + segmentLength;
        }
    }

    private void parseTiffExifSegment(
            byte[] bytes,
            int tiffStart,
            int tiffLength,
            Map<String, ExtractedMetadata> target
    ) {
        if (tiffStart + 8 > bytes.length || tiffLength < 8) {
            return;
        }
        ByteOrder byteOrder;
        if (bytes[tiffStart] == 'I' && bytes[tiffStart + 1] == 'I') {
            byteOrder = ByteOrder.LITTLE_ENDIAN;
        } else if (bytes[tiffStart] == 'M' && bytes[tiffStart + 1] == 'M') {
            byteOrder = ByteOrder.BIG_ENDIAN;
        } else {
            return;
        }

        // Slice buffer so absolute offsets inside TIFF header start at index 0
        ByteBuffer buf = ByteBuffer.wrap(bytes, tiffStart, Math.min(tiffLength, bytes.length - tiffStart)).slice();
        buf.order(byteOrder);

        int firstIfdOffset = buf.getInt(4);
        if (firstIfdOffset < 8 || firstIfdOffset + 2 > buf.limit()) {
            return;
        }

        String dateTimeModify = null;
        String dateTimeOriginal = null;
        String dateTimeDigitized = null;
        int exifSubIfdOffset = -1;

        int numEntries = buf.getShort(firstIfdOffset) & 0xFFFF;
        int entryBase = firstIfdOffset + 2;
        for (int i = 0; i < numEntries; i++) {
            int pos = entryBase + i * 12;
            if (pos + 12 > buf.limit()) break;

            int tag = buf.getShort(pos) & 0xFFFF;
            int valueOffset = buf.getInt(pos + 8);

            if (tag == TAG_EXIF_IFD_POINTER) {
                exifSubIfdOffset = valueOffset;
            } else if (tag == TAG_DATE_TIME_MODIFY) {
                dateTimeModify = readAsciiTag(buf, valueOffset, 20);
            } else if (tag == TAG_DATE_TIME_ORIGINAL) {
                dateTimeOriginal = readAsciiTag(buf, valueOffset, 20);
            } else if (tag == TAG_DATE_TIME_DIGITIZED) {
                dateTimeDigitized = readAsciiTag(buf, valueOffset, 20);
            }
        }

        if (exifSubIfdOffset >= 8 && exifSubIfdOffset + 2 <= buf.limit()) {
            int subEntries = buf.getShort(exifSubIfdOffset) & 0xFFFF;
            int subBase = exifSubIfdOffset + 2;
            for (int i = 0; i < subEntries; i++) {
                int pos = subBase + i * 12;
                if (pos + 12 > buf.limit()) break;

                int tag = buf.getShort(pos) & 0xFFFF;
                int valueOffset = buf.getInt(pos + 8);
                if (tag == TAG_DATE_TIME_ORIGINAL) {
                    dateTimeOriginal = readAsciiTag(buf, valueOffset, 20);
                } else if (tag == TAG_DATE_TIME_DIGITIZED) {
                    dateTimeDigitized = readAsciiTag(buf, valueOffset, 20);
                } else if (tag == TAG_DATE_TIME_MODIFY) {
                    dateTimeModify = readAsciiTag(buf, valueOffset, 20);
                }
            }
        }

        if (dateTimeOriginal != null) {
            String label = "EXIF: Original Date Time (DateTimeOriginal – data wykonania)";
            ExtractedMetadata m = parseExifTimestamp(dateTimeOriginal, label);
            if (m != null) {
                target.put(label, m);
            }
        }
        if (dateTimeDigitized != null) {
            String label = "EXIF: Digitized Date Time (DateTimeDigitized – data digitalizacji)";
            ExtractedMetadata m = parseExifTimestamp(dateTimeDigitized, label);
            if (m != null) {
                target.put(label, m);
            }
        }
        if (dateTimeModify != null) {
            String label = "EXIF: Image Date Time (DateTime – data obrazu)";
            ExtractedMetadata m = parseExifTimestamp(dateTimeModify, label);
            if (m != null) {
                target.put(label, m);
            }
        }
    }

    private String readAsciiTag(ByteBuffer buf, int offset, int maxLen) {
        if (offset < 0 || offset >= buf.limit()) {
            return null;
        }
        int len = Math.min(maxLen, buf.limit() - offset);
        byte[] dst = new byte[len];
        for (int i = 0; i < len; i++) {
            dst[i] = buf.get(offset + i);
        }
        return new String(dst, StandardCharsets.US_ASCII).trim();
    }

    private ExtractedMetadata scanHeaderForExifDateString(byte[] bytes) {
        int scanLen = Math.min(bytes.length, 65536);
        String headerAscii = new String(bytes, 0, scanLen, StandardCharsets.ISO_8859_1);
        return parseExifTimestamp(headerAscii, "EXIF: Original Date Time (osadzona w nagłówku)");
    }

    private ExtractedMetadata parseExifTimestamp(String raw, String sourceLabel) {
        Matcher matcher = EXIF_DATE_TIME_PATTERN.matcher(raw);
        if (!matcher.find()) {
            return null;
        }
        int year = Integer.parseInt(matcher.group(1));
        int month = Integer.parseInt(matcher.group(2));
        int day = Integer.parseInt(matcher.group(3));
        int hour = Integer.parseInt(matcher.group(4));
        int minute = Integer.parseInt(matcher.group(5));
        int second = Integer.parseInt(matcher.group(6));

        if (year < 1800 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        return new ExtractedMetadata(year, month, day, hour, minute, second, sourceLabel);
    }

    private ExtractedMetadata extractFromMp4Mvhd(byte[] bytes) {
        int limit = Math.min(bytes.length - 20, 262144);
        for (int i = 0; i < limit; i++) {
            if (bytes[i] == 'm' && bytes[i + 1] == 'v' && bytes[i + 2] == 'h' && bytes[i + 3] == 'd') {
                int version = bytes[i + 4] & 0xFF;
                long secondsSince1904;
                if (version == 0 && i + 12 < bytes.length) {
                    secondsSince1904 = ((long) (bytes[i + 8] & 0xFF) << 24)
                            | ((long) (bytes[i + 9] & 0xFF) << 16)
                            | ((long) (bytes[i + 10] & 0xFF) << 8)
                            | (bytes[i + 11] & 0xFF);
                } else {
                    continue;
                }
                long unixSeconds = secondsSince1904 - 2082844800L;
                if (unixSeconds > 0 && unixSeconds < 4102444800L) {
                    LocalDateTime ldt = LocalDateTime.ofInstant(
                            Instant.ofEpochSecond(unixSeconds),
                            ZoneId.systemDefault()
                    );
                    return new ExtractedMetadata(
                            ldt.getYear(),
                            ldt.getMonthValue(),
                            ldt.getDayOfMonth(),
                            ldt.getHour(),
                            ldt.getMinute(),
                            ldt.getSecond(),
                            "MP4 / QuickTime: creation_time (mvhd)"
                    );
                }
            }
        }
        return null;
    }
}