package com.musmike.familyheritage.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributeView;
import java.nio.file.attribute.FileTime;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.Locale;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class MediaStorageService {

    private static final int THUMBNAIL_MAX_DIM = 420;

    private final MediaMetadataExtractor metadataExtractor;

    @Value("${app.media.root-path:./local_media}")
    private String mediaRootPath;

    public Path getRootDirectory() {
        return Paths.get(mediaRootPath).toAbsolutePath().normalize();
    }

    public Path resolveMediaFilePath(String relativePath) {
        Path root = getRootDirectory();
        Path resolved = root.resolve(relativePath).normalize();
        if (!resolved.startsWith(root)) {
            throw new IllegalArgumentException("Invalid relative media path.");
        }
        return resolved;
    }

    public Path resolveThumbnailPath(Long mediaId) {
        return getRootDirectory().resolve(".thumbnails").resolve("thumb_v2_" + mediaId + ".jpg");
    }

    public void ensureThumbnailGenerated(Long mediaId, String relativePath) {
        if (mediaId == null || relativePath == null || relativePath.isBlank()) {
            return;
        }
        Path thumbPath = resolveThumbnailPath(mediaId);
        if (Files.exists(thumbPath)) {
            return;
        }
        byte[] bytes = readFileBytesIfExists(relativePath);
        if (bytes != null) {
            generateThumbnailIfPossible(mediaId, bytes);
        }
    }

    public String toSnakeCase(String input) {
        if (input == null || input.isBlank()) {
            return "unnamed";
        }
        String lower = input.trim().toLowerCase(Locale.ROOT)
                .replace('ł', 'l')
                .replace('đ', 'd')
                .replace('ß', 's');
        String decomposed = Normalizer.normalize(lower, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        String cleaned = decomposed
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        return cleaned.isEmpty() ? "unnamed" : cleaned;
    }

    public String sanitizeFileName(String rawBaseName, String extension) {
        String ext = extension != null ? extension.trim().toLowerCase(Locale.ROOT).replaceFirst("^\\.", "") : "jpg";
        if (ext.isEmpty()) {
            ext = "jpg";
        }

        String candidate = rawBaseName != null ? rawBaseName.trim() : "";
        if (candidate.toLowerCase(Locale.ROOT).endsWith("." + ext)) {
            candidate = candidate.substring(0, candidate.length() - ext.length() - 1);
        }
        String snakeBase = toSnakeCase(candidate);
        return snakeBase + "." + ext;
    }

    public String extractExtension(String originalFilename, String mimeType) {
        if (originalFilename != null && originalFilename.contains(".")) {
            String ext = originalFilename.substring(originalFilename.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
            if (!ext.isEmpty() && ext.length() <= 5) {
                return ext;
            }
        }
        if (mimeType != null) {
            if (mimeType.contains("png")) return "png";
            if (mimeType.contains("webp")) return "webp";
            if (mimeType.contains("gif")) return "gif";
            if (mimeType.contains("mp4")) return "mp4";
            if (mimeType.contains("webm")) return "webm";
            if (mimeType.contains("quicktime")) return "mov";
        }
        return "jpg";
    }

    public void saveFileAndThumbnail(String relativePath, Long mediaId, byte[] fileBytes, boolean isImage) {
        saveFileAndThumbnail(relativePath, mediaId, fileBytes, isImage, null);
    }

    public void saveFileAndThumbnail(
            String relativePath,
            Long mediaId,
            byte[] fileBytes,
            boolean isImage,
            Long originalFileTimestampMs
    ) {
        try {
            Path targetPath = resolveMediaFilePath(relativePath);
            Files.createDirectories(targetPath.getParent());
            // Write exact 1:1 original bytes without modifying pixels or metadata
            Files.write(targetPath, fileBytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

            // Preserve original file system timestamps (modified, accessed, created) if provided
            if (originalFileTimestampMs != null && originalFileTimestampMs > 0) {
                try {
                    FileTime ft = FileTime.fromMillis(originalFileTimestampMs);
                    BasicFileAttributeView attrView = Files.getFileAttributeView(targetPath, BasicFileAttributeView.class);
                    if (attrView != null) {
                        attrView.setTimes(ft, ft, ft);
                    } else {
                        Files.setLastModifiedTime(targetPath, ft);
                    }
                } catch (IOException ignored) {
                    // Ignore if underlying filesystem does not support setting all 3 timestamps
                }
            }

            if (isImage) {
                generateThumbnailIfPossible(mediaId, fileBytes);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write media file to disk: " + relativePath, e);
        }
    }

    public byte[] readFileBytesIfExists(String relativePath) {
        try {
            Path path = resolveMediaFilePath(relativePath);
            if (Files.exists(path)) {
                long size = Files.size(path);
                // Never attempt to read files larger than 50 MB into a single byte array
                if (size > 50L * 1024 * 1024) {
                    return null;
                }
                return Files.readAllBytes(path);
            }
        } catch (IOException ignored) {}
        return null;
    }

    public String renameFileInSameDirectory(String currentRelativePath, String newFileName) {
        Path currentFile = resolveMediaFilePath(currentRelativePath);
        Path parentDir = currentFile.getParent();
        Path targetFile = parentDir.resolve(newFileName).normalize();

        if (!targetFile.startsWith(getRootDirectory())) {
            throw new IllegalArgumentException("Invalid target file name.");
        }
        if (currentFile.equals(targetFile)) {
            return currentRelativePath;
        }
        if (Files.exists(targetFile)) {
            throw new IllegalArgumentException("Plik o tej nazwie już istnieje w tym folderze: " + newFileName);
        }

        try {
            if (Files.exists(currentFile)) {
                Files.move(currentFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
            }
            return getRootDirectory().relativize(targetFile).toString().replace('\\', '/');
        } catch (IOException e) {
            throw new IllegalStateException("Failed to rename media file on disk.", e);
        }
    }

    public String moveFileToRelativePath(String currentRelativePath, String targetRelativePath) {
        Path currentFile = resolveMediaFilePath(currentRelativePath);
        Path targetFile = resolveMediaFilePath(targetRelativePath);

        if (currentFile.equals(targetFile)) {
            return currentRelativePath;
        }
        if (Files.exists(targetFile)) {
            throw new IllegalArgumentException("Plik docelowy już istnieje: " + targetRelativePath);
        }

        try {
            Files.createDirectories(targetFile.getParent());
            if (Files.exists(currentFile)) {
                Files.move(currentFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
                cleanUpEmptyParentDirectories(currentFile.getParent());
            }
            return getRootDirectory().relativize(targetFile).toString().replace('\\', '/');
        } catch (IOException e) {
            throw new IllegalStateException("Failed to move media file on disk.", e);
        }
    }

    private void cleanUpEmptyParentDirectories(Path dir) {
        Path root = getRootDirectory();
        Path cursor = dir;
        while (cursor != null && !cursor.equals(root) && cursor.startsWith(root)) {
            try (Stream<Path> entries = Files.list(cursor)) {
                if (entries.findAny().isEmpty()) {
                    Files.deleteIfExists(cursor);
                    cursor = cursor.getParent();
                } else {
                    break;
                }
            } catch (IOException e) {
                break;
            }
        }
    }

    public void deleteFileAndThumbnail(String relativePath, Long mediaId) {
        try {
            if (relativePath != null && !relativePath.isBlank()) {
                Path file = resolveMediaFilePath(relativePath);
                Files.deleteIfExists(file);
                cleanUpEmptyParentDirectories(file.getParent());
            }
            if (mediaId != null) {
                Path thumb = resolveThumbnailPath(mediaId);
                Files.deleteIfExists(thumb);
            }
        } catch (IOException ignored) {
        }
    }

    public void deleteDirectoryRecursively(String relativeDirPath) {
        if (relativeDirPath == null || relativeDirPath.isBlank()) {
            return;
        }
        try {
            Path dirPath = resolveMediaFilePath(relativeDirPath);
            if (Files.exists(dirPath)) {
                try (Stream<Path> walk = Files.walk(dirPath)) {
                    walk.sorted(Comparator.reverseOrder())
                            .forEach(p -> {
                                try {
                                    Files.deleteIfExists(p);
                                } catch (IOException ignored) {
                                }
                            });
                }
                cleanUpEmptyParentDirectories(dirPath.getParent());
            }
        } catch (Exception ignored) {
        }
    }

    public void deleteAllMediaFilesOnDisk() {
        Path root = getRootDirectory();
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder())
                    .filter(p -> !p.equals(root))
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                        }
                    });
        } catch (IOException ignored) {
        }
    }

    private void generateThumbnailIfPossible(Long mediaId, byte[] imageBytes) {
        try {
            BufferedImage original = ImageIO.read(new ByteArrayInputStream(imageBytes));
            if (original == null) {
                return;
            }
            int orientation = metadataExtractor != null
                    ? metadataExtractor.extractExifOrientation(imageBytes)
                    : 1;
            BufferedImage oriented = applyExifOrientation(original, orientation);

            int origW = oriented.getWidth();
            int origH = oriented.getHeight();
            if (origW <= 0 || origH <= 0) {
                return;
            }

            double scale = Math.min(1.0, (double) THUMBNAIL_MAX_DIM / Math.max(origW, origH));
            int targetW = Math.max(1, (int) Math.round(origW * scale));
            int targetH = Math.max(1, (int) Math.round(origH * scale));

            BufferedImage thumb = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
            Graphics2D g2d = thumb.createGraphics();
            g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2d.setColor(Color.WHITE);
            g2d.fillRect(0, 0, targetW, targetH);
            g2d.drawImage(oriented, 0, 0, targetW, targetH, null);
            g2d.dispose();

            Path thumbPath = resolveThumbnailPath(mediaId);
            Files.createDirectories(thumbPath.getParent());
            ImageIO.write(thumb, "jpg", thumbPath.toFile());
        } catch (Exception ignored) {
            // Fallback to original image when thumbnail generation is unsupported for format
        }
    }

    private BufferedImage applyExifOrientation(BufferedImage src, int orientation) {
        if (orientation <= 1 || orientation > 8) {
            return src;
        }
        int w = src.getWidth();
        int h = src.getHeight();
        boolean swapDimensions = (orientation >= 5 && orientation <= 8);
        int dstW = swapDimensions ? h : w;
        int dstH = swapDimensions ? w : h;

        BufferedImage dst = new BufferedImage(dstW, dstH, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = src.getRGB(x, y);
                int nx = x;
                int ny = y;
                switch (orientation) {
                    case 2 -> {
                        nx = w - 1 - x;
                        ny = y;
                    }
                    case 3 -> {
                        nx = w - 1 - x;
                        ny = h - 1 - y;
                    }
                    case 4 -> {
                        nx = x;
                        ny = h - 1 - y;
                    }
                    case 5 -> {
                        nx = y;
                        ny = x;
                    }
                    case 6 -> {
                        // Rotate 90 degrees CW to correct standard phone portrait orientation
                        nx = h - 1 - y;
                        ny = x;
                    }
                    case 7 -> {
                        nx = h - 1 - y;
                        ny = w - 1 - x;
                    }
                    case 8 -> {
                        // Rotate 270 degrees CW (90 CCW) to correct inverted phone portrait orientation
                        nx = y;
                        ny = w - 1 - x;
                    }
                    default -> {
                    }
                }
                dst.setRGB(nx, ny, rgb);
            }
        }
        return dst;
    }

    public void saveStreamAndThumbnail(
            String relativePath,
            Long mediaId,
            java.io.InputStream inputStream,
            boolean isImage,
            Long originalFileTimestampMs
    ) {
        try {
            Path targetPath = resolveMediaFilePath(relativePath);
            Files.createDirectories(targetPath.getParent());

            // Stream bytes directly to disk using 8 KB buffer (< 1 MB RAM even for multi-GB videos)
            Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);

            if (originalFileTimestampMs != null && originalFileTimestampMs > 0) {
                try {
                    FileTime ft = FileTime.fromMillis(originalFileTimestampMs);
                    BasicFileAttributeView attrView =
                            Files.getFileAttributeView(targetPath, BasicFileAttributeView.class);
                    if (attrView != null) {
                        attrView.setTimes(ft, ft, ft);
                    } else {
                        Files.setLastModifiedTime(targetPath, ft);
                    }
                } catch (IOException ignored) {
                    // Ignore if underlying filesystem does not support setting all 3 timestamps
                }
            }

            if (isImage) {
                byte[] imageBytes = Files.readAllBytes(targetPath);
                generateThumbnailIfPossible(mediaId, imageBytes);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to stream media file to disk: " + relativePath, e);
        }
    }

    public byte[] readHeaderBytesIfExists(String relativePath, int maxBytes) {
        try {
            Path path = resolveMediaFilePath(relativePath);
            if (Files.exists(path)) {
                try (java.io.InputStream is = Files.newInputStream(path)) {
                    return is.readNBytes(maxBytes);
                }
            }
        } catch (IOException ignored) {}
        return null;
    }
}