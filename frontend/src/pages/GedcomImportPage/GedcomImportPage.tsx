import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { gedcomImportApi } from '../../api/gedcomImportApi';
import Loader from '../../components/Loader/Loader';
import styles from './GedcomImportPage.module.css';
import type {
  AbsentPersonAction,
  DecisionAction,
  FamilyDecisionDto,
  FamilyMatchCandidateDto,
  ImportSessionHistoryItemDto,
  ImportSessionResponseDto,
  IndividualDecisionDto,
  MatchClassification,
  PersonMatchCandidateDto,
} from '../../types/gedcomImport';

type WizardViewStep = 'INDIVIDUALS' | 'FAMILIES' | 'SUMMARY';
type FilterMode = 'ALL' | 'NEEDS_REVIEW' | 'AUTO_MATCH' | 'NEW';

const MATCH_REASON_LABELS: Record<string, string | undefined> = {
  'Exact external UID match': 'Zgodny zewnętrzny identyfikator UID',
  'Exact given name and surname match': 'Dokładna zgodność imienia i nazwiska',
  'Exact given name and similar surname': 'Zgodne imię i podobne nazwisko',
  'Similar given name and exact surname': 'Podobne imię i zgodne nazwisko',
  'Matching given name': 'Zgodne imię',
  'Exact birth date match': 'Zgodna dokładna data urodzenia',
  'Matching birth year': 'Zgodny rok urodzenia',
  'Matching birth place': 'Zgodne miejsce urodzenia',
  'Matching death date/year': 'Zgodna data lub rok śmierci',
  'Matching death place': 'Zgodne miejsce śmierci',
  'Matching parent given name': 'Zgodne imię rodzica',
  'Matching spouse given name': 'Zgodne imię małżonka',
  'Matching GEDCOM reference ID': 'Zgodny identyfikator referencyjny GEDCOM',
  'Both spouses match existing family': 'Oboje małżonkowie pasują do istniejącej rodziny',
  'Single parent matches existing single-parent family':
    'Rodzic pasuje do istniejącej rodziny niepełnej',
  'One spouse matches existing family': 'Jeden z małżonków pasuje do istniejącej rodziny',
  'Matching children in family': 'Zgodne dzieci w rodzinie',
  'Matching wedding year': 'Zgodny rok ślubu',
  'Manual selection': 'Ręczny wybór użytkownika',
};

const BLOCK_REASON_LABELS: Record<string, string | undefined> = {
  'Person has no raw GEDCOM link (manually created or already archived)':
    'Osoba utworzona ręcznie w aplikacji lub już zarchiwizowana',
  'Person has manually edited personal details':
    'Osoba posiada ręcznie edytowane dane osobowe w aplikacji',
  'Person has manually edited birth event details':
    'Osoba posiada ręcznie edytowane dane urodzenia w aplikacji',
  'Person has manually edited death event details':
    'Osoba posiada ręcznie edytowane dane śmierci w aplikacji',
  'Person has manually edited burial details':
    'Osoba posiada ręcznie edytowane dane pochówku w aplikacji',
  'Person has additional custom names':
    'Osoba posiada dodatkowe imiona lub nazwiska dodane w aplikacji',
  'Person participates in custom events':
    'Osoba uczestniczy w dodatkowych wydarzeniach w aplikacji',
};

const FAMILY_STATUS_LABELS: Record<string, string | undefined> = {
  MARRIED: 'Małżeństwo',
  DIVORCED: 'Rozwód',
  SEPARATED: 'Separacja',
  WIDOWED: 'Wdowieństwo',
  ENGAGED: 'Zaręczyny',
  PARTNERS: 'Związek partnerski',
  FRIENDS: 'Przyjaciele',
  ANNULLED: 'Unieważnione małżeństwo',
  UNKNOWN: 'Nieznany',
  OTHER: 'Inny',
};

const translateMatchReason = (reason: string): string =>
  MATCH_REASON_LABELS[reason] ?? reason;

const translateBlockReason = (reason: string): string =>
  BLOCK_REASON_LABELS[reason] ?? reason;

const translateFamilyStatus = (code: string): string =>
  FAMILY_STATUS_LABELS[code] ?? code;

const translateSex = (sex: string | null | undefined): string => {
  if (sex === 'M' || sex === 'MALE') return 'Mężczyzna';
  if (sex === 'F' || sex === 'FEMALE') return 'Kobieta';
  return 'Nieznana';
};

const translateClassification = (classification: MatchClassification): string => {
  switch (classification) {
    case 'AUTO_MATCH':
      return 'Dopasowano automatycznie';
    case 'NEEDS_REVIEW':
      return 'Wymaga decyzji';
    case 'NEW':
      return 'Nowy rekord';
  }
};

const formatPolishDateTime = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const renderCandidateDetails = (cand: PersonMatchCandidateDto) => {
  const birthInfo = cand.birthDate ?? (cand.birthYear !== null ? String(cand.birthYear) : '—');
  const deathInfo = cand.deathDate ?? (cand.deathYear !== null ? String(cand.deathYear) : '—');
  const parents = cand.parentGivenNames ?? [];
  const spouses = cand.spouseGivenNames ?? [];

  return (
    <div className={styles.candidateDetailsGrid}>
      <div>
        <strong>Płeć:</strong> {translateSex(cand.sex)}
      </div>
      <div>
        <strong>Urodzenie:</strong> {birthInfo}{' '}
        {cand.birthPlace ? `(${cand.birthPlace})` : ''}
      </div>
      <div>
        <strong>Śmierć:</strong> {deathInfo}{' '}
        {cand.deathPlace ? `(${cand.deathPlace})` : ''}
      </div>
      {parents.length > 0 && (
        <div>
          <strong>Rodzice w bazie:</strong> {parents.join(', ')}
        </div>
      )}
      {spouses.length > 0 && (
        <div>
          <strong>Małżonkowie w bazie:</strong> {spouses.join(', ')}
        </div>
      )}
    </div>
  );
};

export default function GedcomImportPage() {
  const [activeSession, setActiveSession] = useState<ImportSessionResponseDto | null>(null);
  const [viewStep, setViewStep] = useState<WizardViewStep>('INDIVIDUALS');
  const [history, setHistory] = useState<ImportSessionHistoryItemDto[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');

  const [indiDecisions, setIndiDecisions] = useState<
    Record<string, IndividualDecisionDto | undefined>
  >({});
  const [famDecisions, setFamDecisions] = useState<
    Record<string, FamilyDecisionDto | undefined>
  >({});
  const [absentDecisions, setAbsentDecisions] = useState<
    Record<number, AbsentPersonAction | undefined>
  >({});

  const [personLookupQuery, setPersonLookupQuery] = useState<Record<string, string | undefined>>(
    {}
  );
  const [personLookupResults, setPersonLookupResults] = useState<
    Record<string, PersonMatchCandidateDto[] | undefined>
  >({});
  const [familyLookupQuery, setFamilyLookupQuery] = useState<Record<string, string | undefined>>(
    {}
  );
  const [familyLookupResults, setFamilyLookupResults] = useState<
    Record<string, FamilyMatchCandidateDto[] | undefined>
  >({});

  // Map GEDCOM individual XREF (@I1@) -> "Imię Nazwisko (@I1@)" for display in Families step
  const gedcomPersonLabelsByRef = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    if (!activeSession) return map;
    for (const m of activeSession.individualMatches) {
      const indi = m.gedcomIndividual;
      const fullName = `${indi.givenName} ${indi.surname}`.trim();
      map[indi.gedRefId] = fullName ? `${fullName} (${indi.gedRefId})` : indi.gedRefId;
    }
    return map;
  }, [activeSession]);

  const formatGedcomPersonRef = (xref: string | null): string => {
    if (!xref) return '—';
    return gedcomPersonLabelsByRef[xref] ?? xref;
  };

  const syncLocalDecisionsFromSession = (session: ImportSessionResponseDto) => {
    const nextIndi: Record<string, IndividualDecisionDto | undefined> = {};
    for (const m of session.individualMatches) {
      if (m.selectedAction) {
        nextIndi[m.gedcomIndividual.gedRefId] = {
          gedRefId: m.gedcomIndividual.gedRefId,
          action: m.selectedAction,
          targetPersonId: m.selectedTargetPersonId,
        };
      }
    }
    setIndiDecisions(nextIndi);

    const nextFam: Record<string, FamilyDecisionDto | undefined> = {};
    for (const f of session.familyMatches) {
      if (f.selectedAction) {
        nextFam[f.gedcomFamily.gedRefId] = {
          gedRefId: f.gedcomFamily.gedRefId,
          action: f.selectedAction,
          targetFamilyId: f.selectedTargetFamilyId,
        };
      }
    }
    setFamDecisions(nextFam);

    const nextAbsent: Record<number, AbsentPersonAction | undefined> = {};
    for (const a of session.absentPeople) {
      nextAbsent[a.personId] = a.canBeDeleted ? a.selectedAction : 'ARCHIVE';
    }
    setAbsentDecisions(nextAbsent);

    if (session.status === 'REVIEW_INDIVIDUALS') {
      setViewStep('INDIVIDUALS');
    } else if (session.status === 'REVIEW_FAMILIES') {
      setViewStep('FAMILIES');
    } else if (session.status === 'REVIEW_SUMMARY') {
      setViewStep('SUMMARY');
    }
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [active, hist] = await Promise.all([
        gedcomImportApi.getActiveSession(),
        gedcomImportApi.getImportHistory(),
      ]);
      setHistory(hist);
      if (active) {
        setActiveSession(active);
        syncLocalDecisionsFromSession(active);
      } else {
        setActiveSession(null);
      }
    } catch {
      setErrorMessage('Nie udało się pobrać danych sesji importu.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, []);

  const handleStartImport = async () => {
    if (!selectedFile) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const created = await gedcomImportApi.createSession(selectedFile);
      setActiveSession(created);
      syncLocalDecisionsFromSession(created);
      setSelectedFile(null);
    } catch {
      setErrorMessage('Błąd podczas analizy pliku GEDCOM. Sprawdź poprawność pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await gedcomImportApi.cancelSession(activeSession.sessionId);
      setActiveSession(null);
      setIndiDecisions({});
      setFamDecisions({});
      setAbsentDecisions({});
    } catch {
      setErrorMessage('Nie udało się anulować sesji importu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectIndividualDecision = (
    gedRefId: string,
    action: DecisionAction,
    targetPersonId: number | null
  ) => {
    setIndiDecisions(prev => ({
      ...prev,
      [gedRefId]: { gedRefId, action, targetPersonId },
    }));
  };

  const handleSelectFamilyDecision = (
    gedRefId: string,
    action: DecisionAction,
    targetFamilyId: number | null
  ) => {
    setFamDecisions(prev => ({
      ...prev,
      [gedRefId]: { gedRefId, action, targetFamilyId },
    }));
  };

  const handleSearchPeople = async (gedRefId: string) => {
    const q = personLookupQuery[gedRefId] ?? '';
    try {
      const results = await gedcomImportApi.lookupPeople(q);
      setPersonLookupResults(prev => ({ ...prev, [gedRefId]: results }));
    } catch {
      setErrorMessage('Nie udało się wyszukać osób w bazie.');
    }
  };

  const handleSearchFamilies = async (gedRefId: string) => {
    const q = familyLookupQuery[gedRefId] ?? '';
    try {
      const results = await gedcomImportApi.lookupFamilies(q);
      setFamilyLookupResults(prev => ({ ...prev, [gedRefId]: results }));
    } catch {
      setErrorMessage('Nie udało się wyszukać rodzin w bazie.');
    }
  };

  const handleConfirmIndividuals = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const decisionsList = Object.values(indiDecisions).filter(
        (d): d is IndividualDecisionDto => d !== undefined
      );
      const updated = await gedcomImportApi.confirmIndividuals(
        activeSession.sessionId,
        decisionsList
      );
      setActiveSession(updated);
      syncLocalDecisionsFromSession(updated);
      setFilterMode('ALL');
    } catch {
      setErrorMessage(
        'Błąd zatwierdzania osób. Upewnij się, że nie przypisano dwóch osób z pliku do tej samej osoby w bazie.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmFamilies = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const decisionsList = Object.values(famDecisions).filter(
        (d): d is FamilyDecisionDto => d !== undefined
      );
      const updated = await gedcomImportApi.confirmFamilies(
        activeSession.sessionId,
        decisionsList
      );
      setActiveSession(updated);
      syncLocalDecisionsFromSession(updated);
      setFilterMode('ALL');
    } catch {
      setErrorMessage(
        'Błąd zatwierdzania rodzin. Upewnij się, że nie przypisano dwóch rodzin z pliku do tej samej rodziny w bazie.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyImport = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = Object.entries(absentDecisions)
        .filter((entry): entry is [string, AbsentPersonAction] => entry[1] !== undefined)
        .map(([idStr, action]) => ({
          personId: Number(idStr),
          action,
        }));
      await gedcomImportApi.applySession(activeSession.sessionId, payload);
      const updatedHistory = await gedcomImportApi.getImportHistory();
      setHistory(updatedHistory);
      setActiveSession(null);
      setSuccessMessage('Import pliku GEDCOM został pomyślnie zatwierdzony i zapisany w bazie!');
    } catch {
      setErrorMessage('Wystąpił błąd podczas zapisywania importu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreSession = async (sessionId: number) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await gedcomImportApi.restoreSession(sessionId);
      const updatedHistory = await gedcomImportApi.getImportHistory();
      setHistory(updatedHistory);
      setSuccessMessage('Pomyślnie przywrócono stan drzewa z wybranego importu!');
    } catch {
      setErrorMessage('Nie udało się przywrócić wybranego importu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const matchesFilter = (classification: MatchClassification): boolean => {
    if (filterMode === 'ALL') return true;
    return classification === filterMode;
  };

  const getBadgeStyle = (classification: MatchClassification): string => {
    switch (classification) {
      case 'AUTO_MATCH':
        return styles.badgeAuto;
      case 'NEEDS_REVIEW':
        return styles.badgeReview;
      case 'NEW':
        return styles.badgeNew;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  const unresolvedIndividualsCount = activeSession
    ? activeSession.individualMatches.filter(
        m => indiDecisions[m.gedcomIndividual.gedRefId] === undefined
      ).length
    : 0;

  const unresolvedFamiliesCount = activeSession
    ? activeSession.familyMatches.filter(
        f => famDecisions[f.gedcomFamily.gedRefId] === undefined
      ).length
    : 0;

  return (
    <div className={styles.pageWrapper}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.pageTitle}>Kreator importu GEDCOM</h1>
          <p className={styles.pageSubtitle}>
            Wgraj plik GEDCOM z dowolnego programu genealogicznego, zweryfikuj powiązania osób i rodzin oraz zarządzaj historią importów.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/" className={styles.btnSecondary}>
            ← Panel główny
          </Link>
          {activeSession && (
            <button
              type="button"
              data-testid="cancel-session-button"
              disabled={isSubmitting}
              onClick={() => {
                void handleCancelSession();
              }}
              className={styles.btnDanger}
            >
              ✕ Anuluj obecny import
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div data-testid="import-success-banner" className={styles.AlertSuccess}>
          {successMessage}
        </div>
      )}

      {/* STATE 0: NO ACTIVE SESSION -> FILE UPLOAD DROPZONE */}
      {!activeSession && (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Rozpocznij nowy import</h2>
          <div className={styles.uploadDropzone}>
            <div className={styles.uploadIcon}>📂</div>
            <div>
              <strong>Wybierz plik drzewa genealogicznego (.ged)</strong>
              <p className={styles.uploadHint}>
                Obsługiwane są pliki z MyHeritage, Gramps, Ancestry, Family Tree Builder i innych programów zgodnych ze standardem GEDCOM.
              </p>
            </div>
            <div className={styles.fileInputRow}>
              <label htmlFor="gedcom-upload-input" className={styles.filePickerLabel}>
                <span>📄</span>
                <span>Wybierz plik z dysku</span>
              </label>
              <input
                id="gedcom-upload-input"
                type="file"
                accept=".ged"
                data-testid="gedcom-file-input"
                onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
                className={styles.hiddenFileInput}
              />
              <span className={styles.selectedFileName}>
                {selectedFile ? selectedFile.name : 'Nie wybrano pliku'}
              </span>
              <button
                type="button"
                data-testid="start-import-button"
                disabled={!selectedFile || isSubmitting}
                onClick={() => {
                  void handleStartImport();
                }}
                className={styles.btnPrimary}
              >
                {isSubmitting ? 'Analizowanie pliku...' : 'Rozpocznij analizę pliku →'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ACTIVE WIZARD */}
      {activeSession && (
        <section className={styles.card}>
          {/* Wizard Stepper */}
          <div className={styles.stepperHeader}>
            <div className={styles.stepperTrack}>
              <div
                className={`${styles.stepItem} ${
                  viewStep === 'INDIVIDUALS' ? styles.stepItemActive : ''
                }`}
              >
                <span className={styles.stepBadge}>1</span>
                <span>Dopasowanie osób ({activeSession.individualMatches.length})</span>
              </div>
              <span className={styles.stepArrow}>→</span>
              <div
                className={`${styles.stepItem} ${
                  viewStep === 'FAMILIES' ? styles.stepItemActive : ''
                }`}
              >
                <span className={styles.stepBadge}>2</span>
                <span>Dopasowanie rodzin ({activeSession.familyMatches.length})</span>
              </div>
              <span className={styles.stepArrow}>→</span>
              <div
                className={`${styles.stepItem} ${
                  viewStep === 'SUMMARY' ? styles.stepItemActive : ''
                }`}
              >
                <span className={styles.stepBadge}>3</span>
                <span>Podsumowanie i nieobecne osoby</span>
              </div>
            </div>

            <div className={styles.sessionMeta}>
              <span>
                Plik: <strong>{activeSession.fileName ?? 'Brak nazwy'}</strong>
              </span>
              <span>|</span>
              <span>
                Źródło: <strong>{activeSession.sourceSystem ?? 'Nieznane'}</strong>
              </span>
            </div>
          </div>

          {/* Filter Bar for Step 1 & Step 2 */}
          {(viewStep === 'INDIVIDUALS' || viewStep === 'FAMILIES') && (
            <div className={styles.filterBar}>
              <div className={styles.filterButtons}>
                {(
                  [
                    ['ALL', 'Wszystkie rekordy'],
                    ['NEEDS_REVIEW', 'Wymagające decyzji'],
                    ['AUTO_MATCH', 'Dopasowane automatycznie'],
                    ['NEW', 'Nowe rekordy'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFilterMode(mode);
                    }}
                    className={`${styles.filterPill} ${
                      filterMode === mode ? styles.filterPillActive : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className={styles.pageSubtitle}>
                {viewStep === 'INDIVIDUALS'
                  ? `Nierozstrzygnięte osoby: ${String(unresolvedIndividualsCount)}`
                  : `Nierozstrzygnięte rodziny: ${String(unresolvedFamiliesCount)}`}
              </span>
            </div>
          )}

          {/* STEP 1: INDIVIDUALS */}
          {viewStep === 'INDIVIDUALS' && (
            <div className={styles.matchList}>
              {activeSession.individualMatches
                .filter(m => matchesFilter(m.classification))
                .map(match => {
                  const indi = match.gedcomIndividual;
                  const currentDecision = indiDecisions[indi.gedRefId];
                  const lookupList = personLookupResults[indi.gedRefId] ?? [];
                  const isMatchedToNonDefaultCandidate =
                    currentDecision?.action === 'MATCH' &&
                    currentDecision.targetPersonId !== null &&
                    !match.candidates.some(c => c.personId === currentDecision.targetPersonId);

                  return (
                    <div key={indi.gedRefId} className={styles.matchCard}>
                      <div className={styles.matchCardHeader}>
                        <div>
                          <span className={styles.xrefBadge}>{indi.gedRefId}</span>
                          <span className={styles.recordTitle}>
                            {indi.givenName} {indi.surname}
                          </span>
                        </div>
                        <span
                          className={`${styles.classificationBadge} ${getBadgeStyle(
                            match.classification
                          )}`}
                        >
                          {translateClassification(match.classification)}
                        </span>
                      </div>

                      <div className={styles.matchCardBody}>
                        <div className={styles.gedcomDetailsBox}>
                          <div className={styles.boxSubtitle}>Dane z pliku GEDCOM</div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Płeć:</span>
                            <span className={styles.detailValue}>{translateSex(indi.sex)}</span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Urodzenie:</span>
                            <span className={styles.detailValue}>
                              {indi.birthDate ?? '—'} {indi.birthPlace ? `(${indi.birthPlace})` : ''}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Śmierć:</span>
                            <span className={styles.detailValue}>
                              {indi.deathDate ?? (indi.deathIndicated ? 'Tak' : '—')}{' '}
                              {indi.deathPlace ? `(${indi.deathPlace})` : ''}
                            </span>
                          </div>
                          {indi.parentGivenNames.length > 0 && (
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>Rodzice w pliku:</span>
                              <span className={styles.detailValue}>
                                {indi.parentGivenNames.join(', ')}
                              </span>
                            </div>
                          )}
                          {indi.spouseGivenNames.length > 0 && (
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>Małżonkowie w pliku:</span>
                              <span className={styles.detailValue}>
                                {indi.spouseGivenNames.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className={styles.candidatesColumn}>
                          <div className={styles.boxSubtitle}>
                            Proponowani kandydaci w bazie ({match.candidates.length})
                          </div>
                          {isMatchedToNonDefaultCandidate && (
                            <div className={styles.manualSelectedBanner}>
                              ✓ Wybrano ręcznie z wyszukiwarki: osoba o ID #
                              {currentDecision.targetPersonId}
                            </div>
                          )}
                          {match.candidates.length === 0 ? (
                            <p className={styles.pageSubtitle}>
                              Brak automatycznych kandydatów powyżej progu podobieństwa. Możesz utworzyć nową osobę lub wyszukać ręcznie poniżej.
                            </p>
                          ) : (
                            match.candidates.map(cand => {
                              const isSelected =
                                currentDecision?.action === 'MATCH' &&
                                currentDecision.targetPersonId === cand.personId;

                              return (
                                <div
                                  key={cand.personId}
                                  className={`${styles.candidateItem} ${
                                    isSelected ? styles.candidateItemSelected : ''
                                  }`}
                                >
                                  <div className={styles.candidateTopRow}>
                                    <div className={styles.candidateInfo}>
                                      <strong>
                                        {cand.givenName} {cand.surname}
                                      </strong>
                                      <span>(ID: #{cand.personId})</span>
                                      <span className={styles.confidencePill}>
                                        Pewność: {cand.confidenceScore}%
                                      </span>
                                      {cand.archived && (
                                        <span className={styles.archivedTag}>Zarchiwizowana</span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      data-testid={`match-candidate-${indi.gedRefId}-${String(
                                        cand.personId
                                      )}`}
                                      onClick={() => {
                                        handleSelectIndividualDecision(
                                          indi.gedRefId,
                                          'MATCH',
                                          cand.personId
                                        );
                                      }}
                                      className={`${styles.btnChoice} ${
                                        isSelected ? styles.btnChoiceSelectedMatch : ''
                                      }`}
                                    >
                                      {isSelected ? '✓ Wybrano (połącz)' : 'Połącz z tą osobą'}
                                    </button>
                                  </div>
                                  {renderCandidateDetails(cand)}
                                  <div className={styles.reasonsList}>
                                    {cand.matchReasons.map(reason => (
                                      <span key={reason} className={styles.reasonChip}>
                                        {translateMatchReason(reason)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className={styles.matchCardFooter}>
                        <button
                          type="button"
                          data-testid={`create-new-${indi.gedRefId}`}
                          onClick={() => {
                            handleSelectIndividualDecision(indi.gedRefId, 'CREATE_NEW', null);
                          }}
                          className={`${styles.btnChoice} ${
                            currentDecision?.action === 'CREATE_NEW'
                              ? styles.btnChoiceSelectedNew
                              : ''
                          }`}
                        >
                          {currentDecision?.action === 'CREATE_NEW'
                            ? '✓ Utwórz jako nową osobę'
                            : '+ Utwórz jako nową osobę'}
                        </button>

                        <div className={styles.lookupGroup}>
                          <input
                            type="text"
                            placeholder="Szukaj innej osoby w bazie..."
                            value={personLookupQuery[indi.gedRefId] ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setPersonLookupQuery(prev => ({
                                ...prev,
                                [indi.gedRefId]: val,
                              }));
                            }}
                            className={styles.lookupInput}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void handleSearchPeople(indi.gedRefId);
                            }}
                            className={styles.btnSecondary}
                          >
                            Szukaj
                          </button>
                        </div>
                      </div>

                      {lookupList.length > 0 && (
                        <div className={styles.lookupResultsBox}>
                          {lookupList.map(item => {
                            const isManualSelected =
                              currentDecision?.action === 'MATCH' &&
                              currentDecision.targetPersonId === item.personId;

                            return (
                              <div
                                key={item.personId}
                                className={`${styles.candidateItem} ${
                                  isManualSelected ? styles.candidateItemSelected : ''
                                }`}
                              >
                                <div className={styles.candidateTopRow}>
                                  <div className={styles.candidateInfo}>
                                    <strong>
                                      {item.givenName} {item.surname}
                                    </strong>{' '}
                                    <span>(ID: #{item.personId})</span>
                                    {item.archived && (
                                      <span className={styles.archivedTag}>Zarchiwizowana</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectIndividualDecision(
                                        indi.gedRefId,
                                        'MATCH',
                                        item.personId
                                      );
                                    }}
                                    className={`${styles.btnChoice} ${
                                      isManualSelected ? styles.btnChoiceSelectedMatch : ''
                                    }`}
                                  >
                                    {isManualSelected
                                      ? '✓ Wybrano (połącz)'
                                      : 'Wybierz tę osobę'}
                                  </button>
                                </div>
                                {renderCandidateDetails(item)}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

              <div className={styles.wizardFooter}>
                <span className={styles.pageSubtitle}>
                  Pozostało do rozstrzygnięcia: <strong>{unresolvedIndividualsCount}</strong>
                </span>
                <button
                  type="button"
                  data-testid="confirm-individuals-button"
                  disabled={unresolvedIndividualsCount > 0 || isSubmitting}
                  onClick={() => {
                    void handleConfirmIndividuals();
                  }}
                  className={styles.btnPrimary}
                >
                  Zatwierdź osoby i przejdź do rodzin →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: FAMILIES */}
          {viewStep === 'FAMILIES' && (
            <div className={styles.matchList}>
              {activeSession.familyMatches
                .filter(f => matchesFilter(f.classification))
                .map(match => {
                  const fam = match.gedcomFamily;
                  const currentDecision = famDecisions[fam.gedRefId];
                  const lookupList = familyLookupResults[fam.gedRefId] ?? [];
                  const isMatchedToNonDefaultFamily =
                    currentDecision?.action === 'MATCH' &&
                    currentDecision.targetFamilyId !== null &&
                    !match.candidates.some(c => c.familyId === currentDecision.targetFamilyId);

                  return (
                    <div key={fam.gedRefId} className={styles.matchCard}>
                      <div className={styles.matchCardHeader}>
                        <div>
                          <span className={styles.xrefBadge}>{fam.gedRefId}</span>
                          <span className={styles.recordTitle}>
                            Mąż: {formatGedcomPersonRef(fam.husbandGedRefId)} | Żona:{' '}
                            {formatGedcomPersonRef(fam.wifeGedRefId)}
                          </span>
                        </div>
                        <span
                          className={`${styles.classificationBadge} ${getBadgeStyle(
                            match.classification
                          )}`}
                        >
                          {translateClassification(match.classification)}
                        </span>
                      </div>

                      <div className={styles.matchCardBody}>
                        <div className={styles.gedcomDetailsBox}>
                          <div className={styles.boxSubtitle}>Dane rodziny z pliku GEDCOM</div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Mąż:</span>
                            <span className={styles.detailValue}>
                              {formatGedcomPersonRef(fam.husbandGedRefId)}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Żona:</span>
                            <span className={styles.detailValue}>
                              {formatGedcomPersonRef(fam.wifeGedRefId)}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Status relacji:</span>
                            <span className={styles.detailValue}>
                              {translateFamilyStatus(fam.statusCode)}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Data i miejsce ślubu:</span>
                            <span className={styles.detailValue}>
                              {fam.weddingDate ?? '—'}{' '}
                              {fam.weddingPlace ? `(${fam.weddingPlace})` : ''}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>
                              Dzieci ({fam.children.length}):
                            </span>
                            <span className={styles.detailValue}>
                              {fam.children.length === 0
                                ? '—'
                                : fam.children
                                    .map(c => formatGedcomPersonRef(c.childGedRefId))
                                    .join(', ')}
                            </span>
                          </div>
                        </div>

                        <div className={styles.candidatesColumn}>
                          <div className={styles.boxSubtitle}>
                            Proponowane rodziny w bazie ({match.candidates.length})
                          </div>
                          {isMatchedToNonDefaultFamily && (
                            <div className={styles.manualSelectedBanner}>
                              ✓ Wybrano ręcznie z wyszukiwarki: rodzina o ID #
                              {currentDecision.targetFamilyId}
                            </div>
                          )}
                          {match.candidates.map(cand => {
                            const isSelected =
                              currentDecision?.action === 'MATCH' &&
                              currentDecision.targetFamilyId === cand.familyId;

                            return (
                              <div
                                key={cand.familyId}
                                className={`${styles.candidateItem} ${
                                  isSelected ? styles.candidateItemSelected : ''
                                }`}
                              >
                                <div className={styles.candidateTopRow}>
                                  <div className={styles.candidateInfo}>
                                    <strong>
                                      {cand.husbandName ?? '—'} + {cand.wifeName ?? '—'}
                                    </strong>
                                    <span>
                                      (ID: #{cand.familyId}, ślub: {cand.weddingYear ?? '—'})
                                    </span>
                                    <span className={styles.confidencePill}>
                                      Pewność: {cand.confidenceScore}%
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    data-testid={`match-family-${fam.gedRefId}-${String(
                                      cand.familyId
                                    )}`}
                                    onClick={() => {
                                      handleSelectFamilyDecision(
                                        fam.gedRefId,
                                        'MATCH',
                                        cand.familyId
                                      );
                                    }}
                                    className={`${styles.btnChoice} ${
                                      isSelected ? styles.btnChoiceSelectedMatch : ''
                                    }`}
                                  >
                                    {isSelected ? '✓ Wybrano (połącz)' : 'Połącz z tą rodziną'}
                                  </button>
                                </div>
                                <div className={styles.reasonsList}>
                                  {cand.matchReasons.map(reason => (
                                    <span key={reason} className={styles.reasonChip}>
                                      {translateMatchReason(reason)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.matchCardFooter}>
                        <button
                          type="button"
                          data-testid={`create-new-family-${fam.gedRefId}`}
                          onClick={() => {
                            handleSelectFamilyDecision(fam.gedRefId, 'CREATE_NEW', null);
                          }}
                          className={`${styles.btnChoice} ${
                            currentDecision?.action === 'CREATE_NEW'
                              ? styles.btnChoiceSelectedNew
                              : ''
                          }`}
                        >
                          {currentDecision?.action === 'CREATE_NEW'
                            ? '✓ Utwórz jako nową rodzinę'
                            : '+ Utwórz jako nową rodzinę'}
                        </button>

                        <div className={styles.lookupGroup}>
                          <input
                            type="text"
                            placeholder="Szukaj rodziny w bazie..."
                            value={familyLookupQuery[fam.gedRefId] ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setFamilyLookupQuery(prev => ({
                                ...prev,
                                [fam.gedRefId]: val,
                              }));
                            }}
                            className={styles.lookupInput}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void handleSearchFamilies(fam.gedRefId);
                            }}
                            className={styles.btnSecondary}
                          >
                            Szukaj
                          </button>
                        </div>
                      </div>

                      {lookupList.length > 0 && (
                        <div className={styles.lookupResultsBox}>
                          {lookupList.map(item => {
                            const isManualFamSelected =
                              currentDecision?.action === 'MATCH' &&
                              currentDecision.targetFamilyId === item.familyId;

                            return (
                              <div
                                key={item.familyId}
                                className={`${styles.candidateItem} ${
                                  isManualFamSelected ? styles.candidateItemSelected : ''
                                }`}
                              >
                                <div className={styles.candidateTopRow}>
                                  <span>
                                    <strong>
                                      {item.husbandName ?? '—'} + {item.wifeName ?? '—'}
                                    </strong>{' '}
                                    (ID: #{item.familyId}, ślub: {item.weddingYear ?? '—'})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectFamilyDecision(
                                        fam.gedRefId,
                                        'MATCH',
                                        item.familyId
                                      );
                                    }}
                                    className={`${styles.btnChoice} ${
                                      isManualFamSelected ? styles.btnChoiceSelectedMatch : ''
                                    }`}
                                  >
                                    {isManualFamSelected
                                      ? '✓ Wybrano (połącz)'
                                      : 'Wybierz tę rodzinę'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

              <div className={styles.wizardFooter}>
                <button
                  type="button"
                  data-testid="back-to-individuals-button"
                  onClick={() => {
                    setViewStep('INDIVIDUALS');
                  }}
                  className={styles.btnSecondary}
                >
                  ← Wróć do osób
                </button>
                <button
                  type="button"
                  data-testid="confirm-families-button"
                  disabled={unresolvedFamiliesCount > 0 || isSubmitting}
                  onClick={() => {
                    void handleConfirmFamilies();
                  }}
                  className={styles.btnPrimary}
                >
                  Zatwierdź rodziny i przejdź do podsumowania →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUMMARY & ABSENT PEOPLE */}
          {viewStep === 'SUMMARY' && (
            <div className={styles.matchList}>
              {activeSession.summaryPreview && (
                <div className={styles.summaryGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Nowe osoby</span>
                    <span className={styles.statValue}>
                      +{activeSession.summaryPreview.individualsToCreate}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Aktualizowane osoby</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.individualsToUpdate}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Osoby bez zmian</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.individualsUnchanged}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Nieobecne osoby z bazy</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.absentPersonsCount}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Nowe rodziny</span>
                    <span className={styles.statValue}>
                      +{activeSession.summaryPreview.familiesToCreate}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Aktualizowane rodziny</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.familiesToUpdate}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Rodziny bez zmian</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.familiesUnchanged}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Usuwane rodziny</span>
                    <span className={styles.statValue}>
                      {activeSession.summaryPreview.familiesToDelete}
                    </span>
                  </div>
                </div>
              )}

              {activeSession.absentPeople.length > 0 && (
                <div className={styles.absentList}>
                  <h3 className={styles.sectionTitle}>
                    Osoby obecne w bazie, których nie ma w nowym pliku GEDCOM (
                    {activeSession.absentPeople.length})
                  </h3>
                  {activeSession.absentPeople.map(absent => {
                    const currentChoice = absentDecisions[absent.personId] ?? 'ARCHIVE';

                    return (
                      <div key={absent.personId} className={styles.absentRow}>
                        <div>
                          <strong className={styles.recordTitle}>
                            {absent.givenName} {absent.surname}
                          </strong>{' '}
                          <span className={styles.pageSubtitle}>
                            (ur. {absent.birthYear ?? '—'}, zm. {absent.deathYear ?? '—'})
                          </span>
                          {!absent.canBeDeleted && (
                            <div>
                              <span className={styles.blockReasonWarning}>
                                🔒 Blokada usunięcia:{' '}
                                {absent.deletionBlockReasons.map(translateBlockReason).join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className={styles.radioGroup}>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name={`absent-${String(absent.personId)}`}
                              checked={currentChoice === 'ARCHIVE'}
                              onChange={() => {
                                setAbsentDecisions(prev => ({
                                  ...prev,
                                  [absent.personId]: 'ARCHIVE',
                                }));
                              }}
                            />
                            <span>📦 Zarchiwizuj</span>
                          </label>
                          <label
                            className={`${styles.radioLabel} ${
                              !absent.canBeDeleted ? styles.radioLabelDisabled : ''
                            }`}
                          >
                            <input
                              type="radio"
                              data-testid={`absent-delete-radio-${String(absent.personId)}`}
                              name={`absent-${String(absent.personId)}`}
                              disabled={!absent.canBeDeleted}
                              checked={currentChoice === 'DELETE'}
                              onChange={() => {
                                setAbsentDecisions(prev => ({
                                  ...prev,
                                  [absent.personId]: 'DELETE',
                                }));
                              }}
                            />
                            <span>🗑️ Usuń całkowicie</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={styles.wizardFooter}>
                <button
                  type="button"
                  onClick={() => {
                    setViewStep('FAMILIES');
                  }}
                  className={styles.btnSecondary}
                >
                  ← Wróć do rodzin
                </button>
                <button
                  type="button"
                  data-testid="apply-import-button"
                  disabled={isSubmitting}
                  onClick={() => {
                    void handleApplyImport();
                  }}
                  className={styles.btnSuccess}
                >
                  {isSubmitting ? 'Zapisywanie zmian...' : '✓ Zatwierdź i wykonaj import'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* IMPORT HISTORY SECTION */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Historia zakończonych importów</h2>
        {history.length === 0 ? (
          <p className={styles.pageSubtitle}>Brak zakończonych importów w historii.</p>
        ) : (
          <div className={styles.historyList}>
            {history.map(item => (
              <div key={item.sessionId} className={styles.historyCard}>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Sesja</span>
                  <span className={styles.historyCellValue}>
                    <span className={styles.xrefBadge}>#{item.sessionId}</span>
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Nazwa pliku</span>
                  <strong className={styles.historyCellValue}>{item.fileName ?? '—'}</strong>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Źródło</span>
                  <span className={styles.sourceBadge}>{item.sourceSystem ?? '—'}</span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Data importu</span>
                  <span className={styles.historyCellValue}>
                    {formatPolishDateTime(item.createdAt)}
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Podsumowanie osób</span>
                  <span className={styles.historyCellValue}>
                    {item.summaryPreview
                      ? `Nowe: ${String(
                          item.summaryPreview.individualsToCreate
                        )}, zaktualizowane: ${String(
                          item.summaryPreview.individualsToUpdate
                        )}, bez zmian: ${String(item.summaryPreview.individualsUnchanged)}`
                      : '—'}
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <button
                    type="button"
                    data-testid={`restore-session-button-${String(item.sessionId)}`}
                    

                    disabled={isSubmitting || activeSession !== null}
                    onClick={() => {
                      void handleRestoreSession(item.sessionId);
                    }}
                    className={styles.btnSecondary}
                  >
                    ↺ Przywróć ten stan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}