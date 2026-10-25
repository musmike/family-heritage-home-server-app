import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

  if (!user) {
    return <div>Błąd: Nie znaleziono użytkownika.</div>;
  }

  const normalizedRoles = user.roles.map(r => r.replace(/^ROLE_/, '').toUpperCase());
  const isAdmin = normalizedRoles.includes('ADMIN');
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
    </div>
  );
}