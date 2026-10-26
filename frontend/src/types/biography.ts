export type PersonSex = 'MALE' | 'FEMALE' | 'INTERSEX' | 'UNKNOWN';

export type LifeState = 'LIVING' | 'DECEASED' | 'UNKNOWN';

export type FamilyChildRelationshipType = 'BIOLOGICAL' | 'ADOPTED' | 'FOSTER' | 'OTHER';

export interface PersonListItemDto {
  id: number;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
  defaultProband?: boolean;
  birthYear: number | null;
  birthDateText: string | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathDateText: string | null;
  deathPlace: string | null;
  age: number | null;
  ageApproximate: boolean;
}

export interface BiographyPageDto {
  content: PersonListItemDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RelatedPersonDto {
  id: number | null;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  birthYear: number | null;
  deathYear: number | null;
  archived: boolean;
  privateRecord: boolean;
}

export interface OriginFamilyDto {
  familyId: number;
  father: RelatedPersonDto | null;
  fatherRelationshipType: FamilyChildRelationshipType;
  mother: RelatedPersonDto | null;
  motherRelationshipType: FamilyChildRelationshipType;
  siblings: RelatedPersonDto[];
}

export interface ChildInFamilyDto {
  person: RelatedPersonDto;
  fatherRelationshipType: FamilyChildRelationshipType;
  motherRelationshipType: FamilyChildRelationshipType;
}

export interface SpouseFamilyDto {
  familyId: number;
  spouse: RelatedPersonDto | null;
  statusCode: string | null;
  weddingDateText: string | null;
  weddingPlace: string | null;
  children: ChildInFamilyDto[];
}

export interface PersonNameDto {
  id: number;
  type: string;
  givenName: string | null;
  surname: string | null;
  current: boolean;
}

export interface ExternalIdDto {
  sourceSystem: string;
  uidValue: string;
}

export interface RawGedcomPersonViewDto {
  gedRefId: string | null;
  gedUid: string | null;
  rawGivenName: string | null;
  rawSurname: string | null;
  rawSex: string | null;
  rawDeathIndicated: boolean | null;
  rawBirthDate: string | null;
  rawBirthPlace: string | null;
  rawDeathDate: string | null;
  rawDeathPlace: string | null;
  rawCauseOfDeath: string | null;
  rawBurialPlace: string | null;
  lastImportedAt: string | null;
  externalIds: ExternalIdDto[];
}

export interface PersonBiographyDto {
  id: number;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
  birthYear: number | null;
  birthDateText: string | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathDateText: string | null;
  deathPlace: string | null;
  causeOfDeath: string | null;
  burialPlace: string | null;
  age: number | null;
  ageApproximate: boolean;
  names: PersonNameDto[];
  originFamilies: OriginFamilyDto[];
  spouseFamilies: SpouseFamilyDto[];
  rawGedcomData: RawGedcomPersonViewDto | null;
}

export interface BiographyListQueryParams {
  search?: string;
  sex?: string;
  lifeState?: string;
  includeArchived?: boolean;
  sortBy?: string;
  page?: number;
  size?: number;
}

export interface AncestorTreeNodeDto {
  id: number;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
  privateRecord: boolean;
  birthYear: number | null;
  birthDateText: string | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathDateText: string | null;
  deathPlace: string | null;
  causeOfDeath: string | null;
  burialPlace: string | null;
  weddingDateText: string | null;
  weddingPlace: string | null;
  age: number | null;
  ageApproximate: boolean;
  hasMoreAncestors?: boolean;
  father: AncestorTreeNodeDto | null;
  mother: AncestorTreeNodeDto | null;
  children?: RelatedPersonDto[];
}