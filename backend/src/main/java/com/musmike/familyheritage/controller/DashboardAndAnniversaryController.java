package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.AnniversariesPageDto;
import com.musmike.familyheritage.dto.DashboardStatsDto;
import com.musmike.familyheritage.service.DashboardAndAnniversaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class DashboardAndAnniversaryController {

    private final DashboardAndAnniversaryService dashboardAndAnniversaryService;

    @GetMapping("/dashboard/stats")
    public ResponseEntity<DashboardStatsDto> getDashboardStats() {
        return ResponseEntity.ok(dashboardAndAnniversaryService.getDashboardStats());
    }

    @GetMapping("/anniversaries")
    public ResponseEntity<AnniversariesPageDto> getAnniversaries(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "types", required = false) String typesParam,
            @RequestParam(name = "month", required = false) Integer month,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "sortBy", defaultValue = "UPCOMING") String sortBy,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "30") int size
    ) {
        List<String> types = (typesParam == null || typesParam.isBlank())
                ? List.of()
                : Arrays.asList(typesParam.split(","));

        return ResponseEntity.ok(
                dashboardAndAnniversaryService.getAnniversaries(
                        search, types, month, includeArchived, sortBy, page, size
                )
        );
    }
}