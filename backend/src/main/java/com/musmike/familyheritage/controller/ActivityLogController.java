package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.ActivityLogPageDto;
import com.musmike.familyheritage.service.ActivityLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/activities")
@RequiredArgsConstructor
public class ActivityLogController {

    private final ActivityLogService activityLogService;

    @GetMapping
    public ResponseEntity<ActivityLogPageDto> getActivities(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "types", required = false) String typesParam,
            @RequestParam(name = "actor", required = false) String actor,
            @RequestParam(name = "dateFrom", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(name = "dateTo", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(name = "sortOrder", defaultValue = "DESC") String sortOrder,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "30") int size
    ) {
        List<String> types = (typesParam == null || typesParam.isBlank())
                ? List.of()
                : Arrays.asList(typesParam.split(","));

        return ResponseEntity.ok(
                activityLogService.getActivities(
                        search, types, actor, dateFrom, dateTo, sortOrder, page, size, isCurrentUserAdmin()
                )
        );
    }

    private boolean isCurrentUserAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) {
            return false;
        }
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.replaceFirst("^ROLE_", "").toUpperCase())
                .anyMatch("ADMIN"::equals);
    }
}