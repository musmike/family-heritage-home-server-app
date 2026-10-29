import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { activityApi } from '../../api/activityApi';
import Loader from '../../components/Loader/Loader';
import styles from './ActivitiesPage.module.css';
import type { ActivityLogPageDto } from '../../types/activity';

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

const getAccentClass = (actionType: string): string => {
  if (actionType.startsWith('USER_')) return styles.accentAuth;
  if (actionType.startsWith('PERSON_')) return styles.accentPerson;
  if (actionType.startsWith('EVENT_')) return styles.accentEvent;
  if (actionType.startsWith('GRAVE_')) return styles.accentGrave;
  return styles.accentImport;
};

export default function ActivitiesPage() {
  const [pageData, setPageData] = useState<ActivityLogPageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isTypesDropdownOpen, setIsTypesDropdownOpen] = useState<boolean>(false);
  const [typeSearchQuery, setTypeSearchQuery] = useState<string>('');
  const typesDropdownRef = useRef<HTMLDivElement | null>(null);

  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('DESC');
  const [page, setPage] = useState<number>(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        typesDropdownRef.current &&
        !typesDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTypesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await activityApi.getActivities({
          search,
          types: selectedTypes,
          actor: actorFilter,
          dateFrom,
          dateTo,
          sortOrder,
          page,
          size: 30,
        });
        setPageData(result);
      } catch {
        setErrorMessage('Nie udało się pobrać historii aktywności.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchAll();
  }, [search, selectedTypes, actorFilter, dateFrom, dateTo, sortOrder, page]);

  const toggleActivityType = (code: string) => {
    setSelectedTypes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
    setPage(0);
  };

  const availableTypes = pageData?.availableTypes ?? [];
  const filteredTypeOptions = availableTypes.filter(t =>
    t.label.toLowerCase().includes(typeSearchQuery.trim().toLowerCase())
  );

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Historia aktywności</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj wszystkie operacje wykonane w aplikacji wraz z datą, godziną oraz autorem.
          </p>
        </div>

        <div className={styles.headerRight}>
          {pageData && (
            <div className={styles.statsBadge}>
              Łącznie wpisów: <strong>{pageData.totalElements}</strong>
            </div>
          )}
          <Link to="/" className={styles.btnSecondary}>
            ← Panel główny
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="act-search-input" className={styles.filterLabel}>
            Wyszukaj
          </label>
          <input
            id="act-search-input"
            type="text"
            data-testid="act-search-input"
            placeholder="Opis, nazwisko, IP..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className={styles.textInput}
          />
        </div>

        {/* Multi-Select Dropdown for Activity Types */}
        <div className={styles.filterField} ref={typesDropdownRef}>
          <span className={styles.filterLabel}>Typy aktywności</span>
          <button
            type="button"
            data-testid="act-types-dropdown-trigger"
            onClick={() => {
              setIsTypesDropdownOpen(prev => !prev);
            }}
            className={styles.multiSelectTrigger}
          >
            <span>
              {selectedTypes.length === 0
                ? 'Wszystkie typy'
                : `Wybrano: ${String(selectedTypes.length)}`}
            </span>
            <span>▾</span>
          </button>

          {isTypesDropdownOpen && (
            <div className={styles.multiSelectPopover} data-testid="act-types-popover">
              <input
                type="text"
                placeholder="Szukaj typu..."
                value={typeSearchQuery}
                onChange={e => {
                  setTypeSearchQuery(e.target.value);
                }}
                className={styles.textInput}
              />
              <div className={styles.popoverHeaderActions}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypes(availableTypes.map(t => t.code));
                    setPage(0);
                  }}
                  className={styles.popoverActionBtn}
                >
                  Zaznacz wszystkie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypes([]);
                    setPage(0);
                  }}
                  className={styles.popoverActionBtn}
                >
                  Wyczyść filtr
                </button>
              </div>
              <div className={styles.popoverTypesList}>
                {filteredTypeOptions.map(opt => (
                  <label key={opt.code} className={styles.typeCheckboxItem}>
                    <input
                      type="checkbox"
                      data-testid={`act-type-checkbox-${opt.code}`}
                      checked={selectedTypes.includes(opt.code)}
                      onChange={() => {
                        toggleActivityType(opt.code);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.filterField}>
          <label htmlFor="act-actor-select" className={styles.filterLabel}>
            Użytkownik
          </label>
          <select
            id="act-actor-select"
            value={actorFilter}
            onChange={e => {
              setActorFilter(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="ALL">Wszyscy użytkownicy</option>
            {(pageData?.availableActors ?? []).map(actor => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterField} style={{ flex: '1.3 1 250px' }}>
          <span className={styles.filterLabel}>Zakres dat (od – do)</span>
          <div className={styles.dateRangeGroup}>
            <input
              type="date"
              aria-label="Od daty"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className={styles.textInput}
            />
            <span>–</span>
            <input
              type="date"
              aria-label="Do daty"
              value={dateTo}
              onChange={e => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className={styles.textInput}
            />
          </div>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="act-sort-select" className={styles.filterLabel}>
            Sortowanie
          </label>
          <select
            id="act-sort-select"
            value={sortOrder}
            onChange={e => {
              setSortOrder(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="DESC">Od najnowszych</option>
            <option value="ASC">Od najstarszych</option>
          </select>
        </div>
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
          <p className={styles.pageSubtitle}>Brak aktywności spełniających wybrane kryteria.</p>
        </div>
      ) : (
        <>
          <section className={styles.listCard}>
            {pageData.content.map(act => (
              <div
                key={act.id}
                data-testid={`activity-row-${String(act.id)}`}
                className={`${styles.activityRow} ${getAccentClass(act.actionType)}`}
              >
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <span className={styles.typeBadge}>{act.actionLabel}</span>
                    {act.adminOnly && (
                      <span className={styles.adminBadge}>Widoczne dla administratora</span>
                    )}
                    <span className={styles.descriptionText}>{act.description}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>👤 Użytkownik: <strong>{act.actorDisplayName}</strong></span>
                    <span>🕒 Data: {formatPolishDateTime(act.createdAt)}</span>
                    {act.ipAddress && !act.description.includes(act.ipAddress) && (
                      <span>🌐 IP: {act.ipAddress}</span>
                    )}
                  </div>
                </div>

                {act.targetType === 'PERSON' && act.targetId !== null && (
                  <Link
                    to={`/biographies/${String(act.targetId)}`}
                    className={styles.btnSecondary}
                  >
                    📖 Biografia →
                  </Link>
                )}
                {act.targetType === 'EVENT' && act.targetId !== null && (
                  <Link
                    to={`/events/${String(act.targetId)}`}
                    className={styles.btnSecondary}
                  >
                    📅 Wydarzenie →
                  </Link>
                )}
              </div>
            ))}
          </section>

          <div className={styles.paginationBar}>
            <span className={styles.pageSubtitle}>
              Łącznie aktywności: <strong>{pageData.totalElements}</strong> (strona{' '}
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