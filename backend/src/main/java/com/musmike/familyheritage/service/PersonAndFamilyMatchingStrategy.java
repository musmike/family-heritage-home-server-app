package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.ParsedGedcomFamilyDto;
import com.musmike.familyheritage.dto.ParsedGedcomIndividualDto;
import com.musmike.familyheritage.model.Family;
import com.musmike.familyheritage.model.Person;
import com.musmike.familyheritage.repository.FamilyRepository;
import com.musmike.familyheritage.repository.PersonRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PersonAndFamilyMatchingStrategy {
    private final PersonRepository personRepository;
    private final FamilyRepository familyRepository;

    public Optional<Person> findExistingPerson(ParsedGedcomIndividualDto indi) {
        if (indi.getGedUid() != null && !indi.getGedUid().isBlank()) {
            Optional<Person> byExtUid = personRepository.findByExternalIdsUidValue(indi.getGedUid());
            if (byExtUid.isPresent()) return byExtUid;

            Optional<Person> byUid = personRepository.findByGedcomDataGedUid(indi.getGedUid());
            if (byUid.isPresent()) return byUid;
        }
        return personRepository.findByGedcomDataGedRefId(indi.getGedRefId());
    }

    public Optional<Family> findExistingFamily(ParsedGedcomFamilyDto fam) {
        if (fam.getGedUid() != null && !fam.getGedUid().isBlank()) {
            Optional<Family> byExtUid = familyRepository.findByExternalIdsUidValue(fam.getGedUid());
            if (byExtUid.isPresent()) return byExtUid;

            Optional<Family> byUid = familyRepository.findByGedcomDataGedUid(fam.getGedUid());
            if (byUid.isPresent()) return byUid;
        }
        return familyRepository.findByGedcomDataGedRefId(fam.getGedRefId());
    }
}