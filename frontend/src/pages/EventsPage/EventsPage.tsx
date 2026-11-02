import { useState, useEffect, useRef, useMemo, use } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
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

export const formatParticipantsSummary = (evt: TimelineEventDto): string => {
  if (evt.participants.length === 0) return 'Brak przypisanych osób';
  return evt.participants
    .map(p => {
      if (p.participantText) return p.participantText;
      return `${p.surname ?? ''} ${p.givenName ?? ''}`.trim();
    })
    .filter(Boolean)
    .join(' & ');
};

export const toSnakeCasePreview = (input: string): string => {
  const lower = input
    .trim()
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const cleaned = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'wydarzenie';
};

const parseOptInt = (val: string): number | null => {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
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

  // Committed year bounds (trigger API calls) vs Draft year bounds (smooth slider dragging)
  const [boundsInitialized, setBoundsInitialized] = useState<boolean>(false);
  const [minBound, setMinBound] = useState<number>(1800);
  const [maxBound, setMaxBound] = useState<number>(2026);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [draftYearFrom, setDraftYearFrom] = useState<number>(1800);
  const [draftYearTo, setDraftYearTo] = useState<number>(2026);

  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  // Point 10: Default sort order is DESC (newest decades first)
  const [sortOrder, setSortOrder] = useState<string>('DESC');

  // Admin Create Event Form State
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [formTypeCodes, setFormTypeCodes] = useState<string[]>(['FAMILY_GATHERING']);
  const [formTypeSearch, setFormTypeSearch] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formFolderSlug, setFormFolderSlug] = useState<string>('');

  // Multi-Parent Events State
  const [formParentEventIds, setFormParentEventIds] = useState<number[]>([]);
  const [parentSearchQuery, setParentSearchQuery] = useState<string>('');

  // Start Date & Time (Single or "Between" Range)
  const [formIsStartBetween, setFormIsStartBetween] = useState<boolean>(false);
  const [formStartQual, setFormStartQual] = useState<string>('EXACT');
  const [formStartYear, setFormStartYear] = useState<string>('');
  const [formStartMonth, setFormStartMonth] = useState<string>('');
  const [formStartDay, setFormStartDay] = useState<string>('');
  const [formStartTimeQual, setFormStartTimeQual] = useState<string>('EXACT');
  const [formStartHour, setFormStartHour] = useState<string>('');
  const [formStartMinute, setFormStartMinute] = useState<string>('');
  const [formStartSecond, setFormStartSecond] = useState<string>('');

  const [formStartRangeEndQual, setFormStartRangeEndQual] = useState<string>('EXACT');
  const [formStartRangeEndYear, setFormStartRangeEndYear] = useState<string>('');
  const [formStartRangeEndMonth, setFormStartRangeEndMonth] = useState<string>('');
  const [formStartRangeEndDay, setFormStartRangeEndDay] = useState<string>('');
  const [formStartRangeEndTimeQual, setFormStartRangeEndTimeQual] = useState<string>('EXACT');
  const [formStartRangeEndHour, setFormStartRangeEndHour] = useState<string>('');
  const [formStartRangeEndMinute, setFormStartRangeEndMinute] = useState<string>('');
  const [formStartRangeEndSecond, setFormStartRangeEndSecond] = useState<string>('');

  // End Date & Time ("From ... To ..." Period, Single or "Between" Range)
  const [formHasEndDate, setFormHasEndDate] = useState<boolean>(false);
  const [formIsEndBetween, setFormIsEndBetween] = useState<boolean>(false);
  const [formEndQual, setFormEndQual] = useState<string>('EXACT');
  const [formEndYear, setFormEndYear] = useState<string>('');
  const [formEndMonth, setFormEndMonth] = useState<string>('');
  const [formEndDay, setFormEndDay] = useState<string>('');
  const [formEndTimeQual, setFormEndTimeQual] = useState<string>('EXACT');
  const [formEndHour, setFormEndHour] = useState<string>('');
  const [formEndMinute, setFormEndMinute] = useState<string>('');
  const [formEndSecond, setFormEndSecond] = useState<string>('');

  const [formEndRangeEndQual, setFormEndRangeEndQual] = useState<string>('EXACT');
  const [formEndRangeEndYear, setFormEndRangeEndYear] = useState<string>('');
  const [formEndRangeEndMonth, setFormEndRangeEndMonth] = useState<string>('');
  const [formEndRangeEndDay, setFormEndRangeEndDay] = useState<string>('');
  const [formEndRangeEndTimeQual, setFormEndRangeEndTimeQual] = useState<string>('EXACT');
  const [formEndRangeEndHour, setFormEndRangeEndHour] = useState<string>('');
  const [formEndRangeEndMinute, setFormEndRangeEndMinute] = useState<string>('');
  const [formEndRangeEndSecond, setFormEndRangeEndSecond] = useState<string>('');

  // Participants State
  const [formParticipants, setFormParticipants] = useState<
    (SaveEventParticipantRequestDto & { displayLabel: string; fullNameForSlug: string })[]
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
        setDraftYearFrom(data.minAvailableYear);
        setDraftYearTo(data.maxAvailableYear);
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
          if (ev.subEvents) {
            for (const sub of ev.subEvents) {
              list.push(sub);
            }
          }
        }
      }
    }
    for (const u of timelineData.undatedEvents) {
      list.push(u);
    }
    return list;
  }, [timelineData]);

  const filteredParentCandidates = useMemo<TimelineEventDto[]>(() => {
    const q = parentSearchQuery.trim().toLowerCase();
    return flatParentCandidateEvents
      .filter(ev => !formParentEventIds.includes(ev.eventId))
      .filter(ev => {
        if (!q) return true;
        const typesStr = (ev.assignedTypeLabels ?? [ev.typeLabel]).join(' ');
        const partsStr = formatParticipantsSummary(ev);
        const combined = `${ev.title ?? ''} ${typesStr} ${ev.dateText ?? ''} ${ev.locationName ?? ''} ${partsStr}`.toLowerCase();
        return combined.includes(q);
      })
      .slice(0, 12);
  }, [flatParentCandidateEvents, formParentEventIds, parentSearchQuery]);

  const suggestedFolderPreview = useMemo<string>(() => {
    const y = parseOptInt(formStartYear);
    const m = parseOptInt(formStartMonth);
    const d = parseOptInt(formStartDay);
    let datePrefix = '';
    if (y !== null) {
      datePrefix = String(y);
      if (m !== null) {
        datePrefix += `_${String(m).padStart(2, '0')}`;
        if (d !== null) {
          datePrefix += `_${String(d).padStart(2, '0')}`;
        }
      }
    }
    const primaryCode = formTypeCodes[0] ?? 'event';
    const namePart =
      formTitle.trim() !== ''
        ? toSnakeCasePreview(formTitle)
        : toSnakeCasePreview(primaryCode);

    const personSlugs =
      formParticipants.length > 3
        ? []
        : formParticipants
            .map(fp => toSnakeCasePreview(fp.fullNameForSlug))
            .filter(Boolean)
            .slice(0, 3);

    const suffix =
      personSlugs.length > 0 ? `${namePart}_${personSlugs.join('_')}` : namePart;
    const baseSlug = datePrefix ? `${datePrefix}_${suffix}` : suffix;
    return formFolderSlug.trim() !== '' ? toSnakeCasePreview(formFolderSlug) : baseSlug;
  }, [
    formStartYear,
    formStartMonth,
    formStartDay,
    formTypeCodes,
    formTitle,
    formParticipants,
    formFolderSlug,
  ]);

  const handleDraftYearFromChange = (rawVal: number) => {
    if (Number.isNaN(rawVal)) return;
    const clamped = Math.min(Math.max(rawVal, minBound), draftYearTo);
    setDraftYearFrom(clamped);
  };

  const handleDraftYearToChange = (rawVal: number) => {
    if (Number.isNaN(rawVal)) return;
    const clamped = Math.max(Math.min(rawVal, maxBound), draftYearFrom);
    setDraftYearTo(clamped);
  };

  const commitDraftYears = () => {
    if (yearFrom !== draftYearFrom) {
      setYearFrom(draftYearFrom);
    }
    if (yearTo !== draftYearTo) {
      setYearTo(draftYearTo);
    }
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

  // Point 3: Freely toggle any event type without blocking unchecking the last one
  const toggleFormEventType = (code: string) => {
    setFormTypeCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleMoveParentOrder = (index: number, direction: -1 | 1) => {
    setFormParentEventIds(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
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
    const fullNameForSlug = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    setFormParticipants(prev => [
      ...prev,
      {
        personId: p.id,
        roleCode: partRoleCode,
        displayLabel: `${label} (${ROLE_LABELS[partRoleCode] ?? partRoleCode})`,
        fullNameForSlug,
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
        fullNameForSlug: text,
      },
    ]);
    setPartTextInput('');
  };

  const handleCreateEventSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (formTypeCodes.length === 0) {
      setErrorMessage('Wybierz przynajmniej jeden typ wydarzenia.');
      return;
    }

    if (formParticipants.length > 3 && formTitle.trim() === '') {
      setErrorMessage(
        'Gdy w wydarzeniu uczestniczą więcej niż 3 osoby, podanie własnego tytułu wydarzenia jest wymagane.'
      );
      return;
    }

    try {
      const created = await eventTimelineApi.createEvent({
        typeCodes: formTypeCodes,
        title: formTitle.trim() || null,
        description: formDesc.trim() || null,
        folderSlug: formFolderSlug.trim() || null,
        parentEventIds: formParentEventIds,
        locationName: formLocation.trim() || null,

        isStartBetweenRange: formIsStartBetween,
        startQualifier: formStartQual,
        startYear: parseOptInt(formStartYear),
        startMonth: parseOptInt(formStartMonth),
        startDay: parseOptInt(formStartDay),
        startTimeQualifier: formStartTimeQual,
        startHour: parseOptInt(formStartHour),
        startMinute: parseOptInt(formStartMinute),
        startSecond: parseOptInt(formStartSecond),

        startRangeEndQualifier: formStartRangeEndQual,
        startRangeEndYear: parseOptInt(formStartRangeEndYear),
        startRangeEndMonth: parseOptInt(formStartRangeEndMonth),
        startRangeEndDay: parseOptInt(formStartRangeEndDay),
        startRangeEndTimeQualifier: formStartRangeEndTimeQual,
        startRangeEndHour: parseOptInt(formStartRangeEndHour),
        startRangeEndMinute: parseOptInt(formStartRangeEndMinute),
        startRangeEndSecond: parseOptInt(formStartRangeEndSecond),

        hasEndDate: formHasEndDate,
        isEndBetweenRange: formIsEndBetween,
        endQualifier: formEndQual,
        endYear: parseOptInt(formEndYear),
        endMonth: parseOptInt(formEndMonth),
        endDay: parseOptInt(formEndDay),
        endTimeQualifier: formEndTimeQual,
        endHour: parseOptInt(formEndHour),
        endMinute: parseOptInt(formEndMinute),
        endSecond: parseOptInt(formEndSecond),

        endRangeEndQualifier: formEndRangeEndQual,
        endRangeEndYear: parseOptInt(formEndRangeEndYear),
        endRangeEndMonth: parseOptInt(formEndRangeEndMonth),
        endRangeEndDay: parseOptInt(formEndRangeEndDay),
        endRangeEndTimeQualifier: formEndRangeEndTimeQual,
        endRangeEndHour: parseOptInt(formEndRangeEndHour),
        endRangeEndMinute: parseOptInt(formEndRangeEndMinute),
        endRangeEndSecond: parseOptInt(formEndRangeEndSecond),

        participants: formParticipants.map(fp => ({
          personId: fp.personId,
          participantText: fp.participantText,
          participantSex: fp.participantSex,
          roleCode: fp.roleCode,
        })),
      });
      setShowCreateForm(false);
      void navigate(`/events/${String(created.eventId)}`);
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się utworzyć nowego wydarzenia. Sprawdź poprawność wprowadzonych dat.');
      }
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

  const filteredFormTypes = availableTypes.filter(t =>
    t.label.toLowerCase().includes(formTypeSearch.trim().toLowerCase())
  );

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

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {/* Admin Create Event Form */}
      {isAdmin && showCreateForm && (
        <section className={styles.detailsCard} data-testid="create-event-form-section">
          <h2 className={styles.sectionSubtitle}>Dodaj nowe wydarzenie rodzinne</h2>
          <form
            onSubmit={e => {
              void handleCreateEventSubmit(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
          >
            {/* 1. Modern Multi-Type Selector */}
            <div className={styles.selectorPanel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className={styles.filterLabel}>
                  Przypisane typy wydarzenia (wybrano: {String(formTypeCodes.length)}) *
                </span>
                {formTypeCodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormTypeCodes([]);
                    }}
                    className={styles.popoverActionBtn}
                  >
                    Wyczyść wszystkie typy
                  </button>
                )}
              </div>

              <div className={styles.selectedPillsRow}>
                {formTypeCodes.length === 0 ? (
                  <span style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
                    Brak wybranego typu – kliknij przynajmniej jeden typ poniżej.
                  </span>
                ) : (
                  formTypeCodes.map(code => {
                    const label = availableTypes.find(t => t.code === code)?.label ?? code;
                    return (
                      <span key={code} className={styles.selectedTypePill}>
                        <span>{label}</span>
                        <button
                          type="button"
                          aria-label={`Usuń typ ${label}`}
                          onClick={() => {
                            toggleFormEventType(code);
                          }}
                          className={styles.pillRemoveBtn}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              <input
                type="text"
                placeholder="Filtruj listę dostępnych typów wydarzenia (np. ślub, chrzest, wakacje, szkoła)..."
                value={formTypeSearch}
                onChange={e => {
                  setFormTypeSearch(e.target.value);
                }}
                className={styles.textInput}
              />

              <div className={styles.availableTypePillsGrid}>
                {filteredFormTypes.map(opt => {
                  const isSelected = formTypeCodes.includes(opt.code);
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => {
                        toggleFormEventType(opt.code);
                      }}
                      className={`${styles.typeChoiceChip} ${
                        isSelected ? styles.typeChoiceChipSelected : ''
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Title, Location & Custom Folder Slug */}
            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="new-evt-title" className={styles.filterLabel}>
                  Własny tytuł wydarzenia{' '}
                  {formParticipants.length > 3
                    ? '* (wymagany przy >3 uczestnikach)'
                    : '(opcjonalnie)'}
                </label>
                <input
                  id="new-evt-title"
                  data-testid="new-event-title-input"
                  type="text"
                  required={formParticipants.length > 3}
                  placeholder="np. Wakacje nad morzem w Kołobrzegu"
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
                  placeholder="np. Kołobrzeg"
                  value={formLocation}
                  onChange={e => {
                    setFormLocation(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="new-evt-folder" className={styles.filterLabel}>
                  Nazwa folderu docelowego na dysku (snake_case)
                </label>
                <input
                  id="new-evt-folder"
                  type="text"
                  placeholder={suggestedFolderPreview}
                  value={formFolderSlug}
                  onChange={e => {
                    setFormFolderSlug(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.folderPreviewBanner}>
              📁 Proponowana nazwa folderu tego wydarzenia: <strong>{suggestedFolderPreview}</strong>
              {formParentEventIds.length > 0 && (
                <span>
                  {' '}
                  (zostanie umieszczony jako podfolder wewnątrz pierwszego wybranego wydarzenia nadrzędnego)
                </span>
              )}
            </div>

            {/* 3. Start Date & Time Section */}
            <div className={styles.dateSectionBox}>
              <div className={styles.dateSectionHeader}>
                <span className={styles.filterLabel}>
                  📅 Data i czas rozpoczęcia (lub jedyna data wydarzenia)
                </span>
                <label className={styles.inlineToggleLabel}>
                  <input
                    type="checkbox"
                    checked={formIsStartBetween}
                    onChange={e => {
                      setFormIsStartBetween(e.target.checked);
                    }}
                  />
                  <span>Przedział niepewności „między … a …” (np. między dwoma dniami lub godzinami)</span>
                </label>
              </div>

              <div className={styles.dateSubGrid}>
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
                    data-testid="new-event-start-year"
                    type="number"
                    placeholder="RRRR"
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
                    placeholder="MM"
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
                    placeholder="DD"
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

                <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.filterLabel}>
                    Godzina, minuta, sekunda (GG : MM : SS)
                  </span>
                  <div className={styles.timeTripletGroup}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      placeholder="GG"
                      aria-label="Godzina początkowa"
                      value={formStartHour}
                      onChange={e => {
                        setFormStartHour(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      placeholder="MM"
                      aria-label="Minuta początkowa"
                      value={formStartMinute}
                      onChange={e => {
                        setFormStartMinute(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      placeholder="SS"
                      aria-label="Sekunda początkowa"
                      value={formStartSecond}
                      onChange={e => {
                        setFormStartSecond(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>
                </div>
              </div>

              {formIsStartBetween && (
                <div className={styles.dateSubGrid} style={{ paddingTop: '0.6rem', borderTop: '1px dashed #cbd5e1' }}>
                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Druga granica („… a …”)</span>
                    <select
                      value={formStartRangeEndQual}
                      onChange={e => {
                        setFormStartRangeEndQual(e.target.value);
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
                    <span className={styles.filterLabel}>Rok (do)</span>
                    <input
                      type="number"
                      placeholder={formStartYear || 'RRRR'}
                      value={formStartRangeEndYear}
                      onChange={e => {
                        setFormStartRangeEndYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Miesiąc (do)</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      placeholder={formStartMonth || 'MM'}
                      value={formStartRangeEndMonth}
                      onChange={e => {
                        setFormStartRangeEndMonth(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Dzień (do)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      placeholder={formStartDay || 'DD'}
                      value={formStartRangeEndDay}
                      onChange={e => {
                        setFormStartRangeEndDay(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Kwalifikator czasu</span>
                    <select
                      value={formStartRangeEndTimeQual}
                      onChange={e => {
                        setFormStartRangeEndTimeQual(e.target.value);
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

                  <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
                    <span className={styles.filterLabel}>Godzina (do) (GG : MM : SS)</span>
                    <div className={styles.timeTripletGroup}>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        placeholder="GG"
                        value={formStartRangeEndHour}
                        onChange={e => {
                          setFormStartRangeEndHour(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="MM"
                        value={formStartRangeEndMinute}
                        onChange={e => {
                          setFormStartRangeEndMinute(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="SS"
                        value={formStartRangeEndSecond}
                        onChange={e => {
                          setFormStartRangeEndSecond(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ paddingTop: '0.4rem', borderTop: '1px solid #e2e8f0' }}>
                <label className={styles.inlineToggleLabel}>
                  <input
                    type="checkbox"
                    data-testid="toggle-has-end-date-checkbox"
                    checked={formHasEndDate}
                    onChange={e => {
                      setFormHasEndDate(e.target.checked);
                    }}
                  />
                  <span>
                    Wydarzenie trwało w czasie – dodaj datę lub godzinę zakończenia („od … do …”, np. kilkudniowe wakacje)
                  </span>
                </label>
              </div>
            </div>

            {/* 4. End Date & Time Section (when formHasEndDate is true) */}
            {formHasEndDate && (
              <div className={styles.dateSectionBox} data-testid="end-date-section-box">
                <div className={styles.dateSectionHeader}>
                  <span className={styles.filterLabel}>🏁 Data i czas zakończenia („do …”)</span>
                  <label className={styles.inlineToggleLabel}>
                    <input
                      type="checkbox"
                      checked={formIsEndBetween}
                      onChange={e => {
                        setFormIsEndBetween(e.target.checked);
                      }}
                    />
                    <span>Przedział niepewności „między … a …” dla końca wydarzenia</span>
                  </label>
                </div>

                <div className={styles.dateSubGrid}>
                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Kwalifikator daty końcowej</span>
                    <select
                      value={formEndQual}
                      onChange={e => {
                        setFormEndQual(e.target.value);
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
                    <span className={styles.filterLabel}>Rok zakończenia</span>
                    <input
                      type="number"
                      data-testid="new-event-end-year"
                      placeholder={formStartYear || 'RRRR'}
                      value={formEndYear}
                      onChange={e => {
                        setFormEndYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Miesiąc (1–12)</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      placeholder="MM"
                      value={formEndMonth}
                      onChange={e => {
                        setFormEndMonth(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Dzień (1–31)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      placeholder="DD"
                      value={formEndDay}
                      onChange={e => {
                        setFormEndDay(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.filterLabel}>Kwalifikator czasu</span>
                    <select
                      value={formEndTimeQual}
                      onChange={e => {
                        setFormEndTimeQual(e.target.value);
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

                  <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
                    <span className={styles.filterLabel}>Godzina zakończenia (GG : MM : SS)</span>
                    <div className={styles.timeTripletGroup}>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        placeholder="GG"
                        value={formEndHour}
                        onChange={e => {
                          setFormEndHour(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="MM"
                        value={formEndMinute}
                        onChange={e => {
                          setFormEndMinute(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="SS"
                        value={formEndSecond}
                        onChange={e => {
                          setFormEndSecond(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>
                  </div>
                </div>

                {formIsEndBetween && (
                  <div className={styles.dateSubGrid} style={{ paddingTop: '0.6rem', borderTop: '1px dashed #cbd5e1' }}>
                    <div className={styles.formField}>
                      <span className={styles.filterLabel}>Druga granica końca („… a …”)</span>
                      <select
                        value={formEndRangeEndQual}
                        onChange={e => {
                          setFormEndRangeEndQual(e.target.value);
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
                      <span className={styles.filterLabel}>Rok (do)</span>
                      <input
                        type="number"
                        placeholder={formEndYear || formStartYear || 'RRRR'}
                        value={formEndRangeEndYear}
                        onChange={e => {
                          setFormEndRangeEndYear(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.filterLabel}>Miesiąc (do)</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        placeholder="MM"
                        value={formEndRangeEndMonth}
                        onChange={e => {
                          setFormEndRangeEndMonth(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.filterLabel}>Dzień (do)</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="DD"
                        value={formEndRangeEndDay}
                        onChange={e => {
                          setFormEndRangeEndDay(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.filterLabel}>Kwalifikator czasu</span>
                      <select
                        value={formEndRangeEndTimeQual}
                        onChange={e => {
                          setFormEndRangeEndTimeQual(e.target.value);
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

                    <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
                      <span className={styles.filterLabel}>Godzina (do) (GG : MM : SS)</span>
                      <div className={styles.timeTripletGroup}>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={formEndRangeEndHour}
                          onChange={e => {
                            setFormEndRangeEndHour(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="MM"
                          value={formEndRangeEndMinute}
                          onChange={e => {
                            setFormEndRangeEndMinute(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="SS"
                          value={formEndRangeEndSecond}
                          onChange={e => {
                            setFormEndRangeEndSecond(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. Multiple Parent Events Search & Picker */}
            <div className={styles.selectorPanel}>
              <span className={styles.filterLabel}>
                Wydarzenia nadrzędne (opcjonalnie – pierwsze dodane wydarzenie nadrzędne określa folder macierzysty na dysku):
              </span>

              {formParentEventIds.length > 0 && (
                <div className={styles.selectedParentsList}>
                  {formParentEventIds.map((pid, idx) => {
                    const found = flatParentCandidateEvents.find(ev => ev.eventId === pid);
                    const titleStr = found
                      ? found.title
                        ? `${found.title} (${found.typeLabel})`
                        : found.typeLabel
                      : 'Wybrane wydarzenie';
                    return (
                      <div key={pid} className={styles.selectedParentCard}>
                        <div className={styles.parentCandidateInfo}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={styles.parentCandidateTitle}>
                              {String(idx + 1)}. {titleStr}
                            </span>
                            {idx === 0 && (
                              <span className={styles.primaryFolderBadge}>
                                📁 Główny folder nadrzędny
                              </span>
                            )}
                          </div>
                          {found && (
                            <div className={styles.parentCandidateMeta}>
                              {found.dateText && <span>📅 {found.dateText}</span>}
                              <span>👤 {formatParticipantsSummary(found)}</span>
                              {found.locationName && <span>📍 {found.locationName}</span>}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              handleMoveParentOrder(idx, -1);
                            }}
                            className={styles.btnSecondary}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={idx === formParentEventIds.length - 1}
                            onClick={() => {
                              handleMoveParentOrder(idx, 1);
                            }}
                            className={styles.btnSecondary}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormParentEventIds(prev => prev.filter(id => id !== pid));
                            }}
                            className={styles.btnDanger}
                          >
                            ✕ Usuń
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <input
                type="text"
                placeholder="Wyszukaj wydarzenie nadrzędne po uczestnikach, tytule, typie, dacie lub miejscowości..."
                value={parentSearchQuery}
                onChange={e => {
                  setParentSearchQuery(e.target.value);
                }}
                className={styles.textInput}
              />

              {filteredParentCandidates.length > 0 && (
                <div className={styles.parentCandidateList}>
                  {filteredParentCandidates.map(cand => {
                    const typesStr = (cand.assignedTypeLabels ?? [cand.typeLabel]).join(' • ');
                    return (
                      <div key={cand.eventId} className={styles.parentCandidateRow}>
                        <div className={styles.parentCandidateInfo}>
                          <span className={styles.parentCandidateTitle}>
                            {cand.title ? `${cand.title} (${typesStr})` : typesStr}
                          </span>
                          <div className={styles.parentCandidateMeta}>
                            <span>📅 {cand.dateText ?? cand.year ?? 'Bez daty'}</span>
                            <span>👤 {formatParticipantsSummary(cand)}</span>
                            {cand.locationName && <span>📍 {cand.locationName}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormParentEventIds(prev => [...prev, cand.eventId]);
                          }}
                          className={styles.btnSecondary}
                        >
                          + Dodaj jako nadrzędne
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 6. Markdown Description */}
            <div className={styles.formField}>
              <label htmlFor="new-evt-desc" className={styles.filterLabel}>
                Opis wydarzenia (obsługuje formatowanie Markdown: ## sekcje, ### podsekcje, **pogrubienie**, *kursywę*, - listy, &gt; cytaty)
              </label>
              <textarea
                id="new-evt-desc"
                placeholder="Wpisz opis przebiegu wydarzenia (możesz go też wygodnie rozbudować w edytorze Wiki po utworzeniu wydarzenia)..."
                value={formDesc}
                onChange={e => {
                  setFormDesc(e.target.value);
                }}
                className={styles.textareaInput}
              />
            </div>

            {/* 7. Participants Builder */}
            <div className={styles.selectorPanel}>
              <span className={styles.filterLabel}>
                Uczestnicy wydarzenia (wybrano: {String(formParticipants.length)}):
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
              <button
                type="submit"
                data-testid="submit-create-event-button"
                className={styles.btnPrimary}
              >
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

        {/* Point 11: Smooth Year Range Slider that commits only on mouseUp / touchEnd / blur */}
        {boundsInitialized && (
          <div className={styles.filterField} style={{ flex: '1.4 1 240px' }}>
            <span className={styles.filterLabel}>
              Zakres lat ({String(minBound)} – {String(maxBound)})
            </span>
            <div className={styles.yearRangeGroup}>
              <input
                type="number"
                aria-label="Od roku"
                min={minBound}
                max={draftYearTo}
                value={draftYearFrom}
                onChange={e => {
                  handleDraftYearFromChange(Number(e.target.value));
                }}
                onBlur={commitDraftYears}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    commitDraftYears();
                  }
                }}
                className={styles.textInput}
              />
              <span>–</span>
              <input
                type="number"
                aria-label="Do roku"
                min={draftYearFrom}
                max={maxBound}
                value={draftYearTo}
                onChange={e => {
                  handleDraftYearToChange(Number(e.target.value));
                }}
                onBlur={commitDraftYears}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    commitDraftYears();
                  }
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
                    left: `${String(((draftYearFrom - minBound) / (maxBound - minBound)) * 100)}%`,
                    width: `${String(((draftYearTo - draftYearFrom) / (maxBound - minBound)) * 100)}%`,
                  }}
                />
                <input
                  type="range"
                  aria-label="Suwak od roku"
                  data-testid="slider-year-from"
                  min={minBound}
                  max={maxBound}
                  value={draftYearFrom}
                  onChange={e => {
                    handleDraftYearFromChange(Number(e.target.value));
                  }}
                  onMouseUp={commitDraftYears}
                  onTouchEnd={commitDraftYears}
                  onKeyUp={commitDraftYears}
                  className={styles.dualRangeInput}
                />
                <input
                  type="range"
                  aria-label="Suwak do roku"
                  data-testid="slider-year-to"
                  min={minBound}
                  max={maxBound}
                  value={draftYearTo}
                  onChange={e => {
                    handleDraftYearToChange(Number(e.target.value));
                  }}
                  onMouseUp={commitDraftYears}
                  onTouchEnd={commitDraftYears}
                  onKeyUp={commitDraftYears}
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
            data-testid="events-sort-select"
            value={sortOrder}
            onChange={e => {
              setSortOrder(e.target.value);
            }}
            className={styles.selectInput}
          >
            <option value="DESC">Od najnowszych dekad</option>
            <option value="ASC">Od najstarszych (chronologicznie)</option>
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