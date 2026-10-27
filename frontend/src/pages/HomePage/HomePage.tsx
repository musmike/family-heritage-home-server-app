import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../context/AuthContext';
import { activityApi } from '../../api/activityApi';
import { dashboardApi } from '../../api/dashboardApi';
import Loader from '../../components/Loader/Loader';
import styles from './HomePage.module.css';
import type { ActivityLogItemDto } from '../../types/activity';
import type { AnniversaryItemDto, DashboardStatsDto } from '../../types/dashboard';

interface QuickActionItem {
  title: string;
  description: string;
  path: string;
  disabled?: boolean;
  adminOnly?: boolean;
  icon: ReactNode;
}

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

const resolveGreetingName = (user: AuthUser): string => {
  const rawGiven = user.personGivenName?.trim() ?? '';
  if (rawGiven !== '') {
    const firstToken = rawGiven.split(/\s+/)[0];
    if (firstToken) {
      return firstToken;
    }
  }
  return user.username;
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

const getActivityAccentClass = (actionType: string): string => {
  if (actionType.startsWith('USER_')) return styles.accentAuth;
  if (actionType.startsWith('PERSON_')) return styles.accentPerson;
  if (actionType.startsWith('EVENT_')) return styles.accentEvent;
  if (actionType.startsWith('GRAVE_')) return styles.accentGrave;
  return styles.accentImport;
};

const getAnniversaryAccentClass = (type: AnniversaryItemDto['type']): string => {
  if (type === 'BIRTH') return styles.accentPerson;
  if (type === 'WEDDING') return styles.accentEvent;
  return styles.accentDeath;
};

const formatDaysUntil = (days: number): string => {
  if (days === 0) return 'Dzisiaj!';
  if (days === 1) return 'Jutro';
  return `za ${String(days)} dni`;
};

const formatAnniversaryParticipants = (item: AnniversaryItemDto): string =>
  item.participants
    .map(p => `${p.surname ?? ''} ${p.givenName ?? ''}`.trim())
    .filter(Boolean)
    .join(' & ');

export default function HomePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStatsDto | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityLogItemDto[]>([]);
  const [upcomingAnniversaries, setUpcomingAnniversaries] = useState<AnniversaryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const [statsRes, activitiesRes, anniversariesRes] = await Promise.all([
          dashboardApi.getStats().catch(() => null),
          activityApi
            .getActivities({
              page: 0,
              size: 5,
              sortOrder: 'DESC',
            })
            .catch(() => null),
          dashboardApi
            .getAnniversaries({
              page: 0,
              size: 5,
              sortBy: 'UPCOMING',
            })
            .catch(() => null),
        ]);
        setStats(statsRes);
        setRecentActivities(activitiesRes?.content ?? []);
        setUpcomingAnniversaries(anniversariesRes?.content ?? []);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchDashboardData();
  }, []);

  if (!user) {
    return <div>Błąd: Nie znaleziono użytkownika.</div>;
  }

  const normalizedRoles = user.roles.map(r => r.replace(/^ROLE_/, '').toUpperCase());
  const isGuest = normalizedRoles.includes('GUEST');
  const isAdmin = normalizedRoles.includes('ADMIN');
  const greetingName = resolveGreetingName(user);

  const quickActions: QuickActionItem[] = [
    {
      title: 'Przeglądaj biografie osób',
      description: 'Poznaj życiorysy, relacje rodzinne i karty poszczególnych przodków.',
      path: '/biographies',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: 'Odkrywaj drzewo genealogiczne',
      description: 'Przeanalizuj graficzny wywód przodków i przechodź między pokoleniami.',
      path: '/tree',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <circle cx="12" cy="5" r="3" />
          <line x1="12" y1="8" x2="12" y2="14" />
          <path d="M5 14h14" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
          <line x1="5" y1="14" x2="5" y2="17" />
          <line x1="19" y1="14" x2="19" y2="17" />
          <line x1="12" y1="14" x2="12" y2="17" />
        </svg>
      ),
    },
    {
      title: 'Prześledź kronikę wydarzeń',
      description: 'Zobacz narodziny, śluby i inne wydarzenia rodzinne na osi czasu.',
      path: '/events',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      title: 'Odwiedź groby i cmentarze',
      description: 'Sprawdź miejsca pochówku oraz rodzinne nagrobki na cmentarzach.',
      path: '/burials',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M6 20V10a6 6 0 0 1 12 0v10" />
          <path d="M4 20h16" />
          <path d="M12 7v6" />
          <path d="M9 10h6" />
        </svg>
      ),
    },
    {
      title: 'Przeczytaj wspomnienia i powiedzenia',
      description: 'Poznaj rodzinne anegdoty, historie oraz pamiętne cytaty.',
      path: '/memories',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      title: 'Otwórz dziennik badacza',
      description: 'Prowadź zapiski i notatki z poszukiwań genealogicznych.',
      path: '/journal',
      disabled: true,
      adminOnly: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      ),
    },
    {
      title: 'Przeanalizuj statystyki rodziny',
      description: 'Sprawdź wykresy długości życia, najczęstsze imiona i zestawienia.',
      path: '/statistics',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      title: 'Obejrzyj galerię zdjęć i wideo',
      description: 'Przeglądaj archiwalne fotografie oraz nagrania rodzinne.',
      path: '/gallery',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      title: 'Przejrzyj archiwalne dokumenty',
      description: 'Zobacz akty urodzenia, małżeństwa, zgonu oraz skany pism.',
      path: '/documents',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      title: 'Zobacz ważne miejsca',
      description: 'Odkryj miejscowości i adresy związane z historią rodziny.',
      path: '/places',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      title: 'Poznaj rodzinne pamiątki',
      description: 'Obejrzyj przedmioty o szczególnej wartości sentymentalnej.',
      path: '/heirlooms',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.actionSvg}>
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      ),
    },
  ];

  const visibleActions = quickActions.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className={styles.homeContainer}>
      {/* 1. Unified Welcome Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {isGuest ? 'Witaj!' : `Witaj, ${greetingName}!`} Jesteś zalogowany jako{' '}
            {formatPolishRole(user.roles)}.
          </h1>
          <p className={styles.pageSubtitle}>
            Wybierz interesującą Cię sekcję archiwum rodzinnego, sprawdź podsumowanie liczbowe oraz nadchodzące rocznice.
          </p>
        </div>
      </div>

      {/* 2. Quick Action Tiles */}
      <section className={styles.sectionBlock} data-testid="quick-actions-section">
        <h2 className={styles.sectionHeading}>Szybkie przejście do sekcji</h2>
        <div className={styles.actionsGrid}>
          {visibleActions.map(action => {
            if (action.disabled) {
              return (
                <div
                  key={action.path}
                  aria-disabled="true"
                  title="Funkcja w przygotowaniu"
                  className={`${styles.actionCard} ${styles.actionCardDisabled}`}
                >
                  <div className={styles.actionIconBox}>{action.icon}</div>
                  <div className={styles.actionTextGroup}>
                    <div className={styles.actionTitleRow}>
                      <span className={styles.actionTitle}>{action.title}</span>
                      <span className={styles.soonBadge}>Wkrótce</span>
                    </div>
                    <p className={styles.actionDesc}>{action.description}</p>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={action.path}
                to={action.path}
                className={styles.actionCard}
              >
                <div className={styles.actionIconBox}>{action.icon}</div>
                <div className={styles.actionTextGroup}>
                  <div className={styles.actionTitleRow}>
                    <span className={styles.actionTitle}>{action.title}</span>
                  </div>
                  <p className={styles.actionDesc}>{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3. Small Statistics Tiles (10 items) */}
      <section className={styles.sectionBlock} data-testid="dashboard-stats-section">
        <h2 className={styles.sectionHeading}>Archiwum rodzinne w liczbach</h2>
        <div className={styles.statsGrid}>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Osoby</span>
            <span className={styles.statValue} data-testid="stat-people-count">
              {stats ? stats.peopleCount : 0}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Rodziny</span>
            <span className={styles.statValue} data-testid="stat-families-count">
              {stats ? stats.familiesCount : 0}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Pokolenia drzewa</span>
            <span className={styles.statValue} data-testid="stat-generations-count">
              {stats ? stats.generationsCount : 0}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Wydarzenia</span>
            <span className={styles.statValue} data-testid="stat-events-count">
              {stats ? stats.eventsCount : 0}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Nagrobki</span>
            <span className={styles.statValue} data-testid="stat-graves-count">
              {stats ? stats.gravesCount : 0}
            </span>
          </div>
          <div className={`${styles.statTile} ${styles.statTileMuted}`}>
            <span className={styles.statLabel}>Dokumenty</span>
            <span className={styles.statValue}>{stats ? stats.documentsCount : 0}</span>
          </div>
          <div className={`${styles.statTile} ${styles.statTileMuted}`}>
            <span className={styles.statLabel}>Zdjęcia i wideo</span>
            <span className={styles.statValue}>{stats ? stats.mediaCount : 0}</span>
          </div>
          <div className={`${styles.statTile} ${styles.statTileMuted}`}>
            <span className={styles.statLabel}>Wspomnienia i cytaty</span>
            <span className={styles.statValue}>{stats ? stats.memoriesCount : 0}</span>
          </div>
          <div className={`${styles.statTile} ${styles.statTileMuted}`}>
            <span className={styles.statLabel}>Pamiątki</span>
            <span className={styles.statValue}>{stats ? stats.heirloomsCount : 0}</span>
          </div>
          <div className={`${styles.statTile} ${styles.statTileMuted}`}>
            <span className={styles.statLabel}>Miejsca</span>
            <span className={styles.statValue}>{stats ? stats.placesCount : 0}</span>
          </div>
        </div>
      </section>

      {/* 4. Side-by-Side Equal-Height Panels: Recent Activities (Left) & Upcoming Anniversaries (Right) */}
      <div className={styles.bottomPanelsGrid}>
        {/* LEFT: Recent Activities (5 items) */}
        <section className={styles.panelCard} data-testid="recent-activities-section">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Ostatnie aktywności</h2>
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
            <p className={styles.pageSubtitle}>Brak zarejestrowanych aktywności.</p>
          ) : (
            <div className={styles.panelList}>
              {recentActivities.map(act => (
                <div
                  key={act.id}
                  className={`${styles.listItem} ${getActivityAccentClass(act.actionType)}`}
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

        {/* RIGHT: Upcoming Anniversaries (5 items) */}
        <section className={styles.panelCard} data-testid="upcoming-anniversaries-section">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Nadchodzące rocznice</h2>
            <Link
              to="/anniversaries"
              data-testid="show-more-anniversaries-button"
              className={styles.showMoreBtn}
            >
              Pokaż więcej →
            </Link>
          </div>

          {isLoading ? (
            <Loader size={32} />
          ) : upcomingAnniversaries.length === 0 ? (
            <p className={styles.pageSubtitle}>
              Brak nadchodzących rocznic z dokładną datą dzienną.
            </p>
          ) : (
            <div className={styles.panelList}>
              {upcomingAnniversaries.map(ann => {
                const anniversaryTitle =
                  ann.yearsCount !== null && ann.yearsCount > 0
                    ? `${String(ann.yearsCount)}. ${ann.typeLabel.toLowerCase()}`
                    : ann.typeLabel;

                return (
                  <div
                    key={ann.id}
                    className={`${styles.listItem} ${getAnniversaryAccentClass(ann.type)}`}
                  >
                    <div className={styles.itemMain}>
                      <div className={styles.itemTopRow}>
                        <span className={styles.typeBadge}>{anniversaryTitle}</span>
                        <span
                          className={`${styles.daysPill} ${
                            ann.daysUntil === 0 ? styles.daysPillToday : ''
                          }`}
                        >
                          {formatDaysUntil(ann.daysUntil)}
                        </span>
                        <span className={styles.descriptionText}>
                          {formatAnniversaryParticipants(ann)}
                        </span>
                      </div>
                      <div className={styles.metaRow}>
                        <span>
                          📅 <strong>{ann.annualDateText}</strong> ({ann.dateText})
                        </span>
                        {ann.locationName && <span>📍 {ann.locationName}</span>}
                      </div>
                    </div>

                    {ann.targetType === 'PERSON' ? (
                      <Link
                        to={`/biographies/${String(ann.targetId)}`}
                        className={styles.targetLink}
                      >
                        📖 Biografia →
                      </Link>
                    ) : (
                      <Link
                        to={`/events/${String(ann.eventId)}`}
                        className={styles.targetLink}
                      >
                        📅 Wydarzenie →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}