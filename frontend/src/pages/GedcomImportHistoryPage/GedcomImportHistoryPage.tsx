import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gedcomImportApi } from '../../api/gedcomImportApi';
import Loader from '../../components/Loader/Loader';
import styles from '../GedcomImportPage/GedcomImportPage.module.css';
import type { ImportSessionHistoryItemDto } from '../../types/gedcomImport';

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

export default function GedcomImportHistoryPage() {
  const [history, setHistory] = useState<ImportSessionHistoryItemDto[]>([]);
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadHistoryData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [active, hist] = await Promise.all([
        gedcomImportApi.getActiveSession(),
        gedcomImportApi.getImportHistory(),
      ]);
      setHasActiveSession(active !== null);
      setHistory(hist);
    } catch {
      setErrorMessage('Nie udało się pobrać historii importów.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistoryData();
  }, []);

  const handleRestoreSession = async (sessionId: number) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await gedcomImportApi.restoreSession(sessionId);
      const updatedHistory = await gedcomImportApi.getImportHistory();
      setHistory(updatedHistory);
      setSuccessMessage('Pomyślnie przywrócono stan drzewa z wybranego importu!');
    } catch {
      setErrorMessage('Nie udało się przywrócić wybranego importu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.pageTitle}>Historia zakończonych importów</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj dotychczasowe importy plików GEDCOM i w razie potrzeby przywróć stan drzewa z wybranej sesji.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/gedcom-import" className={styles.btnSecondary}>
            ← Wróć do kreatora importu
          </Link>
          <Link to="/" className={styles.btnSecondary}>
            Panel główny
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div data-testid="restore-success-banner" className={styles.AlertSuccess}>
          {successMessage}
        </div>
      )}

      {hasActiveSession && (
        <div className={styles.AlertError}>
          Trwa aktywna sesja importu. Aby przywrócić historyczny stan drzewa, najpierw dokończ lub anuluj bieżący import w kreatorze.
        </div>
      )}

      <section className={styles.card}>
        {history.length === 0 ? (
          <p className={styles.pageSubtitle}>Brak zakończonych importów w historii.</p>
        ) : (
          <div className={styles.historyList}>
            {history.map(item => (
              <div key={item.sessionId} className={styles.historyCard}>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Sesja</span>
                  <span className={styles.historyCellValue}>
                    <span className={styles.xrefBadge}>#{item.sessionId}</span>
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Nazwa pliku</span>
                  <strong className={styles.historyCellValue}>{item.fileName ?? '—'}</strong>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Źródło</span>
                  <span className={styles.sourceBadge}>{item.sourceSystem ?? '—'}</span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Data importu</span>
                  <span className={styles.historyCellValue}>
                    {formatPolishDateTime(item.createdAt)}
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <span className={styles.historyCellLabel}>Podsumowanie osób</span>
                  <span className={styles.historyCellValue}>
                    {item.summaryPreview
                      ? `Nowe: ${String(
                          item.summaryPreview.individualsToCreate
                        )}, zaktualizowane: ${String(
                          item.summaryPreview.individualsToUpdate
                        )}, bez zmian: ${String(item.summaryPreview.individualsUnchanged)}`
                      : '—'}
                  </span>
                </div>
                <div className={styles.historyCell}>
                  <button
                    type="button"
                    data-testid={`restore-session-button-${String(item.sessionId)}`}
                    disabled={isSubmitting || hasActiveSession}
                    onClick={() => {
                      void handleRestoreSession(item.sessionId);
                    }}
                    className={styles.btnSecondary}
                  >
                    ↺ Przywróć ten stan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}