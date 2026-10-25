import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import AncestorTree from '../../components/AncestorTree/AncestorTree';
import Loader from '../../components/Loader/Loader';
import styles from '../Biographies/Biographies.module.css';
import type { PersonListItemDto } from '../../types/biography';

export default function FamilyTreePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramPersonId = searchParams.get('personId');

  const [probandId, setProbandId] = useState<number | null>(
    paramPersonId ? Number(paramPersonId) : null
  );
  const [previousProbands, setPreviousProbands] = useState<number[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PersonListItemDto[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(probandId === null);

  useEffect(() => {
    if (paramPersonId) {
      setProbandId(Number(paramPersonId));
      setIsInitialLoading(false);
      return;
    }

    const loadDefaultProband = async () => {
      setIsInitialLoading(true);
      try {
        const page = await biographyApi.listPeople({ page: 0, size: 1 });
        if (page.content.length > 0) {
          setProbandId(page.content[0].id);
        }
      } finally {
        setIsInitialLoading(false);
      }
    };
    void loadDefaultProband();
  }, [paramPersonId]);

  const handleSearchProband = async () => {
    const page = await biographyApi.listPeople({
      search: searchQuery,
      page: 0,
      size: 8,
    });
    setSearchResults(page.content);
  };

  const handleSelectNewProband = (newId: number) => {
    if (probandId !== null && probandId !== newId) {
      setPreviousProbands(prev => [...prev, probandId]);
    }
    setProbandId(newId);
    setSearchParams({ personId: String(newId) });
    setSearchResults([]);
  };

  const handleGoBackProband = () => {
    if (previousProbands.length === 0) return;
    const prevId = previousProbands[previousProbands.length - 1];
    setPreviousProbands(prev => prev.slice(0, -1));
    setProbandId(prevId);
    setSearchParams({ personId: String(prevId) });
  };

  if (isInitialLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper} style={{ maxWidth: '1440px' }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Drzewo genealogiczne (wywód przodków)</h1>
          <p className={styles.pageSubtitle}>
            Kliknij dowolną osobę w drzewie, aby zobaczyć jej szczegóły, przejść do biografii lub ustawić ją jako nowego probanta.
          </p>
        </div>

        {previousProbands.length > 0 && (
          <button
            type="button"
            data-testid="tree-back-proband-button"
            onClick={handleGoBackProband}
            className={styles.btnSecondary}
          >
            ← Cofnij do poprzedniego probanta
          </button>
        )}
      </div>

      {/* Proband Search Selector */}
      <section className={styles.filterCard}>
        <div className={styles.filterField}>
          <label htmlFor="tree-proband-search" className={styles.filterLabel}>
            Zmień osobę centralną (probanta)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              id="tree-proband-search"
              type="text"
              placeholder="Wpisz imię lub nazwisko..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
              }}
              className={styles.textInput}
              style={{ flex: 1, minWidth: '180px' }}
            />
            <button
              type="button"
              onClick={() => {
                void handleSearchProband();
              }}
              className={styles.btnSecondary}
            >
              Szukaj
            </button>
          </div>
        </div>

        {searchResults.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {searchResults.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  handleSelectNewProband(p.id);
                }}
                className={styles.btnSecondary}
              >
                🎯 {p.givenName} {p.surname} ({p.birthYear ?? '?'})
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.wikiSection}>
        {previousProbands.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              data-testid="tree-back-proband-button"
              onClick={handleGoBackProband}
              className={styles.btnSecondary}
            >
              ← Cofnij do poprzednio oglądanej osoby
            </button>
          </div>
        )}

        {probandId === null ? (
          <div className={styles.placeholderBox}>Brak osób w bazie danych.</div>
        ) : (
          <AncestorTree
            rootPersonId={probandId}
            mode="full-tree"
            onSelectProband={handleSelectNewProband}
          />
        )}
      </section>
    </div>
  );
}