package com.musmike.familyheritage.service;

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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MediaMetadataExtractor {

    private static final Pattern EXIF_DATE_TIME_PATTERN = Pattern.compile(
            "(\\d{4})[:\\-/](\\d{2})[:\\-/](\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})"
    );

    private static final int TAG_DATE_TIME_ORIGINAL = 0x9003;
    private static final int TAG_DATE_TIME_DIGITIZED = 0x9004;
    private static final int TAG_DATE_TIME_MODIFY = 0x0132;
    private static final int TAG_EXIF_IFD_POINTER = 0x8769;

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
    }

    public ExtractedMetadata extract(byte[] fileBytes, String mimeType, Long clientLastModifiedMs) {
        if (fileBytes != null && fileBytes.length > 12) {
            // 1. Try JPEG EXIF parser (exact TIFF IFD traversal + ASCII scan fallback)
            if (isJpeg(fileBytes) || (mimeType != null && mimeType.toLowerCase().contains("jpeg"))) {
                ExtractedMetadata jpegExif = extractFromJpegExif(fileBytes);
                if (jpegExif != null) {
                    return jpegExif;
                }
            }

            // 2. Try MP4 / QuickTime mvhd creation_time
            if (mimeType != null && (mimeType.toLowerCase().contains("mp4") || mimeType.toLowerCase().contains("quicktime"))) {
                ExtractedMetadata mp4Meta = extractFromMp4Mvhd(fileBytes);
                if (mp4Meta != null) {
                    return mp4Meta;
                }
            }

            // 3. Generic embedded ASCII EXIF timestamp scan in header (up to first 64 KB)
            ExtractedMetadata headerScan = scanHeaderForExifDateString(fileBytes);
            if (headerScan != null) {
                return headerScan;
            }
        }

        // 4. Fallback to client file lastModified timestamp if provided
        if (clientLastModifiedMs != null && clientLastModifiedMs > 0) {
            LocalDateTime ldt = LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(clientLastModifiedMs),
                    ZoneId.systemDefault()
            );
            return new ExtractedMetadata(
                    ldt.getYear(),
                    ldt.getMonthValue(),
                    ldt.getDayOfMonth(),
                    ldt.getHour(),
                    ldt.getMinute(),
                    ldt.getSecond(),
                    "Plik: Data modyfikacji (lastModified)"
            );
        }

        return null;
    }

    private boolean isJpeg(byte[] bytes) {
        return (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8;
    }

    private ExtractedMetadata extractFromJpegExif(byte[] bytes) {
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

            // APP1 marker (0xE1) starting with "Exif\0\0"
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
                    ExtractedMetadata parsed = parseTiffExifSegment(bytes, tiffStart, tiffLength);
                    if (parsed != null) {
                        return parsed;
                    }
                }
            }
            offset += 2 + segmentLength;
        }
        return null;
    }

    private ExtractedMetadata parseTiffExifSegment(byte[] bytes, int tiffStart, int tiffLength) {
        if (tiffStart + 8 > bytes.length || tiffLength < 8) {
            return null;
        }
        ByteOrder byteOrder;
        if (bytes[tiffStart] == 'I' && bytes[tiffStart + 1] == 'I') {
            byteOrder = ByteOrder.LITTLE_ENDIAN;
        } else if (bytes[tiffStart] == 'M' && bytes[tiffStart + 1] == 'M') {
            byteOrder = ByteOrder.BIG_ENDIAN;
        } else {
            return null;
        }

        ByteBuffer buf = ByteBuffer.wrap(bytes, tiffStart, Math.min(tiffLength, bytes.length - tiffStart));
        buf.order(byteOrder);

        int firstIfdOffset = buf.getInt(4);
        if (firstIfdOffset < 8 || firstIfdOffset + 2 > buf.limit()) {
            return null;
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
                }
            }
        }

        if (dateTimeOriginal != null) {
            ExtractedMetadata m = parseExifTimestamp(
                    dateTimeOriginal,
                    "EXIF: DateTimeOriginal (Data wykonania zdjęcia)"
            );
            if (m != null) return m;
        }
        if (dateTimeDigitized != null) {
            ExtractedMetadata m = parseExifTimestamp(
                    dateTimeDigitized,
                    "EXIF: DateTimeDigitized (Data digitalizacji)"
            );
            if (m != null) return m;
        }
        if (dateTimeModify != null) {
            return parseExifTimestamp(
                    dateTimeModify,
                    "EXIF: DateTime (Data zapisu w urządzeniu)"
            );
        }
        return null;
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
        return parseExifTimestamp(headerAscii, "EXIF / XMP: Data osadzona w nagłówku pliku");
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
                // Seconds between 1904-01-01 and 1970-01-01 is 2082844800L
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