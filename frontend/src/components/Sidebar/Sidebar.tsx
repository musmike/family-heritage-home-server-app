import { use, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSidebar } from '../../context/SidebarContext';
import { AuthContext } from '../../context/AuthContext';
import logo from '../../assets/logo-light-mode.png';
import styles from './Sidebar.module.css';

interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
  disabled?: boolean;
  adminOnly?: boolean;
}

export default function Sidebar() {
  const { isSidebarOpen, screenSize, toggleSidebar } = useSidebar();
  const auth = use(AuthContext);

  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const navItems: (NavItem | null)[] = [
    {
      name: 'Panel główny',
      path: '/',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    null,
    {
      name: 'Biografie',
      path: '/biographies',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      name: 'Wydarzenia',
      path: '/events',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      name: 'Wspomnienia i powiedzenia',
      path: '/memories',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      name: 'Dziennik',
      path: '/journal',
      disabled: true,
      adminOnly: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      ),
    },
    null,
    {
      name: 'Drzewo genealogiczne',
      path: '/tree',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
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
      name: 'Statystyki',
      path: '/statistics',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    null,
    {
      name: 'Galeria',
      path: '/gallery',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      name: 'Dokumenty',
      path: '/documents',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      name: 'Nagrobki',
      path: '/gravestones',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M6 20V10a6 6 0 0 1 12 0v10" />
          <path d="M4 20h16" />
          <path d="M12 7v6" />
          <path d="M9 10h6" />
        </svg>
      ),
    },
    {
      name: 'Miejsca',
      path: '/places',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      name: 'Pamiątki',
      path: '/heirlooms',
      disabled: true,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.navSvg}>
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      ),
    },
  ];

  const visibleNavItems = navItems.filter(item => item === null || !item.adminOnly || isAdmin);

  return (
    <>
      <div
        className={`${styles.sidebarOverlay} ${isSidebarOpen ? styles.sidebarOverlayVisible : ''}`}
        onClick={toggleSidebar}
        onKeyDown={toggleSidebar}
        role="button"
        tabIndex={0}
        aria-label="Close sidebar"
      />

      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarHeaderLeft}>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              className={styles.sidebarHeaderHamburger}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.navSvg}
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <img src={logo} alt="Family Heritage Logo" className={styles.sidebarHeaderLogo} />
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          <ul>
            {visibleNavItems.map((item, index) => {
              if (item === null) {
                return (
                  <hr
                    key={`divider-${String(index)}`}
                    className={styles.sidebarDivider}
                    role="separator"
                  />
                );
              }
              if (item.disabled) {
                return (
                  <li key={item.name}>
                    <span
                      role="link"
                      aria-disabled="true"
                      title="Funkcja w przygotowaniu"
                      className={`${styles.sidebarNavLink} ${styles.sidebarNavLinkDisabled}`}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span className={styles.navText} style={{ whiteSpace: 'normal' }}>
                        {item.name}
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `${styles.sidebarNavLink} ${isActive ? styles.sidebarNavLinkActive : ''}`
                    }
                    onClick={() => {
                      if (screenSize === 'mobile' && isSidebarOpen) toggleSidebar();
                    }}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navText} style={{ whiteSpace: 'normal' }}>
                      {item.name}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}