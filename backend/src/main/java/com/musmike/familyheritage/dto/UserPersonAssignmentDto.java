package com.musmike.familyheritage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPersonAssignmentDto {
    private Long userId;
    private String username;
    private String role;
    private Long personId;
    private String personGivenName;
    private String personSurname;
}