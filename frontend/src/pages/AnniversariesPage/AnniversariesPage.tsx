import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../../api/dashboardApi';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './AnniversariesPage.module.css';
import type { AnniversaryItemDto, AnniversariesPageDto } from '../../types/dashboard';

const ANNIVERSARY_TYPE_OPTIONS = [
  { code: 'BIRTH', label: 'Rocznica urodzin' },
  { code: 'WEDDING', label: 'Rocznica ślubu' },
  { code: 'DEATH', label: 'Rocznica śmierci' },
];

const MONTHS_OPTIONS = [
  { value: 1, label: 'Styczeń' },
  { value: 2, label: 'Luty' },
  { value: 3, label: 'Marzec' },
  { value: 4, label: 'Kwiecień' },
  { value: 5, label: 'Maj' },
  { value: 6, label: 'Czerwiec' },
  { value: 7, label: 'Lipiec' },
  { value: 8, label: 'Sierpień' },
  { value: 9, label: 'Wrzesień' },
  { value: 10, label: 'Październik' },
  { value: 11, label: 'Listopad' },
  { value: 12, label: 'Grudzień' },
];

const getAccentClass = (type: AnniversaryItemDto['type']): string => {
  if (type === 'BIRTH') return styles.accentBirth;
  if (type === 'WEDDING') return styles.accentWedding;
  return styles.accentDeath;
};

const formatDaysUntil = (days: number): string => {
  if (days === 0) return 'Dzisiaj!';
  if (days === 1) return 'Jutro';
  return `za ${String(days)} dni`;
};

const formatParticipantsNames = (item: AnniversaryItemDto): string =>
  item.participants
    .map(p => `${p.surname ?? ''} ${p.givenName ?? ''}`.trim())
    .filter(Boolean)
    .join(' & ');

export default function AnniversariesPage() {
  const [pageData, setPageData] = useState<AnniversariesPageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isTypesDropdownOpen, setIsTypesDropdownOpen] = useState<boolean>(false);
  const typesDropdownRef = useRef<HTMLDivElement | null>(null);

  const [monthFilter, setMonthFilter] = useState<number | 'ALL'>('ALL');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('UPCOMING');
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
    const fetchAnniversaries = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await dashboardApi.getAnniversaries({
          search,
          types: selectedTypes,
          month: monthFilter,
          includeArchived,
          sortBy,
          page,
          size: 30,
        });
        setPageData(result);
      } catch {
        setErrorMessage('Nie udało się pobrać listy rocznic rodzinnych.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchAnniversaries();
  }, [search, selectedTypes, monthFilter, includeArchived, sortBy, page]);

  const toggleType = (code: string) => {
    setSelectedTypes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
    setPage(0);
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Rocznice rodzinne</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj dokładne rocznice urodzin, ślubów oraz śmierci członków rodziny.
          </p>
        </div>

        <div className={styles.headerRight}>
          {pageData && (
            <div className={styles.statsBadge}>
              Łącznie rocznic: <strong>{pageData.totalElements}</strong>
            </div>
          )}
          <Link to="/" className={styles.btnSecondary}>
            ← Panel główny
          </Link>
        </div>
      </div>

      {/* Filters & Sorting Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="ann-search-input" className={styles.filterLabel}>
            Wyszukaj
          </label>
          <input
            id="ann-search-input"
            type="text"
            data-testid="ann-search-input"
            placeholder="Imię, nazwisko, miejscowość..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className={styles.textInput}
          />
        </div>

        {/* Multi-Select Dropdown for Anniversary Types */}
        <div className={styles.filterField} ref={typesDropdownRef}>
          <span className={styles.filterLabel}>Typy rocznic</span>
          <button
            type="button"
            data-testid="ann-types-dropdown-trigger"
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
            <div className={styles.multiSelectPopover} data-testid="ann-types-popover">
              <div className={styles.popoverHeaderActions}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypes(ANNIVERSARY_TYPE_OPTIONS.map(t => t.code));
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
                {ANNIVERSARY_TYPE_OPTIONS.map(opt => (
                  <label key={opt.code} className={styles.typeCheckboxItem}>
                    <input
                      type="checkbox"
                      data-testid={`ann-type-checkbox-${opt.code}`}
                      checked={selectedTypes.includes(opt.code)}
                      onChange={() => {
                        toggleType(opt.code);
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
          <label htmlFor="ann-month-select" className={styles.filterLabel}>
            Miesiąc
          </label>
          <select
            id="ann-month-select"
            data-testid="ann-month-select"
            value={monthFilter === 'ALL' ? 'ALL' : String(monthFilter)}
            onChange={e => {
              const val = e.target.value;
              setMonthFilter(val === 'ALL' ? 'ALL' : Number(val));
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="ALL">Wszystkie miesiące</option>
            {MONTHS_OPTIONS.map(m => (
              <option key={m.value} value={String(m.value)}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="ann-sort-select" className={styles.filterLabel}>
            Sortowanie
          </label>
          <select
            id="ann-sort-select"
            data-testid="ann-sort-select"
            value={sortBy}
            onChange={e => {
              setSortBy(e.target.value);
              setPage(0);
            }}
            className={styles.selectInput}
          >
            <option value="UPCOMING">Od najbliższych w kalendarzu</option>
            <option value="CALENDAR_ASC">Chronologicznie (styczeń – grudzień)</option>
            <option value="CALENDAR_DESC">Chronologicznie (grudzień – styczeń)</option>
            <option value="YEARS_DESC">Kolejna rocznica (od najstarszych)</option>
            <option value="YEARS_ASC">Kolejna rocznica (od najmłodszych)</option>
            <option value="SURNAME_ASC">Nazwisko uczestnika (A–Z)</option>
          </select>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            data-testid="ann-include-archived-checkbox"
            checked={includeArchived}
            onChange={e => {
              setIncludeArchived(e.target.checked);
              setPage(0);
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
      ) : !pageData || pageData.content.length === 0 ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak rocznic spełniających wybrane kryteria.
          </p>
        </div>
      ) : (
        <>
          <section className={styles.listCard}>
            {pageData.content.map(ann => {
              const anniversaryTitle =
                ann.yearsCount !== null && ann.yearsCount > 0
                  ? `${String(ann.yearsCount)}. ${ann.typeLabel.toLowerCase()}`
                  : ann.typeLabel;

              return (
                <div
                  key={ann.id}
                  data-testid={`anniversary-row-${ann.id}`}
                  className={`${styles.anniversaryRow} ${getAccentClass(ann.type)}`}
                >
                  <div className={styles.rowLeft}>
                    <div className={styles.avatarsGroup}>
                      {ann.participants.map(p => (
                        <PersonAvatar key={p.personId} sex={p.sex} size="md" />
                      ))}
                    </div>

                    <div className={styles.rowMain}>
                      <div className={styles.rowTop}>
                        <span className={styles.typeBadge}>{anniversaryTitle}</span>
                        <span
                          className={`${styles.daysPill} ${
                            ann.daysUntil === 0 ? styles.daysPillToday : ''
                          }`}
                        >
                          {formatDaysUntil(ann.daysUntil)}
                        </span>
                        <span className={styles.participantsTitle}>
                          {formatParticipantsNames(ann)}
                        </span>
                      </div>

                      <div className={styles.metaRow}>
                        <span>
                          📅 Dzień rocznicy: <strong>{ann.annualDateText}</strong> (data
                          wydarzenia: {ann.dateText})
                        </span>
                        {ann.locationName && <span>📍 Miejsce: {ann.locationName}</span>}
                      </div>
                    </div>
                  </div>

                  <div className={styles.rowActions}>
                    {ann.participants.length === 1 && (
                      <Link
                        to={`/biographies/${String(ann.participants[0].personId)}`}
                        className={styles.btnSecondary}
                      >
                        📖 Biografia
                      </Link>
                    )}
                    <Link
                      to={`/events/${String(ann.eventId)}`}
                      className={styles.btnSecondary}
                    >
                      📅 Wydarzenie →
                    </Link>
                  </div>
                </div>
              );
            })}
          </section>

          <div className={styles.paginationBar}>
            <span className={styles.pageSubtitle}>
              Łącznie rocznic: <strong>{pageData.totalElements}</strong> (strona{' '}
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