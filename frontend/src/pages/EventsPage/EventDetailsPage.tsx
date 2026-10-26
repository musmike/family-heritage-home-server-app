import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
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
  const [eventData, setEventData] = useState<TimelineEventDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!eventId) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await eventTimelineApi.getEventById(Number(eventId));
        setEventData(result);
      } catch {
        setErrorMessage('Nie udało się pobrać szczegółów wydarzenia.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchDetails();
  }, [eventId]);

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

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{eventData.typeLabel}</h1>
          <p className={styles.pageSubtitle}>Szczegóły wydarzenia rodzinnego</p>
        </div>
        <Link to="/events" className={styles.btnSecondary}>
          ← Wróć do osi czasu wydarzeń
        </Link>
      </div>

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
    </div>
  );
}