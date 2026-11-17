package com.musmike.familyheritage.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI familyHeritageOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Family Heritage API")
                .description("REST API of the Family Heritage Home Server App. "
                        + "Log in with POST /auth/login first; the session cookies are then used automatically.")
                .version("v0.1.0-alpha"));
    }
}