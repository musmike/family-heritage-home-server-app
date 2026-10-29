package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.ActivityActionType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "activity_logs")
@Getter
@Setter
@NoArgsConstructor
public class ActivityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 50)
    private ActivityActionType actionType;

    @Column(name = "actor_username", nullable = false)
    private String actorUsername;

    @Column(nullable = false, length = 500)
    private String description;

    @Column(name = "target_type", length = 50)
    private String targetType;

    @Column(name = "target_id")
    private Long targetId;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "admin_only", nullable = false)
    private Boolean adminOnly = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}