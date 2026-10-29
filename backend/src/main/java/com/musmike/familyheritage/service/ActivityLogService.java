package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.ActivityLogItemDto;
import com.musmike.familyheritage.dto.ActivityLogPageDto;
import com.musmike.familyheritage.dto.ActivityTypeOptionDto;
import com.musmike.familyheritage.model.ActivityLog;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.User;
import com.musmike.familyheritage.model.enums.ActivityActionType;
import com.musmike.familyheritage.repository.ActivityLogRepository;
import com.musmike.familyheritage.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ActivityLogService {

    private final ActivityLogRepository activityLogRepository;
    private final UserRepository userRepository;

    @Transactional
    public void logActivity(
            ActivityActionType actionType,
            String description,
            String targetType,
            Long targetId
    ) {
        logActivityWithActorAndIp(actionType, resolveCurrentUsername(), description, targetType, targetId, null);
    }

    @Transactional
    public void logUserLogin(String username, HttpServletRequest request) {
        String ip = extractClientIp(request);
        String desc = ip != null
                ? "Zalogowano do aplikacji (IP: " + ip + ")"
                : "Zalogowano do aplikacji";
        logActivityWithActorAndIp(ActivityActionType.USER_LOGIN, username, desc, "USER", null, ip);
    }

    @Transactional
    public void logActivityWithActorAndIp(
            ActivityActionType actionType,
            String actorUsername,
            String description,
            String targetType,
            Long targetId,
            String ipAddress
    ) {
        ActivityLog logEntry = new ActivityLog();
        logEntry.setActionType(actionType);
        logEntry.setActorUsername(actorUsername != null && !actorUsername.isBlank() ? actorUsername : "system");
        logEntry.setDescription(description);
        logEntry.setTargetType(targetType);
        logEntry.setTargetId(targetId);
        logEntry.setIpAddress(ipAddress);
        logEntry.setAdminOnly(actionType.isAdminOnly());
        logEntry.setCreatedAt(LocalDateTime.now());
        activityLogRepository.save(logEntry);
    }

    @Transactional
    public ActivityLogPageDto getActivities(
            String search,
            List<String> types,
            String actor,
            LocalDate dateFrom,
            LocalDate dateTo,
            String sortOrder,
            int page,
            int size,
            boolean isAdmin
    ) {
        Map<String, String> actorDisplayMap = buildActorDisplayMap();

        List<ActivityTypeOptionDto> availableTypes = Arrays.stream(ActivityActionType.values())
                .filter(t -> isAdmin || !t.isAdminOnly())
                .map(t -> ActivityTypeOptionDto.builder()
                        .code(t.name())
                        .label(t.getLabel())
                        .adminOnly(t.isAdminOnly())
                        .build())
                .toList();

        Set<String> selectedTypes = (types == null || types.isEmpty())
                ? Set.of()
                : types.stream()
                .filter(Objects::nonNull)
                .map(s -> s.trim().toUpperCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());

        String normSearch = search != null ? search.trim().toLowerCase() : "";
        String normActor = (actor != null && !actor.isBlank() && !"ALL".equalsIgnoreCase(actor))
                ? actor.trim().toLowerCase()
                : "";
        boolean ascending = "ASC".equalsIgnoreCase(sortOrder);

        List<ActivityLog> allLogs = activityLogRepository.findAll();

        List<String> availableActors = allLogs.stream()
                .filter(l -> isAdmin || !Boolean.TRUE.equals(l.getAdminOnly()))
                .map(ActivityLog::getActorUsername)
                .filter(Objects::nonNull)
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        Comparator<ActivityLog> comp = Comparator
                .comparing(ActivityLog::getCreatedAt)
                .thenComparing(ActivityLog::getId);
        if (!ascending) {
            comp = comp.reversed();
        }

        List<ActivityLogItemDto> filtered = allLogs.stream()
                .filter(l -> isAdmin || !Boolean.TRUE.equals(l.getAdminOnly()))
                .filter(l -> selectedTypes.isEmpty() || selectedTypes.contains(l.getActionType().name()))
                .filter(l -> normActor.isEmpty() || l.getActorUsername().toLowerCase().equals(normActor))
                .filter(l -> dateFrom == null || !l.getCreatedAt().toLocalDate().isBefore(dateFrom))
                .filter(l -> dateTo == null || !l.getCreatedAt().toLocalDate().isAfter(dateTo))
                .sorted(comp)
                .map(l -> toDto(l, actorDisplayMap))
                .filter(dto -> matchesSearch(dto, normSearch))
                .toList();

        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        int totalElements = filtered.size();
        int totalPages = (int) Math.ceil((double) totalElements / safeSize);

        int fromIndex = Math.min(safePage * safeSize, totalElements);
        int toIndex = Math.min(fromIndex + safeSize, totalElements);
        List<ActivityLogItemDto> pageContent = filtered.subList(fromIndex, toIndex);

        return ActivityLogPageDto.builder()
                .content(pageContent)
                .page(safePage)
                .size(safeSize)
                .totalElements(totalElements)
                .totalPages(totalPages)
                .availableTypes(availableTypes)
                .availableActors(availableActors)
                .build();
    }

    private ActivityLogItemDto toDto(ActivityLog logEntry, Map<String, String> actorDisplayMap) {
        String username = logEntry.getActorUsername();
        String displayName = actorDisplayMap.getOrDefault(username, username);

        return ActivityLogItemDto.builder()
                .id(logEntry.getId())
                .actionType(logEntry.getActionType().name())
                .actionLabel(logEntry.getActionType().getLabel())
                .actorUsername(username)
                .actorDisplayName(displayName)
                .description(logEntry.getDescription())
                .targetType(logEntry.getTargetType())
                .targetId(logEntry.getTargetId())
                .ipAddress(logEntry.getIpAddress())
                .adminOnly(Boolean.TRUE.equals(logEntry.getAdminOnly()))
                .createdAt(logEntry.getCreatedAt())
                .build();
    }

    private Map<String, String> buildActorDisplayMap() {
        Map<String, String> map = new HashMap<>();
        for (User u : userRepository.findAll()) {
            Person p = u.getPerson();
            if (p != null) {
                String fullName = ((p.getCachedSurname() != null ? p.getCachedSurname() : "") + " "
                        + (p.getCachedGivenName() != null ? p.getCachedGivenName() : "")).trim();
                if (!fullName.isEmpty()) {
                    map.put(u.getUsername(), fullName + " (" + u.getUsername() + ")");
                    continue;
                }
            }
            map.put(u.getUsername(), u.getUsername());
        }
        return map;
    }

    private boolean matchesSearch(ActivityLogItemDto dto, String normSearch) {
        if (normSearch.isEmpty()) return true;
        String combined = ((dto.getDescription() != null ? dto.getDescription() : "") + " "
                + (dto.getActionLabel() != null ? dto.getActionLabel() : "") + " "
                + (dto.getActorDisplayName() != null ? dto.getActorDisplayName() : "") + " "
                + (dto.getIpAddress() != null ? dto.getIpAddress() : "")).toLowerCase();
        return combined.contains(normSearch);
    }

    private String resolveCurrentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
            return auth.getName();
        }
        return "system";
    }

    private String extractClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}