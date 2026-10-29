package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long> {
}