import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { burialApi } from '../../api/burialApi';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './BurialsPage.module.css';
import type {
  BurialPersonItemDto,
  BurialsOverviewDto,
  CemeteryGroupDto,
} from '../../types/burial';
import type { PersonSex } from '../../types/biography';

const formatPolishAge = (age: number | null, approximate: boolean): string | null => {
  if (age === null) return null;
  const prefix = approximate ? 'ok. ' : '';
  if (age === 1) return `${prefix}1 rok`;
  const rem10 = age % 10;
  const rem100 = age % 100;
  if (rem10 >= 2 && rem10 <= 4 && (rem100 < 12 || rem100 > 14)) {
    return `${prefix}${String(age)} lata`;
  }
  return `${prefix}${String(age)} lat`;
};

const formatLifespan = (item: BurialPersonItemDto): string => {
  const b = item.birthYear !== null ? String(item.birthYear) : '?';
  const d = item.deathYear !== null ? String(item.deathYear) : '?';
  const ageStr = formatPolishAge(item.age, item.ageApproximate);
  const base = `${b} – ${d}`;
  return ageStr ? `${base} (${ageStr})` : base;
};

const getBorderClass = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return styles.borderMale;
  if (sex === 'FEMALE') return styles.borderFemale;
  return styles.borderNeutral;
};

const getCemeteryKey = (group: CemeteryGroupDto): string =>
  group.otherGroup ? 'OTHER' : String(group.cemeteryLocationId);

export default function BurialsPage() {
  const [overview, setOverview] = useState<BurialsOverviewDto | null>(null);
  const [selectedCemeteryKey, setSelectedCemeteryKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [sexFilter, setSexFilter] = useState<string>('ALL');
  const [includeNonCurrent, setIncludeNonCurrent] = useState<boolean>(false);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('SURNAME_ASC');

  useEffect(() => {
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
    void fetchBurials();
  }, [search, sexFilter, includeNonCurrent, includeArchived, sortBy]);

  const activeCemeteryGroup =
    overview && selectedCemeteryKey
      ? overview.cemeteryGroups.find(g => getCemeteryKey(g) === selectedCemeteryKey) ?? null
      : null;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {activeCemeteryGroup ? activeCemeteryGroup.groupName : 'Groby i cmentarze'}
          </h1>
          <p className={styles.pageSubtitle}>
            {activeCemeteryGroup
              ? 'Przeglądaj groby znajdujące się w wybranej lokalizacji cmentarnej.'
              : 'Wybierz cmentarz z listy, aby wyświetlić znajdujące się na nim groby.'}
          </p>
        </div>

        <div className={styles.headerRight}>
          {activeCemeteryGroup && (
            <button
              type="button"
              data-testid="back-to-cemeteries-button"
              onClick={() => {
                setSelectedCemeteryKey(null);
              }}
              className={styles.btnSecondary}
            >
              ← Wróć do listy cmentarzy
            </button>
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
            placeholder="Nazwisko, imię, cmentarz, przyczyna śmierci..."
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
          <p className={styles.pageSubtitle}>Brak zapisanych grobów spełniających wybrane kryteria.</p>
        </div>
      ) : !activeCemeteryGroup ? (
        /* LEVEL 1: CEMETERIES LIST */
        <div className={styles.cemeteriesGrid}>
          {overview.cemeteryGroups.map(group => {
            const key = getCemeteryKey(group);

            return (
              <button
                key={key}
                type="button"
                data-testid={`cemetery-card-${group.groupName}`}
                onClick={() => {
                  setSelectedCemeteryKey(key);
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
                  <div className={styles.cemeteryCardTitle}>{group.groupName}</div>
                  <div className={styles.cemeteryCardFooter}>
                    <span className={styles.cemeteryCountPill}>
                      Groby: {group.graves.length} • Osoby: {group.totalBurialsCount}
                    </span>
                    <span className={styles.cemeteryOpenHint}>Zobacz groby →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* LEVEL 2: GRAVES OF THE SELECTED CEMETERY (1 Grave per Row, Auto Height) */
        <div className={styles.gravesList}>
          {activeCemeteryGroup.graves.map(grave => (
            <div
              key={grave.graveId}
              className={styles.graveRowCard}
              data-testid={`grave-card-${String(grave.graveId)}`}
            >
              {/* Main Grave Photo Placeholder (Icon only, no text) */}
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
                {activeCemeteryGroup.otherGroup && grave.cemeteryName && (
                  <div className={styles.graveLocationHeader}>
                    📍 {grave.cemeteryName}
                  </div>
                )}

                <div className={styles.graveBurialsList}>
                  {grave.burials.map(b => {
                    const fullName =
                      `${b.surname ?? ''} ${b.givenName ?? ''}`.trim() || '—';

                    return (
                      <div
                        key={b.burialId}
                        className={`${styles.burialPersonCard} ${getBorderClass(b.sex)}`}
                      >
                        <div className={styles.personTopRow}>
                          <div className={styles.personIdentity}>
                            <PersonAvatar sex={b.sex} size="md" />
                            <div className={styles.personTitleBox}>
                              <div className={styles.personName}>{fullName}</div>
                              <div className={styles.personLifespan}>{formatLifespan(b)}</div>
                              {(!b.current || b.archived) && (
                                <div className={styles.badgesRow}>
                                  {!b.current && (
                                    <span className={styles.nonCurrentBadge}>
                                      Nieaktualne miejsce pochówku
                                    </span>
                                  )}
                                  {b.archived && (
                                    <span className={styles.archivedBadge}>Zarchiwizowana</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={styles.cardActions}>
                            <Link
                              to={`/biographies/${String(b.personId)}`}
                              className={styles.actionLink}
                            >
                              📖 Biografia
                            </Link>
                            <Link
                              to={`/tree?personId=${String(b.personId)}`}
                              className={styles.actionLink}
                            >
                              🌳 Drzewo
                            </Link>
                          </div>
                        </div>

                        <div className={styles.detailsBox}>
                          {b.burialDateText && (
                            <div className={styles.detailLine}>
                              <span className={styles.detailLabel}>Data pochówku:</span>
                              <span className={styles.detailValue}>{b.burialDateText}</span>
                            </div>
                          )}
                          {(b.birthDateText ?? b.birthPlace) && (
                            <div className={styles.detailLine}>
                              <span className={styles.detailLabel}>Urodzenie:</span>
                              <span className={styles.detailValue}>
                                {b.birthDateText ?? ''}{' '}
                                {b.birthPlace ? `(${b.birthPlace})` : ''}
                              </span>
                            </div>
                          )}
                          {(b.deathDateText ?? b.deathPlace) && (
                            <div className={styles.detailLine}>
                              <span className={styles.detailLabel}>Śmierć:</span>
                              <span className={styles.detailValue}>
                                {b.deathDateText ?? ''}{' '}
                                {b.deathPlace ? `(${b.deathPlace})` : ''}
                              </span>
                            </div>
                          )}
                          {b.causeOfDeath && (
                            <div className={styles.detailLine}>
                              <span className={styles.detailLabel}>Przyczyna śmierci:</span>
                              <span className={styles.detailValue}>{b.causeOfDeath}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}