package com.musmike.familyheritage.integration.repository;

import com.musmike.familyheritage.integration.AbstractIntegrationTest;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.model.PersonExternalId;
import com.musmike.familyheritage.model.PersonGedcomData;
import com.musmike.familyheritage.repository.PersonRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PersonRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private PersonRepository personRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    @Transactional
    void shouldSaveAndFindPersonByMultipleExternalUidsFromDifferentSources() {
        // GIVEN
        Person person = new Person();
        person.setCachedGivenName("Jan");
        person.setCachedSurname("Kowalski");
        person.addExternalId("uid-myheritage-123", "MYHERITAGE");
        person.addExternalId("uid-gramps-456", "GRAMPS");

        personRepository.saveAndFlush(person);
        entityManager.clear();

        // WHEN
        Optional<Person> foundByMyHeritage = personRepository.findByExternalIdsUidValue("uid-myheritage-123");
        Optional<Person> foundByGramps = personRepository.findByExternalIdsUidValue("uid-gramps-456");
        Optional<Person> notFound = personRepository.findByExternalIdsUidValue("uid-unknown-999");

        // THEN
        assertThat(foundByMyHeritage).isPresent();
        assertThat(foundByGramps).isPresent();
        assertThat(foundByMyHeritage.get().getId()).isEqualTo(foundByGramps.get().getId());
        assertThat(foundByMyHeritage.get().getExternalIds())
                .extracting(PersonExternalId::getUidValue)
                .containsExactlyInAnyOrder("uid-myheritage-123", "uid-gramps-456");
        assertThat(notFound).isEmpty();
    }

    @Test
    @Transactional
    void shouldKeepExternalUidsWhenPersonIsArchivedAndGedcomDataRemoved() {
        // GIVEN
        Person person = new Person();
        person.setCachedGivenName("Anna");
        person.setCachedSurname("Nowak");
        person.addExternalId("uid-anna-001", "MYHERITAGE");

        PersonGedcomData gedcomData = new PersonGedcomData();
        gedcomData.setPerson(person);
        gedcomData.setGedRefId("@I1@");
        gedcomData.setGedUid("uid-anna-001");
        person.setGedcomData(gedcomData);

        Person saved = personRepository.saveAndFlush(person);
        entityManager.clear();

        // WHEN - archive person and remove raw GEDCOM snapshot
        Person toArchive = personRepository.findById(saved.getId()).orElseThrow();
        toArchive.setIsArchived(true);
        toArchive.setGedcomData(null);
        personRepository.saveAndFlush(toArchive);
        entityManager.clear();

        // THEN - person is archived, raw gedcom data is gone, but external UID still matches
        Optional<Person> found = personRepository.findByExternalIdsUidValue("uid-anna-001");
        assertThat(found).isPresent();
        assertThat(found.get().getIsArchived()).isTrue();
        assertThat(found.get().getGedcomData()).isNull();
    }

    @Test
    @Transactional
    void shouldFindOnlyNonArchivedPeople() {
        // GIVEN
        Person activePerson = new Person();
        activePerson.setCachedGivenName("Piotr");
        activePerson.setIsArchived(false);

        Person archivedPerson = new Person();
        archivedPerson.setCachedGivenName("Tomasz");
        archivedPerson.setIsArchived(true);

        personRepository.saveAllAndFlush(List.of(activePerson, archivedPerson));
        entityManager.clear();

        // WHEN
        List<Person> activePeople = personRepository.findByIsArchivedFalse();

        // THEN
        assertThat(activePeople)
                .extracting(Person::getCachedGivenName)
                .contains("Piotr")
                .doesNotContain("Tomasz");
    }

    @Test
    @Transactional
    void shouldNotAllowSameExternalUidAssignedToTwoDifferentPeople() {
        // GIVEN
        Person person1 = new Person();
        person1.setCachedGivenName("Jan");
        person1.addExternalId("duplicate-uid-001", "MYHERITAGE");
        personRepository.saveAndFlush(person1);

        Person person2 = new Person();
        person2.setCachedGivenName("Adam");
        person2.addExternalId("duplicate-uid-001", "MYHERITAGE");

        // WHEN & THEN
        assertThrows(DataIntegrityViolationException.class, () -> {
            personRepository.saveAndFlush(person2);
        });
    }
}