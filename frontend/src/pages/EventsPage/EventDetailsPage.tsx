import { useState, useEffect, useMemo, use } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import MediaGallerySection from '../../components/MediaSection/MediaGallerySection';
import { QUALIFIER_OPTIONS, ROLE_LABELS } from './EventsPage';
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
  const [titleInput, setTitleInput] = useState<string>('');
  const [descInput, setDescInput] = useState<string>('');
  const [locInput, setLocInput] = useState<string>('');
  const [parentEventIdInput, setParentEventIdInput] = useState<string>('');
  const [candidateParentEvents, setCandidateParentEvents] = useState<TimelineEventDto[]>([]);

  const [startQual, setStartQual] = useState<string>('EXACT');
  const [startYear, setStartYear] = useState<string>('');
  const [startMonth, setStartMonth] = useState<string>('');
  const [startDay, setStartDay] = useState<string>('');
  const [startTimeQual, setStartTimeQual] = useState<string>('EXACT');
  const [startHour, setStartHour] = useState<string>('');
  const [startMinute, setStartMinute] = useState<string>('');

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
    setParentEventIdInput(
      result.parentEventId !== undefined && result.parentEventId !== null
        ? String(result.parentEventId)
        : ''
    );
    setStartQual(result.startQualifier ?? 'EXACT');
    setStartYear(result.startYear ? String(result.startYear) : '');
    setStartMonth(result.startMonth ? String(result.startMonth) : '');
    setStartDay(result.startDay ? String(result.startDay) : '');
    setStartTimeQual(result.startTimeQualifier ?? 'EXACT');
    setStartHour(
      result.startHour !== undefined && result.startHour !== null
        ? String(result.startHour)
        : ''
    );
    setStartMinute(
      result.startMinute !== undefined && result.startMinute !== null
        ? String(result.startMinute)
        : ''
    );

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

  const handleOpenEdit = async () => {
    setIsEditing(prev => !prev);
    if (!isEditing && availableTypes.length === 0) {
      try {
        const [typesRes, timeline] = await Promise.all([
          eventTimelineApi.getAvailableTypes(),
          eventTimelineApi.getEventsTimeline({ includeUndated: true, size: 500 }),
        ]);
        setAvailableTypes(typesRes);
        const flat: TimelineEventDto[] = [];
        for (const dec of timeline.decades) {
          for (const yr of dec.years) {
            for (const ev of yr.events) {
              if (String(ev.eventId) !== eventId) {
                flat.push(ev);
              }
            }
          }
        }
        setCandidateParentEvents(flat);
      } catch {
        // Ignore load error
      }
    }
  };

  const toggleFormTypeCode = (code: string) => {
    setTypeCodes(prev => {
      if (prev.includes(code)) {
        return prev.length > 1 ? prev.filter(c => c !== code) : prev;
      }
      return [...prev, code];
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
    try {
      const updated = await eventTimelineApi.updateEvent(eventData.eventId, {
        typeCodes,
        title: titleInput.trim() || null,
        description: descInput.trim() || null,
        locationName: locInput.trim() || null,
        parentEventId: parentEventIdInput.trim() !== '' ? Number(parentEventIdInput) : null,
        startQualifier: startQual,
        startYear: startYear !== '' ? Number(startYear) : null,
        startMonth: startMonth !== '' ? Number(startMonth) : null,
        startDay: startDay !== '' ? Number(startDay) : null,
        startTimeQualifier: startTimeQual,
        startHour: startHour !== '' ? Number(startHour) : null,
        startMinute: startMinute !== '' ? Number(startMinute) : null,
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
    } catch {
      setErrorMessage('Nie udało się zapisać zmian w wydarzeniu.');
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

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  if (errorMessage || !eventData) {
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

      {/* Admin Full Edit Form */}
      {isAdmin && isEditing && (
        <section className={styles.detailsCard} data-testid="edit-event-details-form">
          <h2 className={styles.sectionSubtitle}>
            Edycja typów, daty, godziny, uczestników oraz wydarzenia nadrzędnego
          </h2>
          <form
            onSubmit={e => {
              void handleSaveFullEvent(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {availableTypes.length > 0 && (
              <div className={styles.formField}>
                <span className={styles.filterLabel}>Przypisane typy wydarzenia:</span>
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
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
                        checked={typeCodes.includes(opt.code)}
                        onChange={() => {
                          toggleFormTypeCode(opt.code);
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="evt-title-input" className={styles.filterLabel}>
                  Własny tytuł wydarzenia
                </label>
                <input
                  id="evt-title-input"
                  type="text"
                  value={titleInput}
                  onChange={e => {
                    setTitleInput(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="evt-loc-input" className={styles.filterLabel}>
                  Miejsce
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

              <div className={styles.formField}>
                <label htmlFor="evt-parent-select" className={styles.filterLabel}>
                  Wydarzenie nadrzędne
                </label>
                <select
                  id="evt-parent-select"
                  value={parentEventIdInput}
                  onChange={e => {
                    setParentEventIdInput(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Brak (wydarzenie główne) —</option>
                  {candidateParentEvents.map(cand => (
                    <option key={cand.eventId} value={String(cand.eventId)}>
                      {cand.dateText ?? cand.year ?? 'Bez daty'} –{' '}
                      {cand.title ?? cand.typeLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.detailsGrid}>
              <div className={styles.formField}>
                <label htmlFor="edit-evt-qual" className={styles.filterLabel}>
                  Kwalifikator daty
                </label>
                <select
                  id="edit-evt-qual"
                  value={startQual}
                  onChange={e => {
                    setStartQual(e.target.value);
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
                <label htmlFor="edit-evt-year" className={styles.filterLabel}>
                  Rok
                </label>
                <input
                  id="edit-evt-year"
                  type="number"
                  value={startYear}
                  onChange={e => {
                    setStartYear(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="edit-evt-month" className={styles.filterLabel}>
                  Miesiąc
                </label>
                <input
                  id="edit-evt-month"
                  type="number"
                  min={1}
                  max={12}
                  value={startMonth}
                  onChange={e => {
                    setStartMonth(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="edit-evt-day" className={styles.filterLabel}>
                  Dzień
                </label>
                <input
                  id="edit-evt-day"
                  type="number"
                  min={1}
                  max={31}
                  value={startDay}
                  onChange={e => {
                    setStartDay(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="edit-evt-tqual" className={styles.filterLabel}>
                  Kwalifikator czasu
                </label>
                <select
                  id="edit-evt-tqual"
                  value={startTimeQual}
                  onChange={e => {
                    setStartTimeQual(e.target.value);
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
                <span className={styles.filterLabel}>Godzina (GG:MM)</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="GG"
                    value={startHour}
                    onChange={e => {
                      setStartHour(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="MM"
                    value={startMinute}
                    onChange={e => {
                      setStartMinute(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>
              </div>
            </div>

            <div className={styles.formField}>
              <label htmlFor="evt-desc-input" className={styles.filterLabel}>
                Opis wydarzenia
              </label>
              <input
                id="evt-desc-input"
                type="text"
                value={descInput}
                onChange={e => {
                  setDescInput(e.target.value);
                }}
                className={styles.textInput}
              />
            </div>

            {/* Participants Management in Edit Form */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <span className={styles.filterLabel}>Uczestnicy wydarzenia:</span>
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
          {eventData.parentEventId && (
            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Wydarzenie nadrzędne</span>
              <Link
                to={`/events/${String(eventData.parentEventId)}`}
                className={styles.infoValue}
                style={{ color: '#2563eb', textDecoration: 'underline' }}
              >
                ↑ {eventData.parentEventLabel ?? 'Przejdź do wydarzenia nadrzędnego'}
              </Link>
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

        {eventData.description && (
          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Opis wydarzenia</span>
            <span className={styles.infoValue}>{eventData.description}</span>
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