import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { user } = useAuth();

  if (!user) {
    return <div>Błąd: Nie znaleziono użytkownika.</div>;
  }

  const isAdmin =
    user.roles.includes('ADMIN') || user.roles.includes('ROLE_ADMIN');

  return (
    <div className={styles.homeContainer}>
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.welcomeTitle}>Witaj, {user.username}!</h1>
          <p className={styles.roleSubtitle}>
            Jesteś zalogowany jako: <strong>{user.roles.join(', ')}</strong>
          </p>
        </div>

        {isAdmin && (
          <Link
            to="/gedcom-import"
            data-testid="gedcom-import-nav-button"
            className={styles.importBtn}
          >
            <span>📥</span>
            <span>Import pliku GEDCOM</span>
          </Link>
        )}
      </div>
    </div>
  );
}