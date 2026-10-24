package com.musmike.familyheritage.integration.repository;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.UserCode;
import com.musmike.familyheritage.repository.UserCodeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class UserCodeRepositoryTest extends AbstractIntegrationTest {
    @Autowired
    private UserCodeRepository userCodeRepository;

    @Test
    void shouldSaveAndRetrieveUserCode() {
        // GIVEN
        UserCode code = new UserCode();
        code.setCategory("EVENT_TYPE");
        code.setCode("TRIP");
        code.setIsSystem(true);

        // WHEN
        userCodeRepository.save(code);

        // THEN
        Optional<UserCode> found = userCodeRepository.findByCategoryAndCode("EVENT_TYPE", "TRIP");
        assertThat(found).isPresent();
        assertThat(found.get().getCode()).isEqualTo("TRIP");
        assertThat(found.get().getIsSystem()).isTrue();
    }

    @Test
    void shouldThrowExceptionWhenSavingDuplicateCategoryAndCode() {
        // GIVEN
        UserCode code1 = new UserCode();
        code1.setCategory("TEST_CAT");
        code1.setCode("DUPLICATE");
        userCodeRepository.save(code1);

        UserCode code2 = new UserCode();
        code2.setCategory("TEST_CAT");
        code2.setCode("DUPLICATE");

        // WHEN & THEN
        assertThrows(DataIntegrityViolationException.class, () -> {
            userCodeRepository.save(code2);
            userCodeRepository.flush();
        });
    }
}
