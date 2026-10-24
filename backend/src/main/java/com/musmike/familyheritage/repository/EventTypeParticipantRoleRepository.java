package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.EventTypeParticipantRole;
import com.musmike.familyheritage.model.UserCode;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface EventTypeParticipantRoleRepository extends JpaRepository<EventTypeParticipantRole, Long> {
    Optional<EventTypeParticipantRole> findByEventTypeAndParticipantRole(UserCode eventType, UserCode participantRole);
}