import { useState, useEffect, use } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import MediaGallerySection from '../../components/MediaSection/MediaGallerySection';
import styles from './EventsPage.module.css';
import type { TimelineEventDto } from '../../types/eventTimeline';

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

const translateRole = (roleCode: string): string => {
  if (roleCode === 'PRINCIPAL') return 'Główny uczestnik';
  return roleCode;
};

export default function EventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [eventData, setEventData] = useState<TimelineEventDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin Edit Event Details / Parent Event Hierarchy
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [titleInput, setTitleInput] = useState<string>('');
  const [descInput, setDescInput] = useState<string>('');
  const [parentEventIdInput, setParentEventIdInput] = useState<string>('');
  const [candidateParentEvents, setCandidateParentEvents] = useState<TimelineEventDto[]>([]);

  const fetchDetails = async () => {
    if (!eventId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await eventTimelineApi.getEventById(Number(eventId));
      setEventData(result);
      setTitleInput(result.title ?? '');
      setDescInput(result.description ?? '');
      setParentEventIdInput(
        result.parentEventId !== undefined && result.parentEventId !== null
          ? String(result.parentEventId)
          : ''
      );
    } catch {
      setErrorMessage('Nie udało się pobrać szczegółów wydarzenia.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDetails();
  }, [eventId]);

  const handleOpenEdit = async () => {
    setIsEditing(prev => !prev);
    if (!isEditing && candidateParentEvents.length === 0) {
      try {
        const timeline = await eventTimelineApi.getEventsTimeline({
          includeUndated: true,
          size: 500,
        });
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
        // Ignore candidate load error
      }
    }
  };

  const handleSaveDetails = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!eventData) return;
    try {
      const updated = await eventTimelineApi.updateEventDetails(eventData.eventId, {
        title: titleInput.trim() || null,
        description: descInput.trim() || null,
        parentEventId: parentEventIdInput.trim() !== '' ? Number(parentEventIdInput) : null,
      });
      setEventData(updated);
      setIsEditing(false);
    } catch {
      setErrorMessage('Nie udało się zapisać szczegółów wydarzenia.');
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

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {eventData.title
              ? `${eventData.title} (${eventData.typeLabel})`
              : eventData.typeLabel}
          </h1>
          <p className={styles.pageSubtitle}>Szczegóły wydarzenia rodzinnego</p>
        </div>
        <div className={styles.headerRight}>
          {isAdmin && (
            <button
              type="button"
              data-testid="edit-event-details-button"
              onClick={() => {
                void handleOpenEdit();
              }}
              className={styles.btnSecondary}
            >
              {isEditing ? 'Zamknij edycję' : '✏️ Edytuj tytuł / wydarzenie nadrzędne'}
            </button>
          )}
          <Link to="/events" className={styles.btnSecondary}>
            ← Wróć do osi czasu wydarzeń
          </Link>
        </div>
      </div>

      {/* Admin Edit Event Form (Title, Description & Parent Event Hierarchy) */}
      {isAdmin && isEditing && (
        <section className={styles.detailsCard} data-testid="edit-event-details-form">
          <h2 className={styles.sectionSubtitle}>
            Edycja tytułu, opisu oraz wydarzenia nadrzędnego
          </h2>
          <form
            onSubmit={e => {
              void handleSaveDetails(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
          >
            <div className={styles.detailsGrid}>
              <div>
                <label htmlFor="evt-title-input" className={styles.filterLabel}>
                  Własny tytuł wydarzenia (np. Wyjazd do Gdańska)
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

              <div>
                <label htmlFor="evt-parent-select" className={styles.filterLabel}>
                  Wydarzenie nadrzędne (np. gdy ten pogrzeb odbył się w trakcie wyjazdu)
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

            <div>
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
              <button type="submit" className={styles.btnSecondary}>
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
            <span className={styles.infoValue}>{eventData.typeLabel}</span>
          </div>
          {eventData.dateText && (
            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Data</span>
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
                  ↳ {sub.title ?? sub.typeLabel} {sub.dateText ? `(${sub.dateText})` : ''}
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
            const fullName = `${p.surname ?? ''} ${p.givenName ?? ''}`.trim() || '—';
            const ageLabel = formatPolishAge(p.ageAtEvent, p.ageApproximate);

            return (
              <div
                key={p.personId !== null ? String(p.personId) : `part-${String(idx)}`}
                className={styles.participantRow}
              >
                <div className={styles.participantIdentity}>
                  <PersonAvatar sex={p.sex} size="md" />
                  <div>
                    <div className={styles.participantName}>
                      {fullName}
                      {ageLabel ? ` (${ageLabel})` : ''}
                    </div>
                    <div className={styles.participantContext}>
                      Rola: {translateRole(p.roleCode)}
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

      {/* Event Photos & Videos Section (Aggregates Sub-Event Media automatically!) */}
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