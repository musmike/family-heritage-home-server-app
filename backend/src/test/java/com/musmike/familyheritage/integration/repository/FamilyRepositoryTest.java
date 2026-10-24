package com.musmike.familyheritage.integration.repository;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Family;
import com.musmike.familyheritage.model.FamilyExternalId;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.UserCode;
import com.musmike.familyheritage.model.enums.CodeCategory;
import com.musmike.familyheritage.model.enums.FamilyStatus;
import com.musmike.familyheritage.repository.FamilyRepository;
import com.musmike.familyheritage.repository.PersonRepository;
import com.musmike.familyheritage.repository.UserCodeRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class FamilyRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private FamilyRepository familyRepository;

    @Autowired
    private PersonRepository personRepository;

    @Autowired
    private UserCodeRepository userCodeRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    @Transactional
    void shouldSaveAndFindFamilyByMultipleExternalUids() {
        // GIVEN
        Person husband = new Person();
        husband.setCachedGivenName("Jan");
        husband = personRepository.saveAndFlush(husband);

        UserCode marriedStatus = userCodeRepository
                .findByCategoryAndCode(CodeCategory.FAMILY_STATUS.name(), FamilyStatus.MARRIED.name())
                .orElseThrow();

        Family family = new Family();
        family.setHusband(husband);
        family.setStatus(marriedStatus);
        family.addExternalId("fam-uid-mh-1", "MYHERITAGE");
        family.addExternalId("fam-uid-ftb-2", "FTB");

        familyRepository.saveAndFlush(family);
        entityManager.clear();

        // WHEN
        Optional<Family> foundByMh = familyRepository.findByExternalIdsUidValue("fam-uid-mh-1");
        Optional<Family> foundByFtb = familyRepository.findByExternalIdsUidValue("fam-uid-ftb-2");

        // THEN
        assertThat(foundByMh).isPresent();
        assertThat(foundByFtb).isPresent();
        assertThat(foundByMh.get().getId()).isEqualTo(foundByFtb.get().getId());
        assertThat(foundByMh.get().getExternalIds())
                .extracting(FamilyExternalId::getUidValue)
                .containsExactlyInAnyOrder("fam-uid-mh-1", "fam-uid-ftb-2");
    }
}