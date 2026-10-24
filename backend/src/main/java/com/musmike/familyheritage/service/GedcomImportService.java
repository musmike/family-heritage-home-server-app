package com.musmike.familyheritage.service;

import com.musmike.familyheritage.dto.*;
import com.musmike.familyheritage.model.enums.DecisionAction;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class GedcomImportService {

    private final GedcomFileExtractor fileExtractor;
    private final PersonAndFamilyMatchingStrategy matchingStrategy;
    private final GedcomImportApplier importApplier;

    @Transactional
    public void importGedcom(InputStream inputStream) throws Exception {
        ParsedGedcomFileDto parsedFile = fileExtractor.extract(inputStream);

        Map<String, IndividualDecisionDto> individualDecisions = new HashMap<>();
        for (ParsedGedcomIndividualDto indi : parsedFile.getIndividuals()) {
            IndividualDecisionDto decision = matchingStrategy.findExistingPerson(indi)
                    .map(existing -> new IndividualDecisionDto(indi.getGedRefId(), DecisionAction.MATCH, existing.getId()))
                    .orElseGet(() -> new IndividualDecisionDto(indi.getGedRefId(), DecisionAction.CREATE_NEW, null));
            individualDecisions.put(indi.getGedRefId(), decision);
        }

        Map<String, FamilyDecisionDto> familyDecisions = new HashMap<>();
        for (ParsedGedcomFamilyDto fam : parsedFile.getFamilies()) {
            FamilyDecisionDto decision = matchingStrategy.findExistingFamily(fam)
                    .map(existing -> new FamilyDecisionDto(fam.getGedRefId(), DecisionAction.MATCH, existing.getId()))
                    .orElseGet(() -> new FamilyDecisionDto(fam.getGedRefId(), DecisionAction.CREATE_NEW, null));
            familyDecisions.put(fam.getGedRefId(), decision);
        }

        importApplier.applyImport(parsedFile, individualDecisions, familyDecisions, Map.of());
    }
}