package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.UserCode;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserCodeRepository extends JpaRepository<UserCode, Long> {
    Optional<UserCode> findByCategoryAndCode(String category, String code);
}