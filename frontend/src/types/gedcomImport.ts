export type ImportSessionStatus =
  | 'REVIEW_INDIVIDUALS'
  | 'REVIEW_FAMILIES'
  | 'REVIEW_SUMMARY'
  | 'COMPLETED'
  | 'FAILED';

export type MatchClassification = 'AUTO_MATCH' | 'NEEDS_REVIEW' | 'NEW';

export type DecisionAction = 'MATCH' | 'CREATE_NEW';

export type AbsentPersonAction = 'ARCHIVE' | 'DELETE';

export interface ParsedGedcomIndividualDto {
  gedRefId: string;
  gedUid: string | null;
  givenName: string;
  surname: string;
  sex: string | null;
  deathIndicated: boolean;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  causeOfDeath: string | null;
  burialPlace: string | null;
  parentGivenNames: string[];
  spouseGivenNames: string[];
}

export interface PersonMatchCandidateDto {
  personId: number;
  givenName: string | null;
  surname: string | null;
  birthYear: number | null;
  deathYear: number | null;
  archived: boolean;
  confidenceScore: number;
  matchReasons: string[];
}

export interface IndividualMatchResultDto {
  gedcomIndividual: ParsedGedcomIndividualDto;
  classification: MatchClassification;
  selectedAction: DecisionAction | null;
  selectedTargetPersonId: number | null;
  candidates: PersonMatchCandidateDto[];
}

export interface IndividualDecisionDto {
  gedRefId: string;
  action: DecisionAction;
  targetPersonId: number | null;
}

export interface ParsedGedcomChildLinkDto {
  childGedRefId: string;
  rawPedigree: string | null;
  rawAdoptedBy: string | null;
}

export interface ParsedGedcomFamilyDto {
  gedRefId: string;
  gedUid: string | null;
  husbandGedRefId: string | null;
  wifeGedRefId: string | null;
  weddingDate: string | null;
  weddingPlace: string | null;
  statusCode: string;
  children: ParsedGedcomChildLinkDto[];
}

export interface FamilyMatchCandidateDto {
  familyId: number;
  husbandName: string | null;
  wifeName: string | null;
  weddingYear: number | null;
  confidenceScore: number;
  matchReasons: string[];
}

export interface FamilyMatchResultDto {
  gedcomFamily: ParsedGedcomFamilyDto;
  classification: MatchClassification;
  selectedAction: DecisionAction | null;
  selectedTargetFamilyId: number | null;
  candidates: FamilyMatchCandidateDto[];
}

export interface FamilyDecisionDto {
  gedRefId: string;
  action: DecisionAction;
  targetFamilyId: number | null;
}

export interface AbsentPersonReviewDto {
  personId: number;
  givenName: string | null;
  surname: string | null;
  birthYear: number | null;
  deathYear: number | null;
  selectedAction: AbsentPersonAction;
  canBeDeleted: boolean;
  deletionBlockReasons: string[];
}

export interface AbsentPersonDecisionDto {
  personId: number;
  action: AbsentPersonAction;
}

export interface ImportSummaryPreviewDto {
  individualsToCreate: number;
  individualsToUpdate: number;
  individualsUnchanged: number;
  familiesToCreate: number;
  familiesToUpdate: number;
  familiesUnchanged: number;
  familiesToDelete: number;
  absentPersonsCount: number;
}

export interface ImportSessionResponseDto {
  sessionId: number;
  fileName: string | null;
  status: ImportSessionStatus;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
  individualMatches: IndividualMatchResultDto[];
  familyMatches: FamilyMatchResultDto[];
  absentPeople: AbsentPersonReviewDto[];
  summaryPreview: ImportSummaryPreviewDto | null;
}

export interface ImportSessionHistoryItemDto {
  sessionId: number;
  fileName: string | null;
  status: ImportSessionStatus;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
  summaryPreview: ImportSummaryPreviewDto | null;
}