import { useState, useEffect, use } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { burialApi } from '../../api/burialApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './BurialsPage.module.css';
import type {
  BurialPersonItemDto,
  BurialsOverviewDto,
  CemeteryGroupDto,
  GraveGroupDto,
} from '../../types/burial';
import type { PersonSex } from '../../types/biography';

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
  { value: 'ROMAN_CATHOLIC', label: 'Rzymskokatolickie' },
  { value: 'GREEK_CATHOLIC', label: 'Greckokatolickie' },
  { value: 'ORTHODOX', label: 'Prawosławne' },
  { value: 'PROTESTANT', label: 'Ewangelickie' },
  { value: 'JEWISH', label: 'Żydowskie' },
  { value: 'MUSLIM', label: 'Muzułmańskie' },
  { value: 'SECULAR', label: 'Świecki / Wielowyznaniowy' },
  { value: 'OTHER', label: 'Inne' },
];

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

const formatGraveShortLocation = (grave: GraveGroupDto): string | null => {
  const parts: string[] = [];
  if (grave.section) parts.push(`kw. ${grave.section}`);
  if (grave.sector) parts.push(`sek. ${grave.sector}`);
  if (grave.rowNumber) parts.push(`rząd ${grave.rowNumber}`);
  if (grave.graveNumber) parts.push(`nr ${grave.graveNumber}`);
  return parts.length > 0 ? parts.join(', ') : null;
};

export default function BurialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const handleSelectCemetery = (key: string | null) => {
    setSelectedCemeteryKey(key);
    setShowCemeteryForm(false);
    if (key) {
      setSearchParams({ cemetery: key });
    } else {
      setSearchParams({});
    }
  };

  const openCreateCemeteryForm = () => {
    setEditingCemeteryId(null);
    setCemName('');
    setCemManagementType('');
    setCemDenomination('');
    setCemLocationName('');
    setCemDescription('');
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
    setShowCemeteryForm(true);
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
              {activeCemeteryGroup.description}
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

          {isAdmin &&
            activeCemeteryGroup &&
            !activeCemeteryGroup.otherGroup &&
            activeCemeteryGroup.cemeteryId !== null && (
              <>
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
            {editingCemeteryId === null
              ? 'Dodaj nowy cmentarz'
              : `Edycja cmentarza #${String(editingCemeteryId)}`}
          </h2>
          <form
            onSubmit={e => {
              void handleSaveCemetery(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div className={styles.formGrid}>
              <div className={styles.filterField}>
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

              <div className={styles.filterField}>
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

              <div className={styles.filterField}>
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
                  <option value="">— Brak / Nieokreślone —</option>
                  {DENOMINATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterField}>
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

            <div className={styles.filterField}>
              <label htmlFor="cem-desc-input" className={styles.filterLabel}>
                Opis tekstowy cmentarza (wyświetlany na górze po wejściu w cmentarz)
              </label>
              <textarea
                id="cem-desc-input"
                data-testid="cem-desc-input"
                placeholder="Dodatkowe informacje o historii cmentarza, godzinach otwarcia lub położeniu..."
                value={cemDescription}
                onChange={e => {
                  setCemDescription(e.target.value);
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
            placeholder="Nazwisko, imię, cmentarz, kwatera..."
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
        /* LEVEL 1: CEMETERIES GRID */
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
        /* LEVEL 2: GRAVES OF THE SELECTED CEMETERY (Compact Person Mini-Tiles + Link to Grave Details) */
        <div className={styles.gravesList}>
          {activeCemeteryGroup.graves.length === 0 ? (
            <div className={styles.pageHeader}>
              <p className={styles.pageSubtitle}>
                Brak nagrobków przypisanych do tego cmentarza. Możesz przypisać nagrobki z kategorii „Inne” na stronie szczegółowej wybranego nagrobka.
              </p>
            </div>
          ) : (
            activeCemeteryGroup.graves.map(grave => {
              const shortLoc = formatGraveShortLocation(grave);

              return (
                <div
                  key={grave.graveId}
                  className={styles.graveRowCard}
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
                        <span>🪦 Nagrobek #{grave.graveId}</span>
                        {grave.graveTypeLabel && (
                          <span className={styles.metaPill}>{grave.graveTypeLabel}</span>
                        )}
                        {shortLoc && <span className={styles.metaPill}>📍 {shortLoc}</span>}
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
                        const fullName =
                          `${b.surname ?? ''} ${b.givenName ?? ''}`.trim() || '—';

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
                              {/* Show GEDCOM placeDescription on the card ONLY when the grave is in "Inne" */}
                              {activeCemeteryGroup.otherGroup && b.placeDescription && (
                                <span className={styles.compactGedcomPlace}>
                                  GEDCOM: {b.placeDescription}
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