import { useState, useEffect, useMemo, use } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import MediaGallerySection from '../../components/MediaSection/MediaGallerySection';
import WikiEventDescriptionSection from '../../components/WikiEventDescription/WikiEventDescriptionSection';
import {
  formatParticipantsSummary,
  getPolishWeekdayLabel,
  QUALIFIER_OPTIONS,
  ROLE_LABELS,
  toIsoDateInputValue,
} from './EventsPage';
import styles from './EventsPage.module.css';
import type {
  EventTypeOptionDto,
  SaveEventParticipantRequestDto,
  TimelineEventDto,
} from '../../types/eventTimeline';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

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

const parseOptInt = (val: string): number | null => {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
};

const numToStr = (val: number | null | undefined): string =>
  val !== undefined && val !== null ? String(val) : '';

export default function EventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [eventData, setEventData] = useState<TimelineEventDto | null>(null);
  const [availableTypes, setAvailableTypes] = useState<EventTypeOptionDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin Full Edit State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [typeCodes, setTypeCodes] = useState<string[]>([]);
  const [typeSearch, setTypeSearch] = useState<string>('');
  const [titleInput, setTitleInput] = useState<string>('');
  const [descInput, setDescInput] = useState<string>('');
  const [locInput, setLocInput] = useState<string>('');

  // Multi-Parent Events State
  const [parentEventIds, setParentEventIds] = useState<number[]>([]);
  const [parentSearchQuery, setParentSearchQuery] = useState<string>('');
  const [candidateParentEvents, setCandidateParentEvents] = useState<TimelineEventDto[]>([]);

  // Start Date & Time State
  const [isStartBetween, setIsStartBetween] = useState<boolean>(false);
  const [startQual, setStartQual] = useState<string>('EXACT');
  const [startYear, setStartYear] = useState<string>('');
  const [startMonth, setStartMonth] = useState<string>('');
  const [startDay, setStartDay] = useState<string>('');
  const [startTimeQual, setStartTimeQual] = useState<string>('EXACT');
  const [startHour, setStartHour] = useState<string>('');
  const [startMinute, setStartMinute] = useState<string>('');
  const [startSecond, setStartSecond] = useState<string>('');

  const [startRangeEndQual, setStartRangeEndQual] = useState<string>('EXACT');
  const [startRangeEndYear, setStartRangeEndYear] = useState<string>('');
  const [startRangeEndMonth, setStartRangeEndMonth] = useState<string>('');
  const [startRangeEndDay, setStartRangeEndDay] = useState<string>('');
  const [startRangeEndTimeQual, setStartRangeEndTimeQual] = useState<string>('EXACT');
  const [startRangeEndHour, setStartRangeEndHour] = useState<string>('');
  const [startRangeEndMinute, setStartRangeEndMinute] = useState<string>('');
  const [startRangeEndSecond, setStartRangeEndSecond] = useState<string>('');

  // End Date & Time State
  const [hasEndDate, setHasEndDate] = useState<boolean>(false);
  const [isEndBetween, setIsEndBetween] = useState<boolean>(false);
  const [endQual, setEndQual] = useState<string>('EXACT');
  const [endYear, setEndYear] = useState<string>('');
  const [endMonth, setEndMonth] = useState<string>('');
  const [endDay, setEndDay] = useState<string>('');
  const [endTimeQual, setEndTimeQual] = useState<string>('EXACT');
  const [endHour, setEndHour] = useState<string>('');
  const [endMinute, setEndMinute] = useState<string>('');
  const [endSecond, setEndSecond] = useState<string>('');

  const [endRangeEndQual, setEndRangeEndQual] = useState<string>('EXACT');
  const [endRangeEndYear, setEndRangeEndYear] = useState<string>('');
  const [endRangeEndMonth, setEndRangeEndMonth] = useState<string>('');
  const [endRangeEndDay, setEndRangeEndDay] = useState<string>('');
  const [endRangeEndTimeQual, setEndRangeEndTimeQual] = useState<string>('EXACT');
  const [endRangeEndHour, setEndRangeEndHour] = useState<string>('');
  const [endRangeEndMinute, setEndRangeEndMinute] = useState<string>('');
  const [endRangeEndSecond, setEndRangeEndSecond] = useState<string>('');

  // Participants State
  const [editParticipants, setEditParticipants] = useState<
    (SaveEventParticipantRequestDto & { displayLabel: string })[]
  >([]);
  const [partRoleCode, setPartRoleCode] = useState<string>('PRINCIPAL');
  const [partPersonQuery, setPartPersonQuery] = useState<string>('');
  const [partPersonResults, setPartPersonResults] = useState<PersonListItemDto[]>([]);
  const [partTextInput, setPartTextInput] = useState<string>('');
  const [partTextSex, setPartTextSex] = useState<PersonSex>('UNKNOWN');

  const syncEditForm = (result: TimelineEventDto) => {
    setTypeCodes(
      result.assignedTypeCodes && result.assignedTypeCodes.length > 0
        ? result.assignedTypeCodes
        : [result.typeCode]
    );
    setTitleInput(result.title ?? '');
    setDescInput(result.description ?? '');
    setLocInput(result.locationName ?? '');

    if (result.parentEvents && result.parentEvents.length > 0) {
      setParentEventIds(result.parentEvents.map(p => p.eventId));
    } else if (result.parentEventId !== undefined && result.parentEventId !== null) {
      setParentEventIds([result.parentEventId]);
    } else {
      setParentEventIds([]);
    }

    setIsStartBetween(result.startDateType === 'RANGE');
    setStartQual(result.startQualifier ?? 'EXACT');
    setStartYear(numToStr(result.startYear));
    setStartMonth(numToStr(result.startMonth));
    setStartDay(numToStr(result.startDay));
    setStartTimeQual(result.startTimeQualifier ?? 'EXACT');
    setStartHour(numToStr(result.startHour));
    setStartMinute(numToStr(result.startMinute));
    setStartSecond(numToStr(result.startSecond));

    setStartRangeEndQual(result.startRangeEndQualifier ?? 'EXACT');
    setStartRangeEndYear(numToStr(result.startRangeEndYear));
    setStartRangeEndMonth(numToStr(result.startRangeEndMonth));
    setStartRangeEndDay(numToStr(result.startRangeEndDay));
    setStartRangeEndTimeQual(result.startRangeEndTimeQualifier ?? 'EXACT');
    setStartRangeEndHour(numToStr(result.startRangeEndHour));
    setStartRangeEndMinute(numToStr(result.startRangeEndMinute));
    setStartRangeEndSecond(numToStr(result.startRangeEndSecond));

    setHasEndDate(result.hasEndDate === true);
    setIsEndBetween(result.endDateType === 'RANGE');
    setEndQual(result.endQualifier ?? 'EXACT');
    setEndYear(numToStr(result.endYear));
    setEndMonth(numToStr(result.endMonth));
    setEndDay(numToStr(result.endDay));
    setEndTimeQual(result.endTimeQualifier ?? 'EXACT');
    setEndHour(numToStr(result.endHour));
    setEndMinute(numToStr(result.endMinute));
    setEndSecond(numToStr(result.endSecond));

    setEndRangeEndQual(result.endRangeEndQualifier ?? 'EXACT');
    setEndRangeEndYear(numToStr(result.endRangeEndYear));
    setEndRangeEndMonth(numToStr(result.endRangeEndMonth));
    setEndRangeEndDay(numToStr(result.endRangeEndDay));
    setEndRangeEndTimeQual(result.endRangeEndTimeQualifier ?? 'EXACT');
    setEndRangeEndHour(numToStr(result.endRangeEndHour));
    setEndRangeEndMinute(numToStr(result.endRangeEndMinute));
    setEndRangeEndSecond(numToStr(result.endRangeEndSecond));

    setEditParticipants(
      result.participants.map(p => {
        const name = p.participantText
          ? `${p.participantText} [spoza drzewa]`
          : `${p.surname ?? ''} ${p.givenName ?? ''}`.trim();
        return {
          personId: p.personId,
          participantText: p.participantText,
          participantSex: p.sex,
          roleCode: p.roleCode,
          displayLabel: `${name} (${p.roleLabel ?? p.roleCode})`,
        };
      })
    );
  };

  const fetchDetails = async () => {
    if (!eventId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await eventTimelineApi.getEventById(Number(eventId));
      setEventData(result);
      syncEditForm(result);
    } catch {
      setErrorMessage('Nie udało się pobrać szczegółów wydarzenia.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDetails();
  }, [eventId]);

  const allowedRolesForSelectedTypes = useMemo<string[]>(() => {
    const set = new Set<string>(['PRINCIPAL', 'PARTICIPANT', 'GUEST']);
    for (const code of typeCodes) {
      const found = availableTypes.find(t => t.code === code);
      if (found?.allowedRoleCodes) {
        for (const r of found.allowedRoleCodes) {
          set.add(r);
        }
      }
    }
    return Array.from(set);
  }, [typeCodes, availableTypes]);

  const filteredParentCandidates = useMemo<TimelineEventDto[]>(() => {
    const q = parentSearchQuery.trim().toLowerCase();
    return candidateParentEvents
      .filter(ev => !parentEventIds.includes(ev.eventId))
      .filter(ev => {
        if (!q) return true;
        const typesStr = (ev.assignedTypeLabels ?? [ev.typeLabel]).join(' ');
        const partsStr = formatParticipantsSummary(ev);
        const combined = `${ev.title ?? ''} ${typesStr} ${ev.dateText ?? ''} ${ev.locationName ?? ''} ${partsStr}`.toLowerCase();
        return combined.includes(q);
      })
      .slice(0, 12);
  }, [candidateParentEvents, parentEventIds, parentSearchQuery]);

  const handleOpenEdit = async () => {
    setIsEditing(prev => !prev);
    if (!isEditing && availableTypes.length === 0) {
      try {
        const [typesRes, timeline] = await Promise.all([
          eventTimelineApi.getAvailableTypes(),
          eventTimelineApi.getEventsTimeline({ includeUndated: true, size: 1000 }),
        ]);
        setAvailableTypes(typesRes);
        const flat: TimelineEventDto[] = [];
        for (const dec of timeline.decades) {
          for (const yr of dec.years) {
            for (const ev of yr.events) {
              if (String(ev.eventId) !== eventId) {
                flat.push(ev);
              }
              if (ev.subEvents) {
                for (const sub of ev.subEvents) {
                  if (String(sub.eventId) !== eventId) {
                    flat.push(sub);
                  }
                }
              }
            }
          }
        }
        for (const u of timeline.undatedEvents) {
          if (String(u.eventId) !== eventId) {
            flat.push(u);
          }
        }
        setCandidateParentEvents(flat);
      } catch {
        // Ignore load error
      }
    }
  };

  const toggleFormTypeCode = (code: string) => {
    setTypeCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleMoveParentOrder = (index: number, direction: -1 | 1) => {
    setParentEventIds(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSearchPerson = async () => {
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

  const handleSaveFullEvent = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!eventData) return;
    setErrorMessage(null);

    if (typeCodes.length === 0) {
      setErrorMessage('Wybierz przynajmniej jeden typ wydarzenia.');
      return;
    }

    if (editParticipants.length > 3 && titleInput.trim() === '') {
      setErrorMessage(
        'Gdy w wydarzeniu uczestniczą więcej niż 3 osoby, podanie własnego tytułu wydarzenia jest wymagane.'
      );
      return;
    }

    try {
      const updated = await eventTimelineApi.updateEvent(eventData.eventId, {
        typeCodes,
        title: titleInput.trim() || null,
        description: descInput.trim() || null,
        locationName: locInput.trim() || null,
        parentEventIds,

        isStartBetweenRange: isStartBetween,
        startQualifier: startQual,
        startYear: parseOptInt(startYear),
        startMonth: parseOptInt(startMonth),
        startDay: parseOptInt(startDay),
        startTimeQualifier: startTimeQual,
        startHour: parseOptInt(startHour),
        startMinute: parseOptInt(startMinute),
        startSecond: parseOptInt(startSecond),

        startRangeEndQualifier: startRangeEndQual,
        startRangeEndYear: parseOptInt(startRangeEndYear),
        startRangeEndMonth: parseOptInt(startRangeEndMonth),
        startRangeEndDay: parseOptInt(startRangeEndDay),
        startRangeEndTimeQualifier: startRangeEndTimeQual,
        startRangeEndHour: parseOptInt(startRangeEndHour),
        startRangeEndMinute: parseOptInt(startRangeEndMinute),
        startRangeEndSecond: parseOptInt(startRangeEndSecond),

        hasEndDate,
        isEndBetweenRange: isEndBetween,
        endQualifier: endQual,
        endYear: parseOptInt(endYear),
        endMonth: parseOptInt(endMonth),
        endDay: parseOptInt(endDay),
        endTimeQualifier: endTimeQual,
        endHour: parseOptInt(endHour),
        endMinute: parseOptInt(endMinute),
        endSecond: parseOptInt(endSecond),

        endRangeEndQualifier: endRangeEndQual,
        endRangeEndYear: parseOptInt(endRangeEndYear),
        endRangeEndMonth: parseOptInt(endRangeEndMonth),
        endRangeEndDay: parseOptInt(endRangeEndDay),
        endRangeEndTimeQualifier: endRangeEndTimeQual,
        endRangeEndHour: parseOptInt(endRangeEndHour),
        endRangeEndMinute: parseOptInt(endRangeEndMinute),
        endRangeEndSecond: parseOptInt(endRangeEndSecond),

        participants: editParticipants.map(ep => ({
          personId: ep.personId,
          participantText: ep.participantText,
          participantSex: ep.participantSex,
          roleCode: ep.roleCode,
        })),
      });
      setEventData(updated);
      syncEditForm(updated);
      setIsEditing(false);
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się zapisać zmian w wydarzeniu. Sprawdź poprawność wprowadzonych dat.');
      }
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventData) return;
    try {
      await eventTimelineApi.deleteEvent(eventData.eventId);
      void navigate('/events');
    } catch {
      setErrorMessage('Nie udało się usunąć tego wydarzenia.');
    }
  };

  const applyCalendarPick = (
    isoValue: string,
    setY: (v: string) => void,
    setM: (v: string) => void,
    setD: (v: string) => void
  ) => {
    if (!isoValue) return;
    const parts = isoValue.split('-');
    if (parts.length === 3) {
      setY(String(Number(parts[0])));
      setM(String(Number(parts[1])));
      setD(String(Number(parts[2])));
    }
  };

  const renderDateAndTimeBlock = (params: {
    idPrefix: string;
    dateQualLabel: string;
    dateQual: string;
    setDateQual: (v: string) => void;
    year: string;
    setYear: (v: string) => void;
    month: string;
    setMonth: (v: string) => void;
    day: string;
    setDay: (v: string) => void;
    timeQual: string;
    setTimeQual: (v: string) => void;
    hour: string;
    setHour: (v: string) => void;
    minute: string;
    setMinute: (v: string) => void;
    second: string;
    setSecond: (v: string) => void;
    yearPlaceholder?: string;
  }) => {
    const weekday = getPolishWeekdayLabel(params.year, params.month, params.day);
    const isoVal = toIsoDateInputValue(params.year, params.month, params.day);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Row 1: Date Qualifier + Calendar Picker (with weekday) + Year + Month + Day */}
        <div className={styles.dateRowGrid}>
          <div className={styles.formField}>
            <label htmlFor={`${params.idPrefix}-dqual`} className={styles.filterLabel}>
              {params.dateQualLabel}
            </label>
            <select
              id={`${params.idPrefix}-dqual`}
              value={params.dateQual}
              onChange={e => {
                params.setDateQual(e.target.value);
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
            <label htmlFor={`${params.idPrefix}-cal`} className={styles.filterLabel}>
              Wybór z kalendarza {weekday ? `(${weekday})` : ''}
            </label>
            <div className={styles.calendarPickerGroup}>
              <input
                id={`${params.idPrefix}-cal`}
                type="date"
                value={isoVal}
                onChange={e => {
                  applyCalendarPick(
                    e.target.value,
                    params.setYear,
                    params.setMonth,
                    params.setDay
                  );
                }}
                className={styles.textInput}
              />
              {weekday && <span className={styles.weekdayBadge}>📅 {weekday}</span>}
            </div>
          </div>

          <div className={styles.formField}>
            <label htmlFor={`${params.idPrefix}-year`} className={styles.filterLabel}>
              Rok
            </label>
            <input
              id={`${params.idPrefix}-year`}
              type="number"
              placeholder={params.yearPlaceholder ?? 'RRRR'}
              value={params.year}
              onChange={e => {
                params.setYear(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor={`${params.idPrefix}-month`} className={styles.filterLabel}>
              Miesiąc (1–12)
            </label>
            <input
              id={`${params.idPrefix}-month`}
              type="number"
              min={1}
              max={12}
              placeholder="MM"
              value={params.month}
              onChange={e => {
                params.setMonth(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor={`${params.idPrefix}-day`} className={styles.filterLabel}>
              Dzień (1–31)
            </label>
            <input
              id={`${params.idPrefix}-day`}
              type="number"
              min={1}
              max={31}
              placeholder="DD"
              value={params.day}
              onChange={e => {
                params.setDay(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>
        </div>

        {/* Row 2: Time Qualifier + Hour : Minute : Second */}
        <div className={styles.timeRowGrid}>
          <div className={styles.formField}>
            <label htmlFor={`${params.idPrefix}-tqual`} className={styles.filterLabel}>
              Kwalifikator czasu
            </label>
            <select
              id={`${params.idPrefix}-tqual`}
              value={params.timeQual}
              onChange={e => {
                params.setTimeQual(e.target.value);
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
            <span className={styles.filterLabel}>
              Godzina, minuta, sekunda (GG : MM : SS)
            </span>
            <div className={styles.timeTripletGroup}>
              <input
                type="number"
                min={0}
                max={23}
                placeholder="GG"
                aria-label="Godzina"
                value={params.hour}
                onChange={e => {
                  params.setHour(e.target.value);
                }}
                className={styles.textInput}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                placeholder="MM"
                aria-label="Minuta"
                value={params.minute}
                onChange={e => {
                  params.setMinute(e.target.value);
                }}
                className={styles.textInput}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                placeholder="SS"
                aria-label="Sekunda"
                value={params.second}
                onChange={e => {
                  params.setSecond(e.target.value);
                }}
                className={styles.textInput}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className={styles.pageWrapper}>
        <div role="alert" className={styles.AlertError}>
          {errorMessage ?? 'Nie znaleziono wydarzenia.'}
        </div>
        <div>
          <Link to="/events" className={styles.btnSecondary}>
            ← Wróć do osi czasu wydarzeń
          </Link>
        </div>
      </div>
    );
  }

  const participantIds = eventData.participants
    .map(p => p.personId)
    .filter((id): id is number => id !== null);

  const displayTypeLabels =
    eventData.assignedTypeLabels && eventData.assignedTypeLabels.length > 0
      ? eventData.assignedTypeLabels.join(' • ')
      : eventData.typeLabel;

  const filteredFormTypes = availableTypes.filter(t =>
    t.label.toLowerCase().includes(typeSearch.trim().toLowerCase())
  );

  const resolvedParentEvents =
    eventData.parentEvents && eventData.parentEvents.length > 0
      ? eventData.parentEvents
      : eventData.parentEventId
        ? [
            {
              eventId: eventData.parentEventId,
              label: eventData.parentEventLabel ?? 'Wydarzenie nadrzędne',
              typeLabel: '',
              primaryFolderParent: true,
            },
          ]
        : [];

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {eventData.title
              ? `${eventData.title} (${displayTypeLabels})`
              : displayTypeLabels}
          </h1>
          <p className={styles.pageSubtitle}>Szczegóły wydarzenia rodzinnego</p>
        </div>
        <div className={styles.headerRight}>
          {isAdmin && (
            <>
              <button
                type="button"
                data-testid="edit-event-details-button"
                onClick={() => {
                  void handleOpenEdit();
                }}
                className={styles.btnPrimary}
              >
                {isEditing ? 'Zamknij edycję' : '✏️ Edytuj wydarzenie'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteEvent();
                }}
                className={styles.btnDanger}
              >
                🗑️ Usuń wydarzenie
              </button>
            </>
          )}
          <Link to="/events" className={styles.btnSecondary}>
            ← Wróć do osi czasu wydarzeń
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {/* Admin Full Edit Form */}
      {isAdmin && isEditing && (
        <section className={styles.detailsCard} data-testid="edit-event-details-form">
          <h2 className={styles.sectionSubtitle}>
            Edycja typów, zakresów dat i czasu, uczestników oraz wydarzeń nadrzędnych
          </h2>
          <form
            onSubmit={e => {
              void handleSaveFullEvent(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
          >
            {/* 1. Modern Multi-Type Pill Selector */}
            {availableTypes.length > 0 && (
              <div className={styles.selectorPanel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span className={styles.filterLabel}>
                    Przypisane typy wydarzenia (wybrano: {String(typeCodes.length)}) *
                  </span>
                  {typeCodes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTypeCodes([]);
                      }}
                      className={styles.popoverActionBtn}
                    >
                      Wyczyść wszystkie typy
                    </button>
                  )}
                </div>

                <div className={styles.selectedPillsRow}>
                  {typeCodes.length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
                      Brak wybranego typu – kliknij przynajmniej jeden typ poniżej.
                    </span>
                  ) : (
                    typeCodes.map(code => {
                      const label = availableTypes.find(t => t.code === code)?.label ?? code;
                      return (
                        <span key={code} className={styles.selectedTypePill}>
                          <span>{label}</span>
                          <button
                            type="button"
                            aria-label={`Usuń typ ${label}`}
                            onClick={() => {
                              toggleFormTypeCode(code);
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
                  placeholder="Filtruj dostępne typy wydarzenia..."
                  value={typeSearch}
                  onChange={e => {
                    setTypeSearch(e.target.value);
                  }}
                  className={styles.textInput}
                />

                <div className={styles.availableTypePillsGrid}>
                  {filteredFormTypes.map(opt => {
                    const isSelected = typeCodes.includes(opt.code);
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => {
                          toggleFormTypeCode(opt.code);
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
            )}

            {/* 2. Title & Location */}
            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="evt-title-input" className={styles.filterLabel}>
                  Własny tytuł wydarzenia{' '}
                  {editParticipants.length > 3 ? '* (wymagany przy >3 uczestnikach)' : ''}
                </label>
                <input
                  id="evt-title-input"
                  type="text"
                  required={editParticipants.length > 3}
                  value={titleInput}
                  onChange={e => {
                    setTitleInput(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="evt-loc-input" className={styles.filterLabel}>
                  Miejsce / miejscowość
                </label>
                <input
                  id="evt-loc-input"
                  type="text"
                  value={locInput}
                  onChange={e => {
                    setLocInput(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* 3. Start Date & Time Section (Point 7: Date + Calendar row, separate Time row) */}
            <div className={styles.dateSectionBox}>
              <div className={styles.dateSectionHeader}>
                <span className={styles.filterLabel}>
                  📅 Data i czas rozpoczęcia (lub jedyna data wydarzenia)
                </span>
                <label className={styles.inlineToggleLabel}>
                  <input
                    type="checkbox"
                    checked={isStartBetween}
                    onChange={e => {
                      setIsStartBetween(e.target.checked);
                    }}
                  />
                  <span>Przedział niepewności „między … a …”</span>
                </label>
              </div>

              {renderDateAndTimeBlock({
                idPrefix: 'edit-evt-start',
                dateQualLabel: 'Kwalifikator daty',
                dateQual: startQual,
                setDateQual: setStartQual,
                year: startYear,
                setYear: setStartYear,
                month: startMonth,
                setMonth: setStartMonth,
                day: startDay,
                setDay: setStartDay,
                timeQual: startTimeQual,
                setTimeQual: setStartTimeQual,
                hour: startHour,
                setHour: setStartHour,
                minute: startMinute,
                setMinute: setStartMinute,
                second: startSecond,
                setSecond: setStartSecond,
              })}

              {isStartBetween && (
                <div style={{ paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
                  {renderDateAndTimeBlock({
                    idPrefix: 'edit-evt-start-range-end',
                    dateQualLabel: 'Druga granica („… a …”)',
                    dateQual: startRangeEndQual,
                    setDateQual: setStartRangeEndQual,
                    year: startRangeEndYear,
                    setYear: setStartRangeEndYear,
                    month: startRangeEndMonth,
                    setMonth: setStartRangeEndMonth,
                    day: startRangeEndDay,
                    setDay: setStartRangeEndDay,
                    timeQual: startRangeEndTimeQual,
                    setTimeQual: setStartRangeEndTimeQual,
                    hour: startRangeEndHour,
                    setHour: setStartRangeEndHour,
                    minute: startRangeEndMinute,
                    setMinute: setStartRangeEndMinute,
                    second: startRangeEndSecond,
                    setSecond: setStartRangeEndSecond,
                    yearPlaceholder: startYear || 'RRRR',
                  })}
                </div>
              )}

              <div style={{ paddingTop: '0.4rem', borderTop: '1px solid #e2e8f0' }}>
                <label className={styles.inlineToggleLabel}>
                  <input
                    type="checkbox"
                    checked={hasEndDate}
                    onChange={e => {
                      setHasEndDate(e.target.checked);
                    }}
                  />
                  <span>
                    Wydarzenie trwało w czasie – dodaj datę lub godzinę zakończenia („od … do …”)
                  </span>
                </label>
              </div>
            </div>

            {/* 4. End Date & Time Section */}
            {hasEndDate && (
              <div className={styles.dateSectionBox}>
                <div className={styles.dateSectionHeader}>
                  <span className={styles.filterLabel}>🏁 Data i czas zakończenia („do …”)</span>
                  <label className={styles.inlineToggleLabel}>
                    <input
                      type="checkbox"
                      checked={isEndBetween}
                      onChange={e => {
                        setIsEndBetween(e.target.checked);
                      }}
                    />
                    <span>Przedział niepewności „między … a …” dla końca wydarzenia</span>
                  </label>
                </div>

                {renderDateAndTimeBlock({
                  idPrefix: 'edit-evt-end',
                  dateQualLabel: 'Kwalifikator daty końcowej',
                  dateQual: endQual,
                  setDateQual: setEndQual,
                  year: endYear,
                  setYear: setEndYear,
                  month: endMonth,
                  setMonth: setEndMonth,
                  day: endDay,
                  setDay: setEndDay,
                  timeQual: endTimeQual,
                  setTimeQual: setEndTimeQual,
                  hour: endHour,
                  setHour: setEndHour,
                  minute: endMinute,
                  setMinute: setEndMinute,
                  second: endSecond,
                  setSecond: setEndSecond,
                  yearPlaceholder: startYear || 'RRRR',
                })}

                {isEndBetween && (
                  <div style={{ paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
                    {renderDateAndTimeBlock({
                      idPrefix: 'edit-evt-end-range-end',
                      dateQualLabel: 'Druga granica końca („… a …”)',
                      dateQual: endRangeEndQual,
                      setDateQual: setEndRangeEndQual,
                      year: endRangeEndYear,
                      setYear: setEndRangeEndYear,
                      month: endRangeEndMonth,
                      setMonth: setEndRangeEndMonth,
                      day: endRangeEndDay,
                      setDay: setEndRangeEndDay,
                      timeQual: endRangeEndTimeQual,
                      setTimeQual: setEndRangeEndTimeQual,
                      hour: endRangeEndHour,
                      setHour: setEndRangeEndHour,
                      minute: endRangeEndMinute,
                      setMinute: setEndRangeEndMinute,
                      second: endRangeEndSecond,
                      setSecond: setEndRangeEndSecond,
                      yearPlaceholder: endYear || startYear || 'RRRR',
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 5. Multiple Parent Events Search & Picker */}
            <div className={styles.selectorPanel}>
              <span className={styles.filterLabel}>
                Wydarzenia nadrzędne (pierwsze wydarzenie na liście określa folder macierzysty dla zdjęć):
              </span>

              {parentEventIds.length > 0 && (
                <div className={styles.selectedParentsList}>
                  {parentEventIds.map((pid, idx) => {
                    const found = candidateParentEvents.find(ev => ev.eventId === pid);
                    const existingSummary = eventData.parentEvents?.find(pe => pe.eventId === pid);
                    const titleStr = found
                      ? found.title
                        ? `${found.title} (${found.typeLabel})`
                        : found.typeLabel
                      : (existingSummary?.label ?? 'Wybrane wydarzenie nadrzędne');

                    return (
                      <div key={pid} className={styles.selectedParentCard}>
                        <div className={styles.parentCandidateInfo}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={styles.parentCandidateTitle}>
                              {String(idx + 1)}. {titleStr}
                            </span>
                            {idx === 0 && (
                              <span className={styles.primaryFolderBadge}>
                                📁 Główny rodzic
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
                            disabled={idx === parentEventIds.length - 1}
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
                              setParentEventIds(prev => prev.filter(id => id !== pid));
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
                            setParentEventIds(prev => [...prev, cand.eventId]);
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

            {/* 6. Participants Management in Edit Form */}
            <div className={styles.selectorPanel}>
              <span className={styles.filterLabel}>
                Uczestnicy wydarzenia ({String(editParticipants.length)}):
              </span>
              <div className={styles.detailsGrid}>
                <div className={styles.formField}>
                  <span className={styles.filterLabel}>Rola</span>
                  <select
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
                      placeholder="Szukaj..."
                      value={partPersonQuery}
                      onChange={e => {
                        setPartPersonQuery(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleSearchPerson();
                      }}
                      className={styles.btnSecondary}
                    >
                      Szukaj
                    </button>
                  </div>
                </div>

                <div className={styles.formField}>
                  <span className={styles.filterLabel}>Lub wpis tekstowy spoza bazy</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="np. Jan Nowak (świadek)"
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
                      style={{ width: '90px' }}
                    >
                      <option value="MALE">M</option>
                      <option value="FEMALE">K</option>
                      <option value="UNKNOWN">?</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (partTextInput.trim() === '') return;
                        const txt = partTextInput.trim();
                        setEditParticipants(prev => [
                          ...prev,
                          {
                            participantText: txt,
                            participantSex: partTextSex,
                            roleCode: partRoleCode,
                            displayLabel: `${txt} [spoza drzewa] (${ROLE_LABELS[partRoleCode] ?? partRoleCode})`,
                          },
                        ]);
                        setPartTextInput('');
                      }}
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
                        const lbl = `${p.surname ?? ''} ${p.givenName ?? ''}`.trim();
                        setEditParticipants(prev => [
                          ...prev,
                          {
                            personId: p.id,
                            roleCode: partRoleCode,
                            displayLabel: `${lbl} (${ROLE_LABELS[partRoleCode] ?? partRoleCode})`,
                          },
                        ]);
                        setPartPersonResults([]);
                        setPartPersonQuery('');
                      }}
                      className={styles.btnSecondary}
                    >
                      + Wybierz: {p.surname} {p.givenName} ({p.birthYear ?? '?'})
                    </button>
                  ))}
                </div>
              )}

              {editParticipants.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {editParticipants.map((ep, idx) => (
                    <span
                      key={`${ep.displayLabel}-${String(idx)}`}
                      className={styles.decadeCountPill}
                    >
                      👤 {ep.displayLabel}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setEditParticipants(prev => prev.filter((_, i) => i !== idx));
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
                  setIsEditing(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button type="submit" className={styles.btnPrimary}>
                ✓ Zapisz zmiany
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Main Info Card (Point 4: No "Folder wydarzenia na dysku" tile here) */}
      <section className={styles.detailsCard}>
        <div className={styles.detailsGrid}>
          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Typ wydarzenia</span>
            <span className={styles.infoValue}>{displayTypeLabels}</span>
          </div>
          {eventData.dateText && (
            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Data i godzina</span>
              <span className={styles.infoValue}>{eventData.dateText}</span>
            </div>
          )}
          {eventData.locationName && (
            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Miejsce</span>
              <span className={styles.infoValue}>{eventData.locationName}</span>
            </div>
          )}
          {eventData.attributes.map(attr => (
            <div key={attr.definitionCode} className={styles.infoBox}>
              <span className={styles.infoLabel}>
                {attr.definitionCode === 'CAUSE_OF_DEATH'
                  ? 'Przyczyna śmierci'
                  : attr.definitionCode}
              </span>
              <span className={styles.infoValue}>{attr.value}</span>
            </div>
          ))}
        </div>

        {/* Ordered Parent Events */}
        {resolvedParentEvents.length > 0 && (
          <div>
            <h2 className={styles.sectionSubtitle}>
              Wydarzenia nadrzędne ({resolvedParentEvents.length})
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.6rem' }}>
              {resolvedParentEvents.map(pe => (
                <Link
                  key={pe.eventId}
                  to={`/events/${String(pe.eventId)}`}
                  className={styles.btnSecondary}
                >
                  <span>↑ {pe.label}</span>
                  {pe.dateText ? <span>({pe.dateText})</span> : null}
                  {pe.primaryFolderParent && resolvedParentEvents.length > 1 && (
                    <span className={styles.primaryFolderBadge}>Główny rodzic</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {eventData.subEvents && eventData.subEvents.length > 0 && (
          <div>
            <h2 className={styles.sectionSubtitle}>
              Podwydarzenia wchodzące w skład tego wydarzenia ({eventData.subEvents.length})
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.6rem' }}>
              {eventData.subEvents.map(sub => (
                <Link
                  key={sub.eventId}
                  to={`/events/${String(sub.eventId)}`}
                  className={styles.btnSecondary}
                >
                  ↳ Podwydarzenie: {sub.title ?? sub.typeLabel}{' '}
                  {sub.dateText ? `(${sub.dateText})` : ''}
                </Link>
              ))}
            </div>
          </div>
        )}

        <h2 className={styles.sectionSubtitle}>
          Uczestnicy wydarzenia ({eventData.participants.length})
        </h2>

        <div className={styles.participantsList}>
          {eventData.participants.map((p, idx) => {
            const fallbackName = `${p.surname ?? ''} ${p.givenName ?? ''}`.trim() || '—';
            const fullName = p.participantText ?? fallbackName;
            const ageLabel = formatPolishAge(p.ageAtEvent, p.ageApproximate);
            const rLabel = p.roleLabel ?? (ROLE_LABELS[p.roleCode] ?? p.roleCode);
            const rowKey = String(p.participantId ?? p.personId ?? `part-${String(idx)}`);

            return (
              <div key={rowKey} className={styles.participantRow}>
                <div className={styles.participantIdentity}>
                  <PersonAvatar
                    sex={p.sex}
                    size="md"
                    avatarMediaId={p.avatarMediaId}
                    avatarMediaType={p.avatarMediaType}
                    avatarCropX={p.avatarCropX}
                    avatarCropY={p.avatarCropY}
                    avatarCropZoom={p.avatarCropZoom}
                  />
                  <div>
                    <div className={styles.participantName}>
                      {fullName}
                      {ageLabel ? ` (${ageLabel})` : ''}
                    </div>
                    <div className={styles.participantContext}>
                      Rola: <strong>{rLabel}</strong>
                      {p.participantText ? ' • Osoba spoza drzewa' : ''}
                      {p.parentNames.length > 0
                        ? ` • Rodzice: ${p.parentNames.join(', ')}`
                        : ''}
                    </div>
                  </div>
                </div>

                {p.personId !== null && (
                  <div className={styles.participantActions}>
                    <Link
                      to={`/biographies/${String(p.personId)}`}
                      className={styles.actionLink}
                    >
                      📖 Biografia
                    </Link>
                    <Link
                      to={`/tree?personId=${String(p.personId)}`}
                      className={styles.actionLink}
                    >
                      🌳 Drzewo
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <WikiEventDescriptionSection
        eventId={eventData.eventId}
        description={eventData.description}
        isAdmin={isAdmin}
        onEventUpdated={updated => {
          setEventData(updated);
          syncEditForm(updated);
        }}
      />

      <MediaGallerySection
        context="EVENT"
        eventId={eventData.eventId}
        defaultEventYear={eventData.year}
        defaultPersonIds={participantIds}
        isAdmin={isAdmin}
        sectionTitle="Zdjęcia i filmy z tego wydarzenia"
      />
    </div>
  );
}