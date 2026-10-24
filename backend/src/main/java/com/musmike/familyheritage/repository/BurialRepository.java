package com.musmike.familyheritage.repository;

import com.musmike.familyheritage.model.Burial;
import com.musmike.familyheritage.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BurialRepository extends JpaRepository<Burial, Long> {
    List<Burial> findByPerson(Person person);
}
