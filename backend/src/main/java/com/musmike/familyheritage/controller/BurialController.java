package com.musmike.familyheritage.controller;

import com.musmike.familyheritage.dto.BurialsOverviewDto;
import com.musmike.familyheritage.model.enums.PersonSex;
import com.musmike.familyheritage.service.BurialService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/burials")
@RequiredArgsConstructor
public class BurialController {

    private final BurialService burialService;

    @GetMapping
    public ResponseEntity<BurialsOverviewDto> getBurialsOverview(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "sex", required = false) PersonSex sex,
            @RequestParam(name = "includeNonCurrent", defaultValue = "false") boolean includeNonCurrent,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "sortBy", defaultValue = "SURNAME_ASC") String sortBy
    ) {
        boolean isGuest = isCurrentUserGuestOnly();
        return ResponseEntity.ok(
                burialService.getBurialsOverview(search, sex, includeNonCurrent, includeArchived, sortBy, isGuest)
        );
    }

    private boolean isCurrentUserGuestOnly() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) {
            return true;
        }
        Set<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.replaceFirst("^ROLE_", "").toUpperCase())
                .collect(Collectors.toSet());
        return !roles.contains("ADMIN") && !roles.contains("PRIVILEGED_GUEST");
    }
}