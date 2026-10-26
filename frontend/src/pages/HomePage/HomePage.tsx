import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  userAssignmentApi,
  type UserPersonAssignmentDto,
} from '../../api/userAssignmentApi';
import { biographyApi } from '../../api/biographyApi';
import type { PersonListItemDto } from '../../types/biography';
import styles from './HomePage.module.css';

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

export default function HomePage() {
  const { user } = useAuth();
  const [assignableUsers, setAssignableUsers] = useState<UserPersonAssignmentDto[]>([]);
  const [searchByUser, setSearchByUser] = useState<Record<number, string | undefined>>({});
  const [resultsByUser, setResultsByUser] = useState<
    Record<number, PersonListItemDto[] | undefined>
  >({});

  const normalizedRoles = user
    ? user.roles.map(r => r.replace(/^ROLE_/, '').toUpperCase())
    : [];
  const isAdmin = normalizedRoles.includes('ADMIN');
  const isGuest = normalizedRoles.includes('GUEST');

  useEffect(() => {
    if (!isAdmin) return;
    const loadUsers = async () => {
      try {
        const list = await userAssignmentApi.getAssignableUsers();
        setAssignableUsers(list);
      } catch {
        // Ignore if not available in unit test mock
      }
    };
    void loadUsers();
  }, [isAdmin]);

  if (!user) {
    return <div>Błąd: Nie znaleziono użytkownika.</div>;
  }

  const handleSearchPersonForUser = async (userId: number) => {
    const q = searchByUser[userId] ?? '';
    const page = await biographyApi.listPeople({ search: q, page: 0, size: 6 });
    setResultsByUser(prev => ({ ...prev, [userId]: page.content }));
  };

  const handleAssignPerson = async (userId: number, personId: number | null) => {
    const updated = await userAssignmentApi.assignPersonToUser(userId, personId);
    setAssignableUsers(prev =>
      prev.map(u => (u.userId === userId ? updated : u))
    );
    setResultsByUser(prev => ({ ...prev, [userId]: [] }));
  };

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

        {isAdmin && (
          <Link
            to="/gedcom-import"
            data-testid="gedcom-import-nav-button"
            className={styles.importBtn}
          >
            <span>Import pliku GEDCOM</span>
          </Link>
        )}
      </div>

      {isAdmin && assignableUsers.length > 0 && (
        <section className={styles.adminCard}>
          <h2 className={styles.adminCardTitle}>
            Przypisanie osób z bazy do kont użytkowników (administratorzy i uprzywilejowani goście)
          </h2>
          {assignableUsers.map(u => {
            const foundList = resultsByUser[u.userId] ?? [];

            return (
              <div key={u.userId} className={styles.userRow}>
                <div>
                  <strong>{u.username}</strong>{' '}
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({u.role})</span>
                  <div style={{ fontSize: '0.86rem', marginTop: '0.2rem', color: '#334155' }}>
                    Przypisana osoba:{' '}
                    {u.personId !== null ? (
                      <strong>
                        {u.personSurname} {u.personGivenName} (#{u.personId})
                      </strong>
                    ) : (
                      <em>Brak przypisanej osoby</em>
                    )}
                  </div>
                </div>

                <div className={styles.searchBox}>
                  <input
                    type="text"
                    placeholder="Szukaj osoby z drzewa..."
                    value={searchByUser[u.userId] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      setSearchByUser(prev => ({ ...prev, [u.userId]: val }));
                    }}
                    className={styles.textInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSearchPersonForUser(u.userId);
                    }}
                    className={styles.btnSmall}
                  >
                    Szukaj
                  </button>
                  {u.personId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleAssignPerson(u.userId, null);
                      }}
                      className={styles.btnSmall}
                    >
                      Odepnij
                    </button>
                  )}
                </div>

                {foundList.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {foundList.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          void handleAssignPerson(u.userId, p.id);
                        }}
                        className={styles.btnSmall}
                      >
                        ✓ Przypisz: {p.surname} {p.givenName} ({p.birthYear ?? '?'})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}