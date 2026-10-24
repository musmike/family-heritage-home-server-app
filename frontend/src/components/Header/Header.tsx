import logo from '../../assets/logo-light-mode.png';
import styles from './Header.module.css';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';

export default function Header() {
  const sidebar = useSidebar();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <header className={styles.appHeader}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          onClick={sidebar.toggleSidebar}
          aria-label="Toggle sidebar"
          className={styles.iconBtn}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.btnSvg}
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src={logo} alt="Family Heritage Logo" className={styles.headerLogo} />
      </div>

      <div className={styles.headerRight}>
        <button
          type="button"
          aria-label="Accessibility settings"
          className={styles.iconBtn}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.btnSvg}
          >
            <circle cx="12" cy="5" r="2" />
            <path d="M5 9h14" />
            <path d="M12 9v5" />
            <path d="m9 20 3-6 3 6" />
          </svg>
        </button>

        {user && (
          <button
            type="button"
            onClick={handleLogout}
            className={styles.logoutBtn}
            data-testid="logout-button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.btnSvg}
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className={styles.logoutBtnText}>Wyloguj się</span>
          </button>
        )}
      </div>
    </header>
  );
}
