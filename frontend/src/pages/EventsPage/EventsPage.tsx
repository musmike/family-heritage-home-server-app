import { useState, useEffect, useRef, useMemo, use } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import styles from './EventsPage.module.css';
import type {
  EventsTimelinePageDto,
  SaveEventParticipantRequestDto,
  TimelineEventDto,
} from '../../types/eventTimeline';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

export const QUALIFIER_OPTIONS = [
  { value: 'EXACT', label: 'Dokładnie' },
  { value: 'ABOUT', label: 'Około (ok.)' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
  { value: 'ESTIMATED', label: 'Szacunkowo' },
];

export const ROLE_LABELS: Record<string, string | undefined> = {
  PRINCIPAL: 'Główny uczestnik',
  GODPARENT: 'Rodzic chrzestny (Ojciec / Matka chrzestna)',
  WITNESS: 'Świadek',
  HOST: 'Gospodarz / Odwiedzany',
  VISITOR: 'Odwiedzający',
  GUEST: 'Gość',
  PARTICIPANT: 'Uczestnik',
};

const getEventTypeAccentClass = (typeCode: string): string => {
  if (typeCode === 'BIRTH' || typeCode.startsWith('BAPTISM')) {
    return styles.typeBirth;
  }
  if (typeCode.startsWith('WEDDING')) {
    return styles.typeWedding;
  }
  if (typeCode === 'DEATH') {
    return styles.typeDeath;
  }
  if (typeCode === 'BURIAL' || typeCode.startsWith('FUNERAL') || typeCode === 'CREMATION') {
    return styles.typeBurial;
  }
  return styles.typeCustom;
};

const formatParticipantsSummary = (evt: TimelineEventDto): string => {
  if (evt.participants.length === 0) return 'Brak przypisanych osób';
  return evt.participants
    .map(p => {
      if (p.participantText) return p.participantText;
      return `${p.surname ?? ''} ${p.givenName ?? ''}`.trim();
    })
    .filter(Boolean)
    .join(' & ');
};

export default function EventsPage() {
  const navigate = useNavigate();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

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

  // Admin Create Event Form State
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [formTypeCodes, setFormTypeCodes] = useState<string[]>(['FAMILY_GATHERING']);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formParentEventId, setFormParentEventId] = useState<string>('');

  const [formStartQual, setFormStartQual] = useState<string>('EXACT');
  const [formStartYear, setFormStartYear] = useState<string>('');
  const [formStartMonth, setFormStartMonth] = useState<string>('');
  const [formStartDay, setFormStartDay] = useState<string>('');
  const [formStartTimeQual, setFormStartTimeQual] = useState<string>('EXACT');
  const [formStartHour, setFormStartHour] = useState<string>('');
  const [formStartMinute, setFormStartMinute] = useState<string>('');

  const [formParticipants, setFormParticipants] = useState<
    (SaveEventParticipantRequestDto & { displayLabel: string })[]
  >([]);
  const [partRoleCode, setPartRoleCode] = useState<string>('PRINCIPAL');
  const [partPersonQuery, setPartPersonQuery] = useState<string>('');
  const [partPersonResults, setPartPersonResults] = useState<PersonListItemDto[]>([]);
  const [partTextInput, setPartTextInput] = useState<string>('');
  const [partTextSex, setPartTextSex] = useState<PersonSex>('UNKNOWN');

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

  useEffect(() => {
    void fetchEvents();
  }, [search, selectedTypes, yearFrom, yearTo, includeArchived, sortOrder, boundsInitialized]);

  const availableTypes = timelineData?.availableTypes ?? [];

  const allowedRolesForSelectedTypes = useMemo<string[]>(() => {
    const set = new Set<string>(['PRINCIPAL', 'PARTICIPANT', 'GUEST']);
    for (const code of formTypeCodes) {
      const found = availableTypes.find(t => t.code === code);
      if (found?.allowedRoleCodes) {
        for (const r of found.allowedRoleCodes) {
          set.add(r);
        }
      }
    }
    return Array.from(set);
  }, [formTypeCodes, availableTypes]);

  const flatParentCandidateEvents = useMemo<TimelineEventDto[]>(() => {
    if (!timelineData) return [];
    const list: TimelineEventDto[] = [];
    for (const dec of timelineData.decades) {
      for (const yr of dec.years) {
        for (const ev of yr.events) {
          list.push(ev);
        }
      }
    }
    return list;
  }, [timelineData]);

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

  const toggleFormEventType = (code: string) => {
    setFormTypeCodes(prev => {
      if (prev.includes(code)) {
        return prev.length > 1 ? prev.filter(c => c !== code) : prev;
      }
      return [...prev, code];
    });
  };

  const handleSearchPersonForEvent = async () => {
    try {
      const res = await biographyApi.listPeople({
        search: partPersonQuery,
        includeArchived: true,
        page: 0,
        size: 6,
      });
      setPartPersonResults(res.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleAddDbPersonParticipant = (p: PersonListItemDto) => {
    const label = `${p.surname ?? ''} ${p.givenName ?? ''}`.trim();
    setFormParticipants(prev => [
      ...prev,
      {
        personId: p.id,
        roleCode: partRoleCode,
        displayLabel: `${label} (${ROLE_LABELS[partRoleCode] ?? partRoleCode})`,
      },
    ]);
    setPartPersonResults([]);
    setPartPersonQuery('');
  };

  const handleAddTextParticipant = () => {
    if (partTextInput.trim() === '') return;
    const text = partTextInput.trim();
    setFormParticipants(prev => [
      ...prev,
      {
        participantText: text,
        participantSex: partTextSex,
        roleCode: partRoleCode,
        displayLabel: `${text} [spoza drzewa] (${ROLE_LABELS[partRoleCode] ?? partRoleCode})`,
      },
    ]);
    setPartTextInput('');
  };

  const handleCreateEventSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const created = await eventTimelineApi.createEvent({
        typeCodes: formTypeCodes,
        title: formTitle.trim() || null,
        description: formDesc.trim() || null,
        locationName: formLocation.trim() || null,
        parentEventId: formParentEventId !== '' ? Number(formParentEventId) : null,
        startQualifier: formStartQual,
        startYear: formStartYear !== '' ? Number(formStartYear) : null,
        startMonth: formStartMonth !== '' ? Number(formStartMonth) : null,
        startDay: formStartDay !== '' ? Number(formStartDay) : null,
        startTimeQualifier: formStartTimeQual,
        startHour: formStartHour !== '' ? Number(formStartHour) : null,
        startMinute: formStartMinute !== '' ? Number(formStartMinute) : null,
        participants: formParticipants.map(fp => ({
          personId: fp.personId,
          participantText: fp.participantText,
          participantSex: fp.participantSex,
          roleCode: fp.roleCode,
        })),
      });
      setShowCreateForm(false);
      void navigate(`/events/${String(created.eventId)}`);
    } catch {
      setErrorMessage('Nie udało się utworzyć nowego wydarzenia.');
    }
  };

  const renderEventWithSubEvents = (evt: TimelineEventDto) => {
    const typeLabels =
      evt.assignedTypeLabels && evt.assignedTypeLabels.length > 0
        ? evt.assignedTypeLabels
        : [evt.typeLabel];
    const subEvents = evt.subEvents ?? [];

    return (
      <div key={evt.eventId} className={styles.eventWithSubsWrapper}>
        <Link
          to={`/events/${String(evt.eventId)}`}
          data-testid={`timeline-event-${String(evt.eventId)}`}
          className={`${styles.compactEventTile} ${getEventTypeAccentClass(evt.typeCode)}`}
        >
          <div className={styles.tileTopRow}>
            <div className={styles.tileTypesGroup}>
              {typeLabels.map(lbl => (
                <span key={lbl} className={styles.tileTypeBadge}>
                  {lbl}
                </span>
              ))}
            </div>
            {evt.dateText && <span className={styles.tileDate}>{evt.dateText}</span>}
          </div>
          {evt.title && (
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1d4ed8' }}>
              {evt.title}
            </div>
          )}
          <div className={styles.tileParticipants}>{formatParticipantsSummary(evt)}</div>
          {evt.locationName && (
            <div className={styles.tileLocation}>📍 {evt.locationName}</div>
          )}
        </Link>

        {subEvents.map(sub => (
          <Link
            key={sub.eventId}
            to={`/events/${String(sub.eventId)}`}
            data-testid={`timeline-subevent-${String(sub.eventId)}`}
            className={styles.subEventTile}
          >
            <div className={styles.tileTopRow}>
              <span className={styles.subEventMarker}>
                ↳ Podwydarzenie: {sub.title ?? sub.typeLabel}
              </span>
              {sub.dateText && <span className={styles.tileDate}>{sub.dateText}</span>}
            </div>
            <div style={{ fontWeight: 600 }}>{formatParticipantsSummary(sub)}</div>
            {sub.locationName && (
              <div className={styles.tileLocation}>📍 {sub.locationName}</div>
            )}
          </Link>
        ))}
      </div>
    );
  };

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
            Rozwiń interesującą Cię dekadę i rok, a następnie kliknij w wydarzenie, aby zobaczyć jego pełne szczegóły, uczestników oraz zdjęcia.
          </p>
        </div>

        <div className={styles.headerRight}>
          {isAdmin && (
            <button
              type="button"
              data-testid="open-create-event-button"
              onClick={() => {
                setShowCreateForm(prev => !prev);
              }}
              className={styles.btnPrimary}
            >
              {showCreateForm ? 'Zamknij formularz' : '+ Dodaj wydarzenie'}
            </button>
          )}
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
              Wydarzenia główne: <strong>{timelineData.totalEvents}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Admin Create Event Form */}
      {isAdmin && showCreateForm && (
        <section className={styles.detailsCard} data-testid="create-event-form-section">
          <h2 className={styles.sectionSubtitle}>Dodaj nowe wydarzenie rodzinne</h2>
          <form
            onSubmit={e => {
              void handleCreateEventSubmit(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div className={styles.formField}>
              <span className={styles.filterLabel}>
                Wybierz jeden lub kilka typów wydarzenia (np. zakończenie roku + zakończenie szkoły):
              </span>
              <div
                style={{
                  maxHeight: '145px',
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.35rem',
                  padding: '0.6rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                }}
              >
                {availableTypes.map(opt => (
                  <label key={opt.code} className={styles.typeCheckboxItem}>
                    <input
                      type="checkbox"
                      checked={formTypeCodes.includes(opt.code)}
                      onChange={() => {
                        toggleFormEventType(opt.code);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="new-evt-title" className={styles.filterLabel}>
                  Własny tytuł wydarzenia (opcjonalnie)
                </label>
                <input
                  id="new-evt-title"
                  type="text"
                  placeholder="np. Wyjazd do Gdańska"
                  value={formTitle}
                  onChange={e => {
                    setFormTitle(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-loc" className={styles.filterLabel}>
                  Miejsce / miejscowość
                </label>
                <input
                  id="new-evt-loc"
                  type="text"
                  placeholder="np. Gdańsk"
                  value={formLocation}
                  onChange={e => {
                    setFormLocation(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-parent" className={styles.filterLabel}>
                  Wydarzenie nadrzędne (opcjonalnie)
                </label>
                <select
                  id="new-evt-parent"
                  value={formParentEventId}
                  onChange={e => {
                    setFormParentEventId(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Brak (wydarzenie główne) —</option>
                  {flatParentCandidateEvents.map(cand => (
                    <option key={cand.eventId} value={String(cand.eventId)}>
                      {cand.dateText ?? cand.year ?? 'Bez daty'} –{' '}
                      {cand.title ?? cand.typeLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formField}>
              <label htmlFor="new-evt-desc" className={styles.filterLabel}>
                Opis wydarzenia (opcjonalnie)
              </label>
              <input
                id="new-evt-desc"
                type="text"
                placeholder="Dodatkowe informacje o przebiegu wydarzenia..."
                value={formDesc}
                onChange={e => {
                  setFormDesc(e.target.value);
                }}
                className={styles.textInput}
              />
            </div>

            {/* Date & Time Fields */}
            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="new-evt-date-qual" className={styles.filterLabel}>
                  Kwalifikator daty
                </label>
                <select
                  id="new-evt-date-qual"
                  value={formStartQual}
                  onChange={e => {
                    setFormStartQual(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  {QUALIFIER_OPTIONS.map(q => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-year" className={styles.filterLabel}>
                  Rok
                </label>
                <input
                  id="new-evt-year"
                  type="number"
                  placeholder="np. 1995"
                  value={formStartYear}
                  onChange={e => {
                    setFormStartYear(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-month" className={styles.filterLabel}>
                  Miesiąc (1–12)
                </label>
                <input
                  id="new-evt-month"
                  type="number"
                  min={1}
                  max={12}
                  value={formStartMonth}
                  onChange={e => {
                    setFormStartMonth(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-day" className={styles.filterLabel}>
                  Dzień (1–31)
                </label>
                <input
                  id="new-evt-day"
                  type="number"
                  min={1}
                  max={31}
                  value={formStartDay}
                  onChange={e => {
                    setFormStartDay(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-time-qual" className={styles.filterLabel}>
                  Kwalifikator czasu
                </label>
                <select
                  id="new-evt-time-qual"
                  value={formStartTimeQual}
                  onChange={e => {
                    setFormStartTimeQual(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  {QUALIFIER_OPTIONS.map(q => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-hour" className={styles.filterLabel}>
                  Godzina (0–23) i Minuta (0–59)
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    id="new-evt-hour"
                    type="number"
                    min={0}
                    max={23}
                    placeholder="GG"
                    value={formStartHour}
                    onChange={e => {
                      setFormStartHour(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="MM"
                    value={formStartMinute}
                    onChange={e => {
                      setFormStartMinute(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>
              </div>
            </div>

            {/* Participants Builder */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.95rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <span className={styles.filterLabel}>
                Uczestnicy wydarzenia (z drzewa genealogicznego lub wpis tekstowy spoza bazy):
              </span>

              <div className={styles.detailsGrid}>
                <div className={styles.formField}>
                  <label htmlFor="part-role-select" className={styles.filterLabel}>
                    Rola uczestnika
                  </label>
                  <select
                    id="part-role-select"
                    value={partRoleCode}
                    onChange={e => {
                      setPartRoleCode(e.target.value);
                    }}
                    className={styles.selectInput}
                  >
                    {allowedRolesForSelectedTypes.map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <span className={styles.filterLabel}>Dodaj osobę z drzewa</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="Szukaj w drzewie..."
                      value={partPersonQuery}
                      onChange={e => {
                        setPartPersonQuery(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleSearchPersonForEvent();
                      }}
                      className={styles.btnSecondary}
                    >
                      Szukaj
                    </button>
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.filterLabel}>
                    Lub dodaj osobę tekstowo spoza bazy
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="np. Stanisław Nowak (świadek)"
                      value={partTextInput}
                      onChange={e => {
                        setPartTextInput(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <select
                      value={partTextSex}
                      onChange={e => {
                        setPartTextSex(e.target.value as PersonSex);
                      }}
                      className={styles.selectInput}
                      style={{ width: '95px' }}
                    >
                      <option value="MALE">M</option>
                      <option value="FEMALE">K</option>
                      <option value="UNKNOWN">?</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddTextParticipant}
                      className={styles.btnSecondary}
                    >
                      + Dodaj
                    </button>
                  </div>
                </div>
              </div>

              {partPersonResults.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {partPersonResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        handleAddDbPersonParticipant(p);
                      }}
                      className={styles.btnSecondary}
                    >
                      + Wybierz: {p.surname} {p.givenName} ({p.birthYear ?? '?'})
                    </button>
                  ))}
                </div>
              )}

              {formParticipants.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {formParticipants.map((fp, idx) => (
                    <span
                      key={`${fp.displayLabel}-${String(idx)}`}
                      className={styles.decadeCountPill}
                    >
                      👤 {fp.displayLabel}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setFormParticipants(prev => prev.filter((_, i) => i !== idx));
                        }}
                        style={{
                          marginLeft: '0.35rem',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontWeight: 800,
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button type="submit" className={styles.btnPrimary}>
                ✓ Utwórz wydarzenie
              </button>
            </div>
          </form>
        </section>
      )}

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
            placeholder="Nazwisko, imię, tytuł, miejscowość..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
            }}
            className={styles.textInput}
          />
        </div>

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
            {maxBound > minBound && (
              <div className={styles.dualSliderContainer}>
                <div className={styles.sliderTrackBg} />
                <div
                  className={styles.sliderTrackFill}
                  style={{
                    left: `${String(((currentFrom - minBound) / (maxBound - minBound)) * 100)}%`,
                    width: `${String(((currentTo - currentFrom) / (maxBound - minBound)) * 100)}%`,
                  }}
                />
                <input
                  type="range"
                  aria-label="Suwak od roku"
                  min={minBound}
                  max={maxBound}
                  value={currentFrom}
                  onChange={e => {
                    handleYearFromChange(Number(e.target.value));
                  }}
                  className={styles.dualRangeInput}
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
                  className={styles.dualRangeInput}
                />
              </div>
            )}
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
                              {yearGroup.events.map(evt => renderEventWithSubEvents(evt))}
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
                  {timelineData.undatedEvents.map(evt => renderEventWithSubEvents(evt))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
