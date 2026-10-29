import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../assets/logo-light-mode.png';
import styles from './Header.module.css';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';

export default function Header() {
  const sidebar = useSidebar();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin =
    user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    setIsMenuOpen(false);
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
          <div className={styles.userMenuWrapper} ref={menuRef}>
            <button
              type="button"
              data-testid="user-menu-button"
              onClick={() => {
                setIsMenuOpen(prev => !prev);
              }}
              className={styles.userMenuTrigger}
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
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{user.username}</span>
              <span>▾</span>
            </button>

            {isMenuOpen && (
              <div className={styles.userDropdown} data-testid="user-dropdown-menu">
                {isAdmin && (
                  <>
                    <Link
                      to="/gedcom-import"
                      data-testid="menu-gedcom-import-link"
                      onClick={() => {
                        setIsMenuOpen(false);
                      }}
                      className={styles.dropdownItem}
                    >
                      <span>📥</span>
                      <span>Import pliku GEDCOM</span>
                    </Link>
                    <Link
                      to="/users-management"
                      data-testid="menu-users-management-link"
                      onClick={() => {
                        setIsMenuOpen(false);
                      }}
                      className={styles.dropdownItem}
                    >
                      <span>👥</span>
                      <span>Zarządzanie użytkownikami</span>
                    </Link>
                    <hr className={styles.dropdownDivider} />
                  </>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  data-testid="logout-button"
                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
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
                  <span>Wyloguj się</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}