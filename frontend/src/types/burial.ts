import type { LifeState, PersonSex } from './biography';

export interface BurialPersonItemDto {
  burialId: number;
  graveId: number;
  cemeteryLocationId: number | null;
  cemeteryName: string | null;
  current: boolean;
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
  cemeteryLocationId: number | null;
  cemeteryName: string | null;
  burials: BurialPersonItemDto[];
}

export interface CemeteryGroupDto {
  cemeteryLocationId: number | null;
  groupName: string;
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