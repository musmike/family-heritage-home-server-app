import type { LifeState, PersonSex } from './biography';

export interface BurialPersonItemDto {
  burialId: number;
  graveId: number;
  cemeteryId: number | null;
  cemeteryName: string | null;
  current: boolean;
  placeDescription: string | null;
  burialYear: number | null;
  burialDateText: string | null;
  personId: number;
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
  age: number | null;
  ageApproximate: boolean;
}

export interface GraveGroupDto {
  graveId: number;
  cemeteryId: number | null;
  cemeteryName: string | null;
  section: string | null;
  sector: string | null;
  rowNumber: string | null;
  graveNumber: string | null;
  graveType: string | null;
  graveTypeLabel: string | null;
  description: string | null;
  epitaph: string | null;
  burials: BurialPersonItemDto[];
}

export interface CemeteryGroupDto {
  cemeteryId: number | null;
  groupName: string;
  managementType?: string | null;
  managementTypeLabel?: string | null;
  denomination?: string | null;
  denominationLabel?: string | null;
  locationName?: string | null;
  description?: string | null;
  otherGroup: boolean;
  totalBurialsCount: number;
  graves: GraveGroupDto[];
}

export interface BurialsOverviewDto {
  totalBurialsCount: number;
  totalGravesCount: number;
  cemeteryGroups: CemeteryGroupDto[];
}

export interface BurialsQueryParams {
  search?: string;
  sex?: string;
  includeNonCurrent?: boolean;
  includeArchived?: boolean;
  sortBy?: string;
}

export interface SaveCemeteryRequestDto {
  name: string;
  managementType?: string | null;
  denomination?: string | null;
  locationName?: string | null;
  description?: string | null;
}

export interface SaveGraveRequestDto {
  cemeteryId: number | null;
  section?: string | null;
  sector?: string | null;
  rowNumber?: string | null;
  graveNumber?: string | null;
  graveType?: string | null;
  description?: string | null;
  epitaph?: string | null;
  initialPersonId?: number | null;
}

export interface AddPersonToGraveRequestDto {
  personId: number;
  current: boolean;
}