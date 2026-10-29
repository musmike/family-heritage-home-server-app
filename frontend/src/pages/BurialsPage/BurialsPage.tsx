import { useState, useEffect, useRef, use } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { burialApi } from '../../api/burialApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './BurialsPage.module.css';
import type {
  BurialPersonItemDto,
  BurialsOverviewDto,
  CemeteryGroupDto,
} from '../../types/burial';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

export const MANAGEMENT_TYPE_OPTIONS = [
  { value: 'PARISH', label: 'Parafialny' },
  { value: 'MUNICIPAL', label: 'Komunalny' },
  { value: 'MILITARY', label: 'Wojskowy' },
  { value: 'DENOMINATIONAL', label: 'Wyznaniowy (gminy wyznaniowej)' },
  { value: 'PRIVATE', label: 'Prywatny / Rodzinny' },
  { value: 'STATE', label: 'Państwowy' },
  { value: 'OTHER', label: 'Inny' },
];

export const DENOMINATION_OPTIONS = [
  { value: 'ROMAN_CATHOLIC', label: 'Rzymskokatolicki' },
  { value: 'GREEK_CATHOLIC', label: 'Greckokatolicki' },
  { value: 'ORTHODOX', label: 'Prawosławny' },
  { value: 'PROTESTANT', label: 'Ewangelicki' },
  { value: 'JEWISH', label: 'Żydowski' },
  { value: 'MUSLIM', label: 'Muzułmański' },
  { value: 'SECULAR', label: 'Świecki / Wielowyznaniowy' },
  { value: 'OTHER', label: 'Inny' },
];

const GRAVE_TYPE_OPTIONS = [
  { value: 'SINGLE', label: 'Pojedynczy' },
  { value: 'FAMILY', label: 'Rodzinny' },
  { value: 'EARTH', label: 'Ziemny' },
  { value: 'VAULT', label: 'Murowany / Grobowiec' },
  { value: 'URN', label: 'Urnowy' },
  { value: 'COLUMBARIUM', label: 'Kolumbarium' },
  { value: 'CATACOMB', label: 'Katakumby' },
  { value: 'SYMBOLIC', label: 'Symboliczny' },
  { value: 'MASS', label: 'Zbiorowy' },
  { value: 'OTHER', label: 'Inny' },
];

const formatPersonDisplayName = (b: { givenName: string | null; surname: string | null }): string =>
  `${b.givenName ?? ''} ${b.surname ?? ''}`.trim() || '—';

const formatCompactYears = (item: BurialPersonItemDto): string => {
  const b = item.birthYear !== null ? String(item.birthYear) : '?';
  const d = item.deathYear !== null ? String(item.deathYear) : '?';
  return `${b} – ${d}`;
};

const getBorderClass = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return styles.borderMale;
  if (sex === 'FEMALE') return styles.borderFemale;
  return styles.borderNeutral;
};

const getCemeteryKey = (group: CemeteryGroupDto): string =>
  group.otherGroup ? 'OTHER' : String(group.cemeteryId);

const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${String(Math.max(44, el.scrollHeight))}px`;
};

export default function BurialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCemeteryKey = searchParams.get('cemetery');
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [overview, setOverview] = useState<BurialsOverviewDto | null>(null);
  const [selectedCemeteryKey, setSelectedCemeteryKey] = useState<string | null>(
    initialCemeteryKey
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCemeteryDescExpanded, setIsCemeteryDescExpanded] = useState<boolean>(false);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [sexFilter, setSexFilter] = useState<string>('ALL');
  const [includeNonCurrent, setIncludeNonCurrent] = useState<boolean>(false);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('SURNAME_ASC');

  // Admin Cemetery Form State
  const [showCemeteryForm, setShowCemeteryForm] = useState<boolean>(false);
  const [editingCemeteryId, setEditingCemeteryId] = useState<number | null>(null);
  const [cemName, setCemName] = useState<string>('');
  const [cemManagementType, setCemManagementType] = useState<string>('');
  const [cemDenomination, setCemDenomination] = useState<string>('');
  const [cemLocationName, setCemLocationName] = useState<string>('');
  const [cemDescription, setCemDescription] = useState<string>('');
  const cemDescRef = useRef<HTMLTextAreaElement | null>(null);

  // Admin Create New Grave Form State
  const [showCreateGraveForm, setShowCreateGraveForm] = useState<boolean>(false);
  const [newGraveCemeteryId, setNewGraveCemeteryId] = useState<number | null>(null);
  const [newGraveType, setNewGraveType] = useState<string>('');
  const [newGraveSection, setNewGraveSection] = useState<string>('');
  const [newGraveSector, setNewGraveSector] = useState<string>('');
  const [newGraveRow, setNewGraveRow] = useState<string>('');
  const [newGraveNumber, setNewGraveNumber] = useState<string>('');
  const [newGraveDesc, setNewGraveDesc] = useState<string>('');
  const [newGraveEpitaph, setNewGraveEpitaph] = useState<string>('');
  const [newGravePersonId, setNewGravePersonId] = useState<number | null>(null);
  const [newGravePersonLabel, setNewGravePersonLabel] = useState<string | null>(null);
  const [newGravePersonSearch, setNewGravePersonSearch] = useState<string>('');
  const [newGravePersonResults, setNewGravePersonResults] = useState<PersonListItemDto[]>([]);
  const newGraveDescRef = useRef<HTMLTextAreaElement | null>(null);
  const newGraveEpitaphRef = useRef<HTMLTextAreaElement | null>(null);

  // Admin Bulk Assign Graves State
  const [showBulkAssignPanel, setShowBulkAssignPanel] = useState<boolean>(false);
  const [bulkSearchQuery, setBulkSearchQuery] = useState<string>('');
  const [selectedGraveIds, setSelectedGraveIds] = useState<number[]>([]);
  const [targetCemeteryIdInOther, setTargetCemeteryIdInOther] = useState<number | null>(null);

  useEffect(() => {
    const syncAllTextareas = () => {
      adjustTextareaHeight(cemDescRef.current);
      adjustTextareaHeight(newGraveDescRef.current);
      adjustTextareaHeight(newGraveEpitaphRef.current);
    };
    syncAllTextareas();

    window.addEventListener('resize', syncAllTextareas);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncAllTextareas();
          })
        : null;

    if (observer) {
      if (cemDescRef.current) observer.observe(cemDescRef.current);
      if (newGraveDescRef.current) observer.observe(newGraveDescRef.current);
      if (newGraveEpitaphRef.current) observer.observe(newGraveEpitaphRef.current);
    }

    return () => {
      window.removeEventListener('resize', syncAllTextareas);
      observer?.disconnect();
    };
  }, [showCemeteryForm, cemDescription, showCreateGraveForm, newGraveDesc, newGraveEpitaph]);

  const fetchBurials = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await burialApi.getBurialsOverview({
        search,
        sex: sexFilter,
        includeNonCurrent,
        includeArchived,
        sortBy,
      });
      setOverview(data);
    } catch {
      setErrorMessage('Nie udało się pobrać listy grobów i cmentarzy.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchBurials();
  }, [search, sexFilter, includeNonCurrent, includeArchived, sortBy]);

  const activeCemeteryGroup =
    overview && selectedCemeteryKey
      ? overview.cemeteryGroups.find(g => getCemeteryKey(g) === selectedCemeteryKey) ?? null
      : null;

  const customCemeteries =
    overview?.cemeteryGroups.filter(g => !g.otherGroup && g.cemeteryId !== null) ?? [];

  const unassignedGravesInOther =
    overview?.cemeteryGroups.find(g => g.otherGroup)?.graves ?? [];

  const filteredUnassignedForModal = unassignedGravesInOther.filter(g => {
    const q = bulkSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return g.burials.some(b => {
      const text = `${b.givenName ?? ''} ${b.surname ?? ''} ${b.placeDescription ?? ''}`.toLowerCase();
      return text.includes(q);
    });
  });

  const handleSelectCemetery = (key: string | null) => {
    setSelectedCemeteryKey(key);
    setShowCemeteryForm(false);
    setShowCreateGraveForm(false);
    setShowBulkAssignPanel(false);
    setSelectedGraveIds([]);
    setIsCemeteryDescExpanded(false);
    if (key) {
      setSearchParams({ cemetery: key });
    } else {
      setSearchParams({});
    }
  };

  const toggleGraveSelection = (graveId: number) => {
    setSelectedGraveIds(prev =>
      prev.includes(graveId) ? prev.filter(id => id !== graveId) : [...prev, graveId]
    );
  };

  const handleBulkAssignToCemetery = async (cemeteryId: number | null) => {
    if (cemeteryId === null || selectedGraveIds.length === 0) return;
    setErrorMessage(null);
    try {
      await burialApi.assignGravesToCemetery(cemeteryId, selectedGraveIds);
      setSelectedGraveIds([]);
      setShowBulkAssignPanel(false);
      await fetchBurials();
    } catch {
      setErrorMessage('Nie udało się przypisać zaznaczonych grobów do cmentarza.');
    }
  };

  const openCreateCemeteryForm = () => {
    setEditingCemeteryId(null);
    setCemName('');
    setCemManagementType('');
    setCemDenomination('');
    setCemLocationName('');
    setCemDescription('');
    setShowCreateGraveForm(false);
    setShowCemeteryForm(true);
  };

  const openEditCemeteryForm = (group: CemeteryGroupDto) => {
    if (group.cemeteryId === null) return;
    setEditingCemeteryId(group.cemeteryId);
    setCemName(group.groupName);
    setCemManagementType(group.managementType ?? '');
    setCemDenomination(group.denomination ?? '');
    setCemLocationName(group.locationName ?? '');
    setCemDescription(group.description ?? '');
    setShowCreateGraveForm(false);
    setShowCemeteryForm(true);
  };

  const openNewGraveModal = () => {
    setNewGraveCemeteryId(
      activeCemeteryGroup && !activeCemeteryGroup.otherGroup
        ? activeCemeteryGroup.cemeteryId
        : null
    );
    setNewGraveType('');
    setNewGraveSection('');
    setNewGraveSector('');
    setNewGraveRow('');
    setNewGraveNumber('');
    setNewGraveDesc('');
    setNewGraveEpitaph('');
    setNewGravePersonId(null);
    setNewGravePersonLabel(null);
    setNewGravePersonSearch('');
    setNewGravePersonResults([]);
    setShowCemeteryForm(false);
    setShowCreateGraveForm(true);
  };

  const handleSearchNewGravePerson = async () => {
    try {
      const page = await biographyApi.listPeople({
        search: newGravePersonSearch,
        includeArchived: true,
        page: 0,
        size: 8,
      });
      setNewGravePersonResults(page.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleCreateGrave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const created = await burialApi.createGrave({
        cemeteryId: newGraveCemeteryId,
        graveType: newGraveType || null,
        section: newGraveSection.trim() || null,
        sector: newGraveSector.trim() || null,
        rowNumber: newGraveRow.trim() || null,
        graveNumber: newGraveNumber.trim() || null,
        description: newGraveDesc.trim() || null,
        epitaph: newGraveEpitaph.trim() || null,
        initialPersonId: newGravePersonId,
      });
      setShowCreateGraveForm(false);
      void navigate(`/burials/graves/${String(created.graveId)}`);
    } catch {
      setErrorMessage('Nie udało się utworzyć nowego nagrobka.');
    }
  };

  const handleSaveCemetery = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const payload = {
        name: cemName.trim(),
        managementType: cemManagementType || null,
        denomination: cemDenomination || null,
        locationName: cemLocationName.trim() || null,
        description: cemDescription.trim() || null,
      };

      if (editingCemeteryId === null) {
        await burialApi.createCemetery(payload);
      } else {
        await burialApi.updateCemetery(editingCemeteryId, payload);
      }
      setShowCemeteryForm(false);
      await fetchBurials();
    } catch {
      setErrorMessage('Nie udało się zapisać danych cmentarza.');
    }
  };

  const handleDeleteCemetery = async (cemeteryId: number) => {
    setErrorMessage(null);
    try {
      await burialApi.deleteCemetery(cemeteryId);
      handleSelectCemetery(null);
      await fetchBurials();
    } catch {
      setErrorMessage('Nie udało się usunąć cmentarza.');
    }
  };

  const isLongCemeteryDescription =
    (activeCemeteryGroup?.description?.length ?? 0) > 220 ||
    (activeCemeteryGroup?.description?.split('\n').length ?? 0) > 3;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div style={{ flex: '1 1 320px' }}>
          <h1 className={styles.pageTitle}>
            {activeCemeteryGroup ? activeCemeteryGroup.groupName : 'Groby i cmentarze'}
          </h1>
          <p className={styles.pageSubtitle}>
            {activeCemeteryGroup
              ? 'Przeglądaj nagrobki przypisane do wybranego cmentarza i kliknij w nagrobek, aby zobaczyć jego pełne szczegóły.'
              : 'Wybierz cmentarz z listy, aby wyświetlić znajdujące się na nim nagrobki.'}
          </p>

          {activeCemeteryGroup && !activeCemeteryGroup.otherGroup && (
            <div className={styles.cemeteryMetaPills}>
              {activeCemeteryGroup.managementTypeLabel && (
                <span className={styles.metaPill}>
                  🏛️ Zarządca: {activeCemeteryGroup.managementTypeLabel}
                </span>
              )}
              {activeCemeteryGroup.denominationLabel && (
                <span className={styles.metaPill}>
                  ✝️ Wyznanie: {activeCemeteryGroup.denominationLabel}
                </span>
              )}
              {activeCemeteryGroup.locationName && (
                <span className={styles.metaPill}>
                  📍 Miejscowość: {activeCemeteryGroup.locationName}
                </span>
              )}
            </div>
          )}

          {activeCemeteryGroup?.description && (
            <div
              className={styles.cemeteryDescriptionBanner}
              data-testid="cemetery-description-banner"
            >
              <div
                className={
                  isLongCemeteryDescription && !isCemeteryDescExpanded
                    ? styles.descriptionClamped
                    : ''
                }
              >
                {activeCemeteryGroup.description}
              </div>
              {isLongCemeteryDescription && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCemeteryDescExpanded(prev => !prev);
                  }}
                  className={styles.expandTextBtn}
                >
                  {isCemeteryDescExpanded ? 'Zwiń opis ▴' : 'Rozwiń pełny opis ▾'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.headerRight}>
          {activeCemeteryGroup && (
            <button
              type="button"
              data-testid="back-to-cemeteries-button"
              onClick={() => {
                handleSelectCemetery(null);
              }}
              className={styles.btnSecondary}
            >
              ← Wróć do listy cmentarzy
            </button>
          )}

          {isAdmin && !activeCemeteryGroup && (
            <button
              type="button"
              data-testid="open-create-cemetery-button"
              onClick={openCreateCemeteryForm}
              className={styles.btnPrimary}
            >
              + Dodaj cmentarz
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              data-testid="open-create-grave-button"
              onClick={openNewGraveModal}
              className={styles.btnSecondary}
            >
              + Dodaj nagrobek
            </button>
          )}

          {isAdmin &&
            activeCemeteryGroup &&
            !activeCemeteryGroup.otherGroup &&
            activeCemeteryGroup.cemeteryId !== null && (
              <>
                {unassignedGravesInOther.length > 0 && (
                  <button
                    type="button"
                    data-testid="open-bulk-assign-panel-button"
                    onClick={() => {
                      setShowBulkAssignPanel(prev => !prev);
                      setSelectedGraveIds([]);
                    }}
                    className={styles.btnPrimary}
                  >
                    📥 Przypisz groby z kategorii Inne ({unassignedGravesInOther.length})
                  </button>
                )}
                <button
                  type="button"
                  data-testid="edit-cemetery-button"
                  onClick={() => {
                    openEditCemeteryForm(activeCemeteryGroup);
                  }}
                  className={styles.btnSecondary}
                >
                  ✏️ Edytuj cmentarz
                </button>
                <button
                  type="button"
                  data-testid="delete-cemetery-button"
                  onClick={() => {
                    if (activeCemeteryGroup.cemeteryId !== null) {
                      void handleDeleteCemetery(activeCemeteryGroup.cemeteryId);
                    }
                  }}
                  className={styles.btnDanger}
                >
                  🗑️ Usuń cmentarz
                </button>
              </>
            )}

          {overview && (
            <div className={styles.statsBadge}>
              Groby:{' '}
              <strong>
                {activeCemeteryGroup
                  ? activeCemeteryGroup.graves.length
                  : overview.totalGravesCount}
              </strong>{' '}
              • Pochowane osoby:{' '}
              <strong>
                {activeCemeteryGroup
                  ? activeCemeteryGroup.totalBurialsCount
                  : overview.totalBurialsCount}
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Admin Create / Edit Cemetery Form */}
      {isAdmin && showCemeteryForm && (
        <section className={styles.adminFormCard} data-testid="cemetery-form-section">
          <h2 className={styles.cemeteryCardTitle}>
            {editingCemeteryId === null ? 'Dodaj nowy cmentarz' : 'Edycja cmentarza'}
          </h2>
          <form
            onSubmit={e => {
              void handleSaveCemetery(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
          >
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label htmlFor="cem-name-input" className={styles.filterLabel}>
                  Nazwa cmentarza *
                </label>
                <input
                  id="cem-name-input"
                  data-testid="cem-name-input"
                  type="text"
                  required
                  placeholder="np. Cmentarz Rakowicki"
                  value={cemName}
                  onChange={e => {
                    setCemName(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="cem-mgmt-select" className={styles.filterLabel}>
                  Sposób zarządzania
                </label>
                <select
                  id="cem-mgmt-select"
                  data-testid="cem-mgmt-select"
                  value={cemManagementType}
                  onChange={e => {
                    setCemManagementType(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Brak / Nieokreślony —</option>
                  {MANAGEMENT_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="cem-denom-select" className={styles.filterLabel}>
                  Wyznanie
                </label>
                <select
                  id="cem-denom-select"
                  data-testid="cem-denom-select"
                  value={cemDenomination}
                  onChange={e => {
                    setCemDenomination(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Brak / Nieokreślony —</option>
                  {DENOMINATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="cem-loc-input" className={styles.filterLabel}>
                  Miejscowość
                </label>
                <input
                  id="cem-loc-input"
                  type="text"
                  placeholder="np. Kraków"
                  value={cemLocationName}
                  onChange={e => {
                    setCemLocationName(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.formField}>
              <label htmlFor="cem-desc-input" className={styles.filterLabel}>
                Opis tekstowy cmentarza (wyświetlany na karcie oraz po wejściu w cmentarz)
              </label>
              <textarea
                id="cem-desc-input"
                ref={cemDescRef}
                data-testid="cem-desc-input"
                placeholder="Dodatkowe informacje o historii cmentarza, godzinach otwarcia lub położeniu..."
                value={cemDescription}
                onChange={e => {
                  setCemDescription(e.target.value);
                  adjustTextareaHeight(e.target);
                }}
                className={styles.textareaInput}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCemeteryForm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="submit"
                data-testid="save-cemetery-button"
                className={styles.btnPrimary}
              >
                Zapisz cmentarz
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Admin Create New Grave Form */}
      {isAdmin && showCreateGraveForm && (
        <section className={styles.adminFormCard} data-testid="create-grave-form-section">
          <h2 className={styles.cemeteryCardTitle}>Dodaj nowy nagrobek</h2>
          <form
            onSubmit={e => {
              void handleCreateGrave(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
          >
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label htmlFor="new-grave-cem-select" className={styles.filterLabel}>
                  Cmentarz
                </label>
                <select
                  id="new-grave-cem-select"
                  value={newGraveCemeteryId !== null ? String(newGraveCemeteryId) : ''}
                  onChange={e => {
                    const val = e.target.value;
                    setNewGraveCemeteryId(val === '' ? null : Number(val));
                  }}
                  className={styles.selectInput}
                >
                  <option value="">Inne (nieprzypisany)</option>
                  {customCemeteries.map(c => (
                    <option key={String(c.cemeteryId)} value={String(c.cemeteryId)}>
                      {c.groupName} {c.locationName ? `(${c.locationName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-grave-type-select" className={styles.filterLabel}>
                  Typ grobu
                </label>
                <select
                  id="new-grave-type-select"
                  value={newGraveType}
                  onChange={e => {
                    setNewGraveType(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Nieokreślony —</option>
                  {GRAVE_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-grave-section-input" className={styles.filterLabel}>
                  Kwatera
                </label>
                <input
                  id="new-grave-section-input"
                  data-testid="new-grave-section-input"
                  type="text"
                  value={newGraveSection}
                  onChange={e => {
                    setNewGraveSection(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-grave-sector-input" className={styles.filterLabel}>
                  Sektor
                </label>
                <input
                  id="new-grave-sector-input"
                  type="text"
                  value={newGraveSector}
                  onChange={e => {
                    setNewGraveSector(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-grave-row-input" className={styles.filterLabel}>
                  Rząd
                </label>
                <input
                  id="new-grave-row-input"
                  type="text"
                  value={newGraveRow}
                  onChange={e => {
                    setNewGraveRow(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-grave-number-input" className={styles.filterLabel}>
                  Numer grobu
                </label>
                <input
                  id="new-grave-number-input"
                  type="text"
                  value={newGraveNumber}
                  onChange={e => {
                    setNewGraveNumber(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.formField}>
              <label htmlFor="new-grave-desc-input" className={styles.filterLabel}>
                Opis lokalizacji / punkty orientacyjne (np. charakterystyczne drzewa, alejka)
              </label>
              <textarea
                id="new-grave-desc-input"
                ref={newGraveDescRef}
                value={newGraveDesc}
                onChange={e => {
                  setNewGraveDesc(e.target.value);
                  adjustTextareaHeight(e.target);
                }}
                className={styles.textareaInput}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="new-grave-epitaph-input" className={styles.filterLabel}>
                Epitafium na nagrobku
              </label>
              <textarea
                id="new-grave-epitaph-input"
                ref={newGraveEpitaphRef}
                value={newGraveEpitaph}
                onChange={e => {
                  setNewGraveEpitaph(e.target.value);
                  adjustTextareaHeight(e.target);
                }}
                className={styles.textareaInput}
              />
            </div>

            <div className={styles.formField}>
              <span className={styles.filterLabel}>
                Pierwsza pochowana osoba (opcjonalnie):{' '}
                <strong style={{ color: '#0f172a' }}>
                  {newGravePersonLabel ?? 'Brak wybranej osoby'}
                </strong>
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Wyszukaj osobę po imieniu lub nazwisku..."
                  value={newGravePersonSearch}
                  onChange={e => {
                    setNewGravePersonSearch(e.target.value);
                  }}
                  className={styles.textInput}
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSearchNewGravePerson();
                  }}
                  className={styles.btnSecondary}
                >
                  Szukaj osoby
                </button>
                {newGravePersonId !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewGravePersonId(null);
                      setNewGravePersonLabel(null);
                    }}
                    className={styles.btnSecondary}
                  >
                    Wyczyść wybór
                  </button>
                )}
              </div>

              {newGravePersonResults.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.4rem' }}>
                  {newGravePersonResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setNewGravePersonId(p.id);
                        setNewGravePersonLabel(formatPersonDisplayName(p));
                        setNewGravePersonResults([]);
                      }}
                      className={styles.btnSecondary}
                    >
                      ✓ Wybierz: {formatPersonDisplayName(p)} ({p.birthYear ?? '?'}–
                      {p.deathYear ?? '?'})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateGraveForm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="submit"
                data-testid="submit-create-grave-button"
                className={styles.btnPrimary}
              >
                Utwórz nagrobek
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Admin Bulk Assign Panel inside a Specific Cemetery */}
      {isAdmin &&
        showBulkAssignPanel &&
        activeCemeteryGroup &&
        !activeCemeteryGroup.otherGroup &&
        activeCemeteryGroup.cemeteryId !== null && (
          <section className={styles.adminFormCard} data-testid="bulk-assign-panel">
            <div className={styles.bulkToolbar}>
              <div>
                <h2 className={styles.cemeteryCardTitle}>
                  Przypisz groby z kategorii „Inne” do: {activeCemeteryGroup.groupName}
                </h2>
                <p className={styles.pageSubtitle}>
                  Zaznacz groby na podstawie miejsca pochówku z pliku GEDCOM i przypisz je jednym kliknięciem.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGraveIds(filteredUnassignedForModal.map(g => g.graveId));
                  }}
                  className={styles.btnSecondary}
                >
                  Zaznacz wszystkie widoczne ({filteredUnassignedForModal.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGraveIds([]);
                  }}
                  className={styles.btnSecondary}
                >
                  Odznacz wszystkie
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Filtruj groby z kategorii Inne (np. wpisz miejscowość lub nazwę cmentarza z GEDCOM)..."
              value={bulkSearchQuery}
              onChange={e => {
                setBulkSearchQuery(e.target.value);
              }}
              className={styles.textInput}
            />

            <div className={styles.bulkAssignList}>
              {filteredUnassignedForModal.map(g => {
                const isChecked = selectedGraveIds.includes(g.graveId);
                const peopleNames = g.burials
                  .map(b => `${formatPersonDisplayName(b)} (${formatCompactYears(b)})`)
                  .join(', ');
                const gedcomPlaces = Array.from(
                  new Set(
                    g.burials
                      .map(b => b.placeDescription)
                      .filter((p): p is string => Boolean(p))
                  )
                ).join(' | ');

                return (
                  <label
                    key={g.graveId}
                    className={`${styles.bulkAssignItem} ${
                      isChecked ? styles.bulkAssignItemSelected : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      data-testid={`bulk-checkbox-grave-${String(g.graveId)}`}
                      checked={isChecked}
                      onChange={() => {
                        toggleGraveSelection(g.graveId);
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                        {peopleNames || 'Pusty nagrobek'}
                      </strong>
                      {gedcomPlaces && (
                        <span className={styles.compactGedcomPlace}>
                          Pochowano w: {gedcomPlaces}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowBulkAssignPanel(false);
                }}
                className={styles.btnSecondary}
              >
                Zamknij
              </button>
              <button
                type="button"
                data-testid="confirm-bulk-assign-button"
                disabled={selectedGraveIds.length === 0}
                onClick={() => {
                  void handleBulkAssignToCemetery(activeCemeteryGroup.cemeteryId);
                }}
                className={styles.btnPrimary}
              >
                ✓ Przypisz zaznaczone groby ({selectedGraveIds.length}) do tego cmentarza
              </button>
            </div>
          </section>
        )}

      {/* Admin Bulk Assign Bar directly inside the "Inne" View (Only when at least 1 cemetery exists) */}
      {isAdmin && activeCemeteryGroup?.otherGroup && customCemeteries.length > 0 && (
        <section className={styles.adminFormCard} data-testid="other-bulk-assign-bar">
          <div className={styles.bulkToolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1 }}>
              <span className={styles.filterLabel}>
                Szybkie przypisywanie do cmentarza:
              </span>
              <select
                data-testid="other-target-cemetery-select"
                value={targetCemeteryIdInOther !== null ? String(targetCemeteryIdInOther) : ''}
                onChange={e => {
                  const val = e.target.value;
                  setTargetCemeteryIdInOther(val === '' ? null : Number(val));
                }}
                className={styles.selectInput}
                style={{ maxWidth: '320px' }}
              >
                <option value="">— Wybierz docelowy cmentarz —</option>
                {customCemeteries.map(c => (
                  <option key={String(c.cemeteryId)} value={String(c.cemeteryId)}>
                    {c.groupName} {c.locationName ? `(${c.locationName})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSelectedGraveIds(activeCemeteryGroup.graves.map(g => g.graveId));
                }}
                className={styles.btnSecondary}
              >
                Zaznacz wszystkie widoczne ({activeCemeteryGroup.graves.length})
              </button>
              {selectedGraveIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGraveIds([]);
                  }}
                  className={styles.btnSecondary}
                >
                  Wyczyść ({selectedGraveIds.length})
                </button>
              )}
            </div>

            <button
              type="button"
              data-testid="other-bulk-assign-submit"
              disabled={targetCemeteryIdInOther === null || selectedGraveIds.length === 0}
              onClick={() => {
                void handleBulkAssignToCemetery(targetCemeteryIdInOther);
              }}
              className={styles.btnPrimary}
            >
              ✓ Przypisz zaznaczone ({selectedGraveIds.length}) do cmentarza
            </button>
          </div>
        </section>
      )}

      {/* Filters & Sorting Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="burial-search-input" className={styles.filterLabel}>
            Wyszukaj
          </label>
          <input
            id="burial-search-input"
            type="text"
            data-testid="burial-search-input"
            placeholder="Imię, nazwisko, cmentarz, kwatera..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
            }}
            className={styles.textInput}
          />
        </div>

        <div className={styles.filterField}>
          <label htmlFor="burial-sex-select" className={styles.filterLabel}>
            Płeć
          </label>
          <select
            id="burial-sex-select"
            data-testid="burial-sex-select"
            value={sexFilter}
            onChange={e => {
              setSexFilter(e.target.value);
            }}
            className={styles.selectInput}
          >
            <option value="ALL">Wszystkie</option>
            <option value="MALE">Mężczyźni</option>
            <option value="FEMALE">Kobiety</option>
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="burial-sort-select" className={styles.filterLabel}>
            Sortowanie
          </label>
          <select
            id="burial-sort-select"
            data-testid="burial-sort-select"
            value={sortBy}
            onChange={e => {
              setSortBy(e.target.value);
            }}
            className={styles.selectInput}
          >
            <option value="SURNAME_ASC">Nazwisko (A–Z)</option>
            <option value="SURNAME_DESC">Nazwisko (Z–A)</option>
            <option value="DEATH_DATE_ASC">Data śmierci (od najstarszych)</option>
            <option value="DEATH_DATE_DESC">Data śmierci (od najnowszych)</option>
            <option value="BURIAL_DATE_ASC">Data pochówku (od najstarszych)</option>
            <option value="BURIAL_DATE_DESC">Data pochówku (od najnowszych)</option>
          </select>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            data-testid="burial-noncurrent-checkbox"
            checked={includeNonCurrent}
            onChange={e => {
              setIncludeNonCurrent(e.target.checked);
            }}
          />
          <span>Pokaż nieaktualne miejsca pochówku</span>
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            data-testid="burial-archived-checkbox"
            checked={includeArchived}
            onChange={e => {
              setIncludeArchived(e.target.checked);
            }}
          />
          <span>Pokaż zarchiwizowane osoby</span>
        </label>
      </section>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <Loader size={42} />
      ) : !overview || overview.cemeteryGroups.length === 0 ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak zapisanych cmentarzy i grobów spełniających wybrane kryteria.
          </p>
        </div>
      ) : !activeCemeteryGroup ? (
        /* LEVEL 1: CEMETERIES GRID (With Clamped Description Snippet) */
        <div className={styles.cemeteriesGrid}>
          {overview.cemeteryGroups.map(group => {
            const key = getCemeteryKey(group);

            return (
              <button
                key={key}
                type="button"
                data-testid={`cemetery-card-${group.groupName}`}
                onClick={() => {
                  handleSelectCemetery(key);
                }}
                className={styles.cemeteryCard}
              >
                <div className={styles.cemeteryBannerPlaceholder} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.placeholderSvg}
                  >
                    <path d="M6 20V10a6 6 0 0 1 12 0v10" />
                    <path d="M4 20h16" />
                    <path d="M12 7v6" />
                    <path d="M9 10h6" />
                  </svg>
                </div>

                <div className={styles.cemeteryCardBody}>
                  <div>
                    <div className={styles.cemeteryCardTitle}>{group.groupName}</div>
                    {!group.otherGroup && (
                      <div className={styles.cemeteryMetaPills}>
                        {group.managementTypeLabel && (
                          <span className={styles.metaPill}>
                            {group.managementTypeLabel}
                          </span>
                        )}
                        {group.denominationLabel && (
                          <span className={styles.metaPill}>
                            {group.denominationLabel}
                          </span>
                        )}
                        {group.locationName && (
                          <span className={styles.metaPill}>📍 {group.locationName}</span>
                        )}
                      </div>
                    )}
                    {group.description && (
                      <p
                        className={styles.cemeteryCardDescSnippet}
                        data-testid={`cemetery-card-desc-${group.groupName}`}
                      >
                        {group.description}
                      </p>
                    )}
                  </div>

                  <div className={styles.cemeteryCardFooter}>
                    <span className={styles.cemeteryCountPill}>
                      Groby: {group.graves.length} • Osoby: {group.totalBurialsCount}
                    </span>
                    <span className={styles.cemeteryOpenHint}>Zobacz nagrobki →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* LEVEL 2: GRAVES OF THE SELECTED CEMETERY (Separate Full-Name Coordinate Pills) */
        <div className={styles.gravesList}>
          {activeCemeteryGroup.graves.length === 0 ? (
            <div className={styles.pageHeader}>
              <p className={styles.pageSubtitle}>
                Brak nagrobków przypisanych do tego cmentarza. Możesz dodać nowy nagrobek lub przypisać nagrobki z kategorii „Inne” za pomocą przycisków powyżej.
              </p>
            </div>
          ) : (
            activeCemeteryGroup.graves.map(grave => {
              const isSelectedForBulk = selectedGraveIds.includes(grave.graveId);

              return (
                <div
                  key={grave.graveId}
                  className={`${styles.graveRowCard} ${
                    isSelectedForBulk ? styles.graveRowCardSelected : ''
                  }`}
                  data-testid={`grave-card-${String(grave.graveId)}`}
                >
                  <div className={styles.gravePhotoPlaceholder} aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.placeholderSvg}
                    >
                      <path d="M6 20V10a6 6 0 0 1 12 0v10" />
                      <path d="M4 20h16" />
                      <path d="M12 7v6" />
                      <path d="M9 10h6" />
                    </svg>
                  </div>

                  <div className={styles.graveContentColumn}>
                    <div className={styles.graveTopBar}>
                      <div className={styles.graveTitleBadgeGroup}>
                        {/* Show bulk checkbox ONLY when at least one cemetery exists */}
                        {isAdmin &&
                          activeCemeteryGroup.otherGroup &&
                          customCemeteries.length > 0 && (
                            <label className={styles.graveCheckboxLabel}>
                              <input
                                type="checkbox"
                                data-testid={`other-grave-checkbox-${String(grave.graveId)}`}
                                checked={isSelectedForBulk}
                                onChange={() => {
                                  toggleGraveSelection(grave.graveId);
                                }}
                              />
                              <span>Zaznacz do przypisania</span>
                            </label>
                          )}

                        {grave.graveTypeLabel && (
                          <span className={styles.metaPill}>
                            Typ grobu: {grave.graveTypeLabel.toLowerCase()}
                          </span>
                        )}
                        {grave.section && (
                          <span className={styles.metaPill}>
                            Kwatera: {grave.section}
                          </span>
                        )}
                        {grave.sector && (
                          <span className={styles.metaPill}>
                            Sektor: {grave.sector}
                          </span>
                        )}
                        {grave.rowNumber && (
                          <span className={styles.metaPill}>
                            Rząd: {grave.rowNumber}
                          </span>
                        )}
                        {grave.graveNumber && (
                          <span className={styles.metaPill}>
                            Numer grobu: {grave.graveNumber}
                          </span>
                        )}
                      </div>

                      <Link
                        to={`/burials/graves/${String(grave.graveId)}`}
                        data-testid={`open-grave-details-${String(grave.graveId)}`}
                        className={styles.btnPrimary}
                      >
                        Szczegóły nagrobka →
                      </Link>
                    </div>

                    <div className={styles.compactPeopleGrid}>
                      {grave.burials.map(b => {
                        const fullName = formatPersonDisplayName(b);

                        return (
                          <div
                            key={b.burialId}
                            className={`${styles.compactPersonTile} ${getBorderClass(b.sex)}`}
                          >
                            <PersonAvatar sex={b.sex} size="sm" />
                            <div className={styles.compactPersonInfo}>
                              <span className={styles.compactPersonName}>{fullName}</span>
                              <span className={styles.compactPersonYears}>
                                {formatCompactYears(b)}
                                {!b.current ? ' • (nieaktualny)' : ''}
                              </span>
                              {activeCemeteryGroup.otherGroup && b.placeDescription && (
                                <span className={styles.compactGedcomPlace}>
                                  Pochowano w: {b.placeDescription}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
