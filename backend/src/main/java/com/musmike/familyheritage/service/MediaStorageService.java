package com.musmike.familyheritage.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.*;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.Locale;
import java.util.stream.Stream;

@Service
public class MediaStorageService {

    private static final int THUMBNAIL_MAX_DIM = 420;

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
        return getRootDirectory().resolve(".thumbnails").resolve("thumb_" + mediaId + ".jpg");
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
        try {
            Path targetPath = resolveMediaFilePath(relativePath);
            Files.createDirectories(targetPath.getParent());
            Files.write(targetPath, fileBytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

            if (isImage) {
                generateThumbnailIfPossible(mediaId, fileBytes);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write media file to disk: " + relativePath, e);
        }
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
                Files.move(currentFile, targetFile, StandardCopyOption.ATOMIC_MOVE);
            }
            return getRootDirectory().relativize(targetFile).toString().replace('\\', '/');
        } catch (IOException e) {
            throw new IllegalStateException("Failed to rename media file on disk.", e);
        }
    }

    public void deleteFileAndThumbnail(String relativePath, Long mediaId) {
        try {
            if (relativePath != null && !relativePath.isBlank()) {
                Path file = resolveMediaFilePath(relativePath);
                Files.deleteIfExists(file);
            }
            if (mediaId != null) {
                Path thumb = resolveThumbnailPath(mediaId);
                Files.deleteIfExists(thumb);
            }
        } catch (IOException ignored) {
            // Ignore cleanup errors for missing files
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
            int origW = original.getWidth();
            int origH = original.getHeight();
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
            g2d.drawImage(original, 0, 0, targetW, targetH, null);
            g2d.dispose();

            Path thumbPath = resolveThumbnailPath(mediaId);
            Files.createDirectories(thumbPath.getParent());
            ImageIO.write(thumb, "jpg", thumbPath.toFile());
        } catch (Exception ignored) {
            // Fallback to original image when thumbnail generation is unsupported for format
        }
    }
}