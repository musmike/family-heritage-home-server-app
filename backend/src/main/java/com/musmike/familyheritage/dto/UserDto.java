package com.musmike.familyheritage.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDto {
    private String username;
    private List<String> roles;
    private Long personId;
    private String personGivenName;
    private String personSurname;

    public UserDto(String username, List<String> roles) {
        this.username = username;
        this.roles = roles;
    }
}