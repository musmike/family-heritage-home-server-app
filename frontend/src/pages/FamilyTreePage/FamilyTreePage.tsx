import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import AncestorTree from '../../components/AncestorTree/AncestorTree';
import Loader from '../../components/Loader/Loader';
import styles from '../Biographies/Biographies.module.css';
import type { PersonListItemDto } from '../../types/biography';

export default function FamilyTreePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramPersonId = searchParams.get('personId');
  const auth = use(AuthContext);

  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [probandId, setProbandId] = useState<number | null>(
    paramPersonId ? Number(paramPersonId) : null
  );
  const [defaultProbandId, setDefaultProbandId] = useState<number | null>(null);
  const [previousProbands, setPreviousProbands] = useState<number[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PersonListItemDto[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(probandId === null);

  useEffect(() => {
    const initDefaultProband = async () => {
      if (paramPersonId) {
        setProbandId(Number(paramPersonId));
      } else {
        setIsInitialLoading(true);
      }
      try {
        const def = await biographyApi.getDefaultProband();
        if (def) {
          setDefaultProbandId(def.defaultProband ? def.id : null);
          if (!paramPersonId) {
            setProbandId(def.id);
          }
        }
      } finally {
        setIsInitialLoading(false);
      }
    };
    void initDefaultProband();
  }, [paramPersonId]);

  const handleSetMainDefaultProband = async () => {
    if (probandId === null) return;
    const saved = await biographyApi.setDefaultProband(probandId);
    setDefaultProbandId(saved.id);
  };

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

        {isAdmin && probandId !== null && (
          <div>
            {defaultProbandId === probandId ? (
              <span className={styles.sexBadgeMale} style={{ padding: '0.45rem 0.9rem', fontSize: '0.84rem' }}>
                ⭐ Główny probant drzewa
              </span>
            ) : (
              <button
                type="button"
                data-testid="set-default-proband-button"
                onClick={() => {
                  void handleSetMainDefaultProband();
                }}
                className={styles.btnSecondary}
              >
                ⭐ Ustaw jako głównego probanta drzewa
              </button>
            )}
          </div>
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
                🎯 {p.surname} {p.givenName} ({p.birthYear ?? '?'})
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