import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { activityApi } from '../../api/activityApi';
import Loader from '../../components/Loader/Loader';
import styles from './HomePage.module.css';
import type { ActivityLogItemDto } from '../../types/activity';

const formatPolishRole = (roles: string[]): string => {
  const normalized = roles.map(r => r.replace(/^ROLE_/, '').toUpperCase());
  if (normalized.includes('ADMIN')) {
    return 'administrator';
  }
  if (normalized.includes('PRIVILEGED_GUEST')) {
    return 'uprzywilejowany gość';
  }
  if (normalized.includes('GUEST')) {
    return 'gość';
  }
  return roles.join(', ').toLowerCase();
};

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

export default function HomePage() {
  const { user } = useAuth();
  const [recentActivities, setRecentActivities] = useState<ActivityLogItemDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const page = await activityApi.getActivities({
          page: 0,
          size: 8,
          sortOrder: 'DESC',
        });
        setRecentActivities(page.content);
      } catch {
        setRecentActivities([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchRecent();
  }, []);

  if (!user) {
    return <div>Błąd: Nie znaleziono użytkownika.</div>;
  }

  const normalizedRoles = user.roles.map(r => r.replace(/^ROLE_/, '').toUpperCase());
  const isGuest = normalizedRoles.includes('GUEST');

  return (
    <div className={styles.homeContainer}>
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.welcomeHeading}>
            {isGuest ? 'Witaj!' : `Witaj, ${user.username}!`} Jesteś zalogowany jako{' '}
            {formatPolishRole(user.roles)}.
          </h1>
          <p className={styles.welcomeSubtext}>
            Oto co dzieje się w badaniach historii rodzinnej:
          </p>
        </div>
      </div>

      {/* Recent Activities Section */}
      <section className={styles.recentCard} data-testid="recent-activities-section">
        <div className={styles.recentHeader}>
          <h2 className={styles.recentTitle}>Ostatnie aktywności</h2>
          <Link
            to="/activities"
            data-testid="show-more-activities-button"
            className={styles.showMoreBtn}
          >
            Pokaż więcej →
          </Link>
        </div>

        {isLoading ? (
          <Loader size={32} />
        ) : recentActivities.length === 0 ? (
          <p className={styles.welcomeSubtext}>Brak zarejestrowanych aktywności.</p>
        ) : (
          <div className={styles.activityList}>
            {recentActivities.map(act => (
              <div
                key={act.id}
                className={`${styles.activityItem} ${getAccentClass(act.actionType)}`}
              >
                <div className={styles.itemMain}>
                  <div className={styles.itemTopRow}>
                    <span className={styles.typeBadge}>{act.actionLabel}</span>
                    <span className={styles.descriptionText}>{act.description}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>👤 {act.actorDisplayName}</span>
                    <span>🕒 {formatPolishDateTime(act.createdAt)}</span>
                  </div>
                </div>

                {act.targetType === 'PERSON' && act.targetId !== null && (
                  <Link
                    to={`/biographies/${String(act.targetId)}`}
                    className={styles.targetLink}
                  >
                    📖 Biografia →
                  </Link>
                )}
                {act.targetType === 'EVENT' && act.targetId !== null && (
                  <Link
                    to={`/events/${String(act.targetId)}`}
                    className={styles.targetLink}
                  >
                    📅 Wydarzenie →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}