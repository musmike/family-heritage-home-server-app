import { Routes, Route } from 'react-router-dom';
import styles from './MainLayout.module.css';
import Header from '../../components/Header/Header';
import Sidebar from '../../components/Sidebar/Sidebar';
import Footer from '../../components/Footer/Footer';
import { useSidebar } from '../../context/SidebarContext';
import HomePage from '../../pages/HomePage/HomePage';
import GedcomImportPage from '../../pages/GedcomImportPage/GedcomImportPage';
import GedcomImportHistoryPage from '../../pages/GedcomImportHistoryPage/GedcomImportHistoryPage';

export default function MainLayout() {
  const { isSidebarOpen } = useSidebar();

  return (
    <div
      className={`${styles.dashboardLayout} ${isSidebarOpen ? styles.sidebarOpen : ''}`}
    >
      <Header />
      <Sidebar />
      <main className={styles.mainContentArea}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/gedcom-import" element={<GedcomImportPage />} />
          <Route path="/gedcom-import/history" element={<GedcomImportHistoryPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}