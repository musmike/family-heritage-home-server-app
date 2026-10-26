import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import Loader from '../../components/Loader/Loader';
import styles from './EventsPage.module.css';
import type {
  EventsTimelinePageDto,
  TimelineEventDto,
} from '../../types/eventTimeline';

const getEventTypeAccentClass = (typeCode: string): string => {
  switch (typeCode) {
    case 'BIRTH':
      return styles.typeBirth;
    case 'WEDDING':
      return styles.typeWedding;
    case 'DEATH':
      return styles.typeDeath;
    case 'BURIAL':
      return styles.typeBurial;
    default:
      return styles.typeCustom;
  }
};

const formatParticipantsSummary = (evt: TimelineEventDto): string => {
  if (evt.participants.length === 0) return 'Brak przypisanych osób';
  return evt.participants
    .map(p => `${p.surname ?? ''} ${p.givenName ?? ''}`.trim())
    .filter(Boolean)
    .join(' & ');
};

export default function EventsPage() {
  const [timelineData, setTimelineData] = useState<EventsTimelinePageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [expandedDecades, setExpandedDecades] = useState<Record<string, boolean | undefined>>({});
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean | undefined>>({});

  const [search, setSearch] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isTypesDropdownOpen, setIsTypesDropdownOpen] = useState<boolean>(false);
  const [typeSearchQuery, setTypeSearchQuery] = useState<string>('');
  const typesDropdownRef = useRef<HTMLDivElement | null>(null);

  const [boundsInitialized, setBoundsInitialized] = useState<boolean>(false);
  const [minBound, setMinBound] = useState<number>(1800);
  const [maxBound, setMaxBound] = useState<number>(2026);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);

  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<string>('ASC');

  // Close Event Types popover when clicking outside
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
    const fetchEvents = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await eventTimelineApi.getEventsTimeline({
          search,
          types: selectedTypes,
          yearFrom,
          yearTo,
          includeUndated: true,
          includeArchived,
          sortOrder,
          page: 0,
          size: 5000,
        });
        setTimelineData(data);

        if (
          !boundsInitialized &&
          data.minAvailableYear !== undefined &&
          data.minAvailableYear !== null &&
          data.maxAvailableYear !== undefined &&
          data.maxAvailableYear !== null
        ) {
          setMinBound(data.minAvailableYear);
          setMaxBound(data.maxAvailableYear);
          setYearFrom(data.minAvailableYear);
          setYearTo(data.maxAvailableYear);
          setBoundsInitialized(true);
        }
      } catch {
        setErrorMessage('Nie udało się pobrać osi czasu wydarzeń.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchEvents();
  }, [search, selectedTypes, yearFrom, yearTo, includeArchived, sortOrder, boundsInitialized]);

  const handleYearFromChange = (rawVal: number) => {
    if (Number.isNaN(rawVal)) return;
    const upper = yearTo ?? maxBound;
    const clamped = Math.min(Math.max(rawVal, minBound), upper);
    setYearFrom(clamped);
  };

  const handleYearToChange = (rawVal: number) => {
    if (Number.isNaN(rawVal)) return;
    const lower = yearFrom ?? minBound;
    const clamped = Math.max(Math.min(rawVal, maxBound), lower);
    setYearTo(clamped);
  };

  const toggleDecade = (decadeKey: string) => {
    setExpandedDecades(prev => ({
      ...prev,
      [decadeKey]: !prev[decadeKey],
    }));
  };

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: !prev[year],
    }));
  };

  const handleExpandAll = () => {
    if (!timelineData) return;
    const decMap: Record<string, boolean> = {};
    const yrMap: Record<number, boolean> = {};
    for (const d of timelineData.decades) {
      decMap[String(d.decadeStart)] = true;
      for (const y of d.years) {
        yrMap[y.year] = true;
      }
    }
    decMap.UNDATED = true;
    setExpandedDecades(decMap);
    setExpandedYears(yrMap);
  };

  const handleCollapseAll = () => {
    setExpandedDecades({});
    setExpandedYears({});
  };

  const toggleEventType = (code: string) => {
    setSelectedTypes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const renderCompactEventTile = (evt: TimelineEventDto) => (
    <Link
      key={evt.eventId}
      to={`/events/${String(evt.eventId)}`}
      data-testid={`timeline-event-${String(evt.eventId)}`}
      className={`${styles.compactEventTile} ${getEventTypeAccentClass(evt.typeCode)}`}
    >
      <div className={styles.tileTopRow}>
        <span className={styles.tileTypeBadge}>{evt.typeLabel}</span>
        {evt.dateText && <span className={styles.tileDate}>{evt.dateText}</span>}
      </div>
      <div className={styles.tileParticipants}>{formatParticipantsSummary(evt)}</div>
      {evt.locationName && (
        <div className={styles.tileLocation}>📍 {evt.locationName}</div>
      )}
    </Link>
  );

  const availableTypes = timelineData?.availableTypes ?? [];
  const filteredTypeOptions = availableTypes.filter(t =>
    t.label.toLowerCase().includes(typeSearchQuery.trim().toLowerCase())
  );

  const currentFrom = yearFrom ?? minBound;
  const currentTo = yearTo ?? maxBound;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Wydarzenia (kronika rodzinna)</h1>
          <p className={styles.pageSubtitle}>
            Rozwiń interesującą Cię dekadę i rok, a następnie kliknij w wydarzenie, aby zobaczyć jego pełne szczegóły.
          </p>
        </div>

        <div className={styles.headerRight}>
          <button
            type="button"
            data-testid="expand-all-events-button"
            onClick={handleExpandAll}
            className={styles.btnSecondary}
          >
            Rozwiń wszystkie
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className={styles.btnSecondary}
          >
            Zwiń wszystkie
          </button>
          {timelineData && (
            <div className={styles.statsBadge}>
              Wydarzenia: <strong>{timelineData.totalEvents}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="events-search-input" className={styles.filterLabel}>
            Wyszukaj
          </label>
          <input
            id="events-search-input"
            type="text"
            data-testid="events-search-input"
            placeholder="Nazwisko, imię, miejscowość..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
            }}
            className={styles.textInput}
          />
        </div>

        {/* Multi-Select Dropdown for Event Types (Closes on Outside Click) */}
        <div className={styles.filterField} ref={typesDropdownRef}>
          <span className={styles.filterLabel}>Typy wydarzeń</span>
          <button
            type="button"
            data-testid="events-types-dropdown-trigger"
            onClick={() => {
              setIsTypesDropdownOpen(prev => !prev);
            }}
            className={styles.multiSelectTrigger}
          >
            <span>
              {selectedTypes.length === 0
                ? 'Wszystkie typy'
                : `Wybrano typów: ${String(selectedTypes.length)}`}
            </span>
            <span>▾</span>
          </button>

          {isTypesDropdownOpen && (
            <div className={styles.multiSelectPopover} data-testid="events-types-popover">
              <input
                type="text"
                placeholder="Szukaj typu wydarzenia..."
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
                  }}
                  className={styles.popoverActionBtn}
                >
                  Zaznacz wszystkie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypes([]);
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
                      data-testid={`event-type-checkbox-${opt.code}`}
                      checked={selectedTypes.includes(opt.code)}
                      onChange={() => {
                        toggleEventType(opt.code);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year Range Filter (Editable Inputs + Sliders bounded by [minBound, maxBound]) */}
        {boundsInitialized && (
          <div className={styles.filterField} style={{ flex: '1.4 1 240px' }}>
            <span className={styles.filterLabel}>
              Zakres lat ({minBound} – {maxBound})
            </span>
            <div className={styles.yearRangeGroup}>
              <input
                type="number"
                aria-label="Od roku"
                min={minBound}
                max={currentTo}
                value={currentFrom}
                onChange={e => {
                  handleYearFromChange(Number(e.target.value));
                }}
                className={styles.textInput}
              />
              <span>–</span>
              <input
                type="number"
                aria-label="Do roku"
                min={currentFrom}
                max={maxBound}
                value={currentTo}
                onChange={e => {
                  handleYearToChange(Number(e.target.value));
                }}
                className={styles.textInput}
              />
            </div>
            <div className={styles.rangeSlidersRow}>
              <input
                type="range"
                aria-label="Suwak od roku"
                min={minBound}
                max={maxBound}
                value={currentFrom}
                onChange={e => {
                  handleYearFromChange(Number(e.target.value));
                }}
                className={styles.rangeInput}
              />
              <input
                type="range"
                aria-label="Suwak do roku"
                min={minBound}
                max={maxBound}
                value={currentTo}
                onChange={e => {
                  handleYearToChange(Number(e.target.value));
                }}
                className={styles.rangeInput}
              />
            </div>
          </div>
        )}

        <div className={styles.filterField}>
          <label htmlFor="events-sort-select" className={styles.filterLabel}>
            Kolejność
          </label>
          <select
            id="events-sort-select"
            value={sortOrder}
            onChange={e => {
              setSortOrder(e.target.value);
            }}
            className={styles.selectInput}
          >
            <option value="ASC">Od najstarszych (chronologicznie)</option>
            <option value="DESC">Od najnowszych</option>
          </select>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
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
      ) : !timelineData ||
        (timelineData.decades.length === 0 && timelineData.undatedEvents.length === 0) ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>Brak wydarzeń spełniających wybrane kryteria.</p>
        </div>
      ) : (
        <div className={styles.decadesList}>
          {timelineData.decades.map(decade => {
            const decKey = String(decade.decadeStart);
            const isDecadeOpen = expandedDecades[decKey] === true;

            return (
              <div
                key={decade.decadeStart}
                className={styles.decadeAccordion}
                data-testid={`decade-section-${decKey}`}
              >
                <button
                  type="button"
                  data-testid={`decade-toggle-${decKey}`}
                  onClick={() => {
                    toggleDecade(decKey);
                  }}
                  className={styles.decadeHeaderBtn}
                >
                  <div className={styles.decadeHeaderLeft}>
                    <span className={styles.chevron}>{isDecadeOpen ? '▼' : '▶'}</span>
                    <span className={styles.decadeTitle}>{decade.decadeLabel}</span>
                  </div>
                  <span className={styles.decadeCountPill}>
                    Wydarzenia: {decade.eventsCount}
                  </span>
                </button>

                {isDecadeOpen && (
                  <div className={styles.decadeBody}>
                    {decade.years.map(yearGroup => {
                      const isYearOpen = expandedYears[yearGroup.year] === true;

                      return (
                        <div key={yearGroup.year} className={styles.yearAccordion}>
                          <button
                            type="button"
                            data-testid={`year-toggle-${String(yearGroup.year)}`}
                            onClick={() => {
                              toggleYear(yearGroup.year);
                            }}
                            className={styles.yearHeaderBtn}
                          >
                            <div className={styles.decadeHeaderLeft}>
                              <span className={styles.chevron}>
                                {isYearOpen ? '▼' : '▶'}
                              </span>
                              <span className={styles.yearTitle}>Rok {yearGroup.year}</span>
                            </div>
                            <span className={styles.yearCountBadge}>
                              Wydarzenia: {yearGroup.events.length}
                            </span>
                          </button>

                          {isYearOpen && (
                            <div className={styles.yearEventsGrid}>
                              {yearGroup.events.map(evt => renderCompactEventTile(evt))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* UNDATED EVENTS ACCORDION (Visible by default when undated events exist) */}
          {timelineData.undatedEvents.length > 0 && (
            <div className={styles.decadeAccordion} data-testid="undated-events-section">
              <button
                type="button"
                onClick={() => {
                  toggleDecade('UNDATED');
                }}
                className={styles.decadeHeaderBtn}
              >
                <div className={styles.decadeHeaderLeft}>
                  <span className={styles.chevron}>
                    {expandedDecades.UNDATED ? '▼' : '▶'}
                  </span>
                  <span className={styles.decadeTitle}>
                    Wydarzenia bez ustalonej daty rocznej
                  </span>
                </div>
                <span className={styles.decadeCountPill}>
                  Wydarzenia: {timelineData.undatedEvents.length}
                </span>
              </button>

              {expandedDecades.UNDATED && (
                <div className={styles.yearEventsGrid}>
                  {timelineData.undatedEvents.map(evt => renderCompactEventTile(evt))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}