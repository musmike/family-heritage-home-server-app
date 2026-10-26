import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './Biographies.module.css';
import type { BiographyPageDto, PersonListItemDto, PersonSex } from '../../types/biography';

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

const formatLifespanSummary = (person: PersonListItemDto): string => {
  const bYear = person.birthYear !== null ? String(person.birthYear) : '?';
  const dYear = person.deathYear !== null ? String(person.deathYear) : '?';
  const ageStr = formatPolishAge(person.age, person.ageApproximate);

  if (person.lifeState === 'DECEASED') {
    const base = `${bYear} – ${dYear}`;
    return ageStr ? `${base} (${ageStr})` : base;
  }
  if (person.birthYear !== null) {
    return ageStr ? `ur. ${bYear} (${ageStr})` : `ur. ${bYear}`;
  }
  return 'Daty nieznane';
};

const translateSexLabel = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return 'Mężczyzna';
  if (sex === 'FEMALE') return 'Kobieta';
  return 'Płeć nieznana';
};

export default function BiographiesListPage() {
  const [pageData, setPageData] = useState<BiographyPageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [sexFilter, setSexFilter] = useState<string>('ALL');
  const [lifeStateFilter, setLifeStateFilter] = useState<string>('ALL');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('SURNAME_ASC');
  const [page, setPage] = useState<number>(0);

  useEffect(() => {
    const fetchList = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await biographyApi.listPeople({
          search,
          sex: sexFilter,
          lifeState: lifeStateFilter,
          includeArchived,
          sortBy,
          page,
          size: 24,
        });
        setPageData(result);
      } catch {
        setErrorMessage('Nie udało się pobrać listy osób.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchList();
  }, [search, sexFilter, lifeStateFilter, includeArchived, sortBy, page]);

  const getCardAccentClass = (sex: PersonSex | null): string => {
    if (sex === 'MALE') return styles.cardMale;
    if (sex === 'FEMALE') return styles.cardFemale;
    return styles.cardNeutral;
  };

  const getSexBadgeClass = (sex: PersonSex | null): string => {
    if (sex === 'MALE') return styles.sexBadgeMale;
    if (sex === 'FEMALE') return styles.sexBadgeFemale;
    return styles.sexBadgeNeutral;
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Biografie</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj osoby w drzewie genealogicznym, filtruj dane i otwieraj karty biograficzne lub drzewo przodków.
          </p>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="bio-search-input" className={styles.filterLabel}>
            Wyszukaj osobę lub miejsce
          </label>
          <input
            id="bio-search-input"
            type="text"
            data-testid="bio-search-input"
            placeholder="Imię, nazwisko, miejscowość..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className={styles.textInput}
          />
        </div>

        <div className={styles.filterField}>
          <label htmlFor="bio-sex-select" className={styles.filterLabel}>
            Płeć
          </label>
          <select
            id="bio-sex-select"
            data-testid="bio-sex-select"
            value={sexFilter}
            onChange={e => {
              setSexFilter(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="ALL">Wszystkie</option>
            <option value="MALE">Mężczyźni</option>
            <option value="FEMALE">Kobiety</option>
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="bio-lifestate-select" className={styles.filterLabel}>
            Status życia
          </label>
          <select
            id="bio-lifestate-select"
            value={lifeStateFilter}
            onChange={e => {
              setLifeStateFilter(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="ALL">Wszystkie</option>
            <option value="DECEASED">Zmarli</option>
            <option value="LIVING">Żyjący</option>
            <option value="UNKNOWN">Nieznany los</option>
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="bio-sort-select" className={styles.filterLabel}>
            Sortowanie
          </label>
          <select
            id="bio-sort-select"
            data-testid="bio-sort-select"
            value={sortBy}
            onChange={e => {
              setSortBy(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="SURNAME_ASC">Nazwisko (A–Z)</option>
            <option value="SURNAME_DESC">Nazwisko (Z–A)</option>
            <option value="GIVEN_NAME_ASC">Imię (A–Z)</option>
            <option value="BIRTH_DATE_ASC">Rok urodzenia (od najstarszych)</option>
            <option value="BIRTH_DATE_DESC">Rok urodzenia (od najmłodszych)</option>
            <option value="DEATH_DATE_ASC">Rok śmierci (rosnąco)</option>
            <option value="DEATH_DATE_DESC">Rok śmierci (malejąco)</option>
          </select>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            data-testid="bio-include-archived-checkbox"
            checked={includeArchived}
            onChange={e => {
              setIncludeArchived(e.target.checked);
              setPage(0);
            }}
          />
          <span>Pokaż zarchiwizowane</span>
        </label>
      </section>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <Loader size={42} />
      ) : !pageData || pageData.content.length === 0 ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>Brak osób spełniających wybrane kryteria.</p>
        </div>
      ) : (
        <>
          <div className={styles.peopleList}>
            {pageData.content.map(person => (
              <div
                key={person.id}
                data-testid={`person-card-${String(person.id)}`}
                className={`${styles.personRowCard} ${getCardAccentClass(person.sex)}`}
              >
                <div className={styles.rowLeft}>
                  <PersonAvatar sex={person.sex} size="lg" />
                  <div className={styles.cardTitleGroup}>
                    <div className={styles.personName}>
                      {`${person.surname ?? ''} ${person.givenName ?? ''}`.trim() || '—'}
                    </div>
                    <div className={styles.lifespanLine}>{formatLifespanSummary(person)}</div>
                    <div className={styles.badgesRow}>
                      <span className={getSexBadgeClass(person.sex)}>
                        {translateSexLabel(person.sex)}
                      </span>
                      {person.archived && (
                        <span className={styles.archivedBadge}>Zarchiwizowana</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.rowMiddleEvents}>
                  <div className={styles.eventLine}>
                    <span className={styles.eventLabel}>Urodzenie:</span>
                    <span className={styles.eventValue}>
                      {person.birthDateText ?? '—'}{' '}
                      {person.birthPlace ? `(${person.birthPlace})` : ''}
                    </span>
                  </div>
                  {person.lifeState === 'DECEASED' && (
                    <div className={styles.eventLine}>
                      <span className={styles.eventLabel}>Śmierć:</span>
                      <span className={styles.eventValue}>
                        {person.deathDateText ?? '—'}{' '}
                        {person.deathPlace ? `(${person.deathPlace})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.rowActions}>
                  <Link
                    to={`/biographies/${String(person.id)}`}
                    className={styles.btnSecondary}
                  >
                    📖 Biografia
                  </Link>
                  <Link
                    to={`/tree?personId=${String(person.id)}`}
                    className={styles.btnSecondary}
                  >
                    🌳 Drzewo
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Bar */}
          <div className={styles.paginationBar}>
            <span className={styles.pageSubtitle}>
              Łącznie osób: <strong>{pageData.totalElements}</strong> (strona{' '}
              {pageData.totalPages === 0 ? 0 : pageData.page + 1} z {pageData.totalPages})
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => {
                  setPage(prev => Math.max(0, prev - 1));
                }}
                className={styles.btnSecondary}
              >
                ← Poprzednia
              </button>
              <button
                type="button"
                disabled={page + 1 >= pageData.totalPages}
                onClick={() => {
                  setPage(prev => prev + 1);
                }}
                className={styles.btnSecondary}
              >
                Następna →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}