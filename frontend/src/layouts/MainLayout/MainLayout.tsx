import { Routes, Route } from 'react-router-dom';
import styles from './MainLayout.module.css';
import Header from '../../components/Header/Header';
import Sidebar from '../../components/Sidebar/Sidebar';
import Footer from '../../components/Footer/Footer';
import { useSidebar } from '../../context/SidebarContext';
import HomePage from '../../pages/HomePage/HomePage';
import GedcomImportPage from '../../pages/GedcomImportPage/GedcomImportPage';
import GedcomImportHistoryPage from '../../pages/GedcomImportHistoryPage/GedcomImportHistoryPage';
import BiographiesListPage from '../../pages/Biographies/BiographiesListPage';
import PersonBiographyPage from '../../pages/Biographies/PersonBiographyPage';
import FamilyTreePage from '../../pages/FamilyTreePage/FamilyTreePage';
import BurialsPage from '../../pages/BurialsPage/BurialsPage';
import EventsPage from '../../pages/EventsPage/EventsPage';
import EventDetailsPage from '../../pages/EventsPage/EventDetailsPage';
import UsersManagementPage from '../../pages/UsersManagementPage/UsersManagementPage';
import ActivitiesPage from '../../pages/ActivitiesPage/ActivitiesPage';

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
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/users-management" element={<UsersManagementPage />} />
          <Route path="/biographies" element={<BiographiesListPage />} />
          <Route path="/biographies/:personId" element={<PersonBiographyPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailsPage />} />
          <Route path="/tree" element={<FamilyTreePage />} />
          <Route path="/burials" element={<BurialsPage />} />
          <Route path="/gedcom-import" element={<GedcomImportPage />} />
          <Route path="/gedcom-import/history" element={<GedcomImportHistoryPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}