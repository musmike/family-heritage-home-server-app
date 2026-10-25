import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import Loader from '../Loader/Loader';
import PersonAvatar from '../PersonAvatar/PersonAvatar';
import styles from './AncestorTree.module.css';
import type { AncestorTreeNodeDto, PersonSex } from '../../types/biography';

interface AncestorTreeProps {
  rootPersonId: number;
  mode: 'biography' | 'full-tree';
  onSelectProband?: (personId: number) => void;
}

const formatPolishAge = (age: number | null, approximate: boolean): string | null => {
  if (age === null) return null;
  const prefix = approximate ? 'ok. ' : '';
  if (age === 1) return `${prefix}1 rok`;
  const rem10 = age % 10;
  const rem100 = age % 100;
  if (rem10 >= 2 && rem10 <= 4 && (rem100 < 12 || rem100 > 14)) {
    return `${prefix}${String(age)} lata`;
  }
  return `${prefix}${String(age)} lat`;
};

const formatCompactYears = (node: AncestorTreeNodeDto): string => {
  if (node.privateRecord) {
    return 'Dane prywatne';
  }
  const b = node.birthYear !== null ? String(node.birthYear) : '?';
  const d = node.deathYear !== null ? String(node.deathYear) : '?';
  if (node.lifeState === 'DECEASED') {
    return `${b}–${d}`;
  }
  if (node.birthYear !== null) {
    return `ur. ${b}`;
  }
  return '';
};

const getBorderClass = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return styles.borderMale;
  if (sex === 'FEMALE') return styles.borderFemale;
  return styles.borderNeutral;
};

const getOptimalGenerations = (mode: 'biography' | 'full-tree'): number => {
  if (mode === 'biography') return 3;
  if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
    return 4;
  }
  return 3;
};

export default function AncestorTree({
  rootPersonId,
  mode,
  onSelectProband,
}: AncestorTreeProps) {
  const [generations, setGenerations] = useState<number>(() => getOptimalGenerations(mode));
  const [treeRoot, setTreeRoot] = useState<AncestorTreeNodeDto | null>(null);
  const [selectedModalNode, setSelectedModalNode] = useState<AncestorTreeNodeDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setGenerations(getOptimalGenerations(mode));
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);

  useEffect(() => {
    const loadTree = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await biographyApi.getAncestorTree(rootPersonId, generations);
        setTreeRoot(data);
      } catch {
        setError('Nie udało się załadować drzewa przodków.');
      } finally {
        setIsLoading(false);
      }
    };
    void loadTree();
  }, [rootPersonId, generations]);

  const renderCardButton = (
    node: AncestorTreeNodeDto | null,
    expectedSex: PersonSex,
    isProband: boolean
  ) => {
    if (!node) {
      return (
        <div className={styles.nodeCardEmpty}>
          {expectedSex === 'MALE' ? 'Nieznany ojciec' : 'Nieznana matka'}
        </div>
      );
    }

    const fullName = `${node.givenName ?? ''} ${node.surname ?? ''}`.trim() || 'Bez imienia';
    const years = formatCompactYears(node);
    const borderClass = getBorderClass(node.sex);
    const probandClass = isProband ? styles.nodeCardProband : '';

    return (
      <button
        type="button"
        data-testid={`tree-node-${String(node.id)}`}
        onClick={() => {
          setSelectedModalNode(node);
        }}
        className={`${styles.nodeCard} ${borderClass} ${probandClass}`}
      >
        <PersonAvatar sex={node.sex} size="sm" />
        <div className={styles.nodeTextGroup}>
          <div className={styles.nodeName}>{fullName}</div>
          {years && <div className={styles.nodeLifespan}>{years}</div>}
        </div>
      </button>
    );
  };

  // Desktop recursive bottom-up renderer (Father on Left, Mother on Right)
  const renderDesktopBranch = (
    node: AncestorTreeNodeDto | null,
    currentGen: number,
    expectedSex: PersonSex
  ) => {
    const hasFurther = currentGen < generations;

    return (
      <div className={styles.branchDesktop}>
        {hasFurther && (
          <>
            <div className={styles.parentsRowDesktop}>
              <div className={styles.parentHalfDesktop}>
                {renderDesktopBranch(node?.father ?? null, currentGen + 1, 'MALE')}
                <div className={styles.stemDownFromParent} aria-hidden="true" />
              </div>
              <div className={styles.parentHalfDesktop}>
                {renderDesktopBranch(node?.mother ?? null, currentGen + 1, 'FEMALE')}
                <div className={styles.stemDownFromParent} aria-hidden="true" />
              </div>
            </div>
            <div className={styles.horizontalBridgeDesktop} aria-hidden="true" />
            <div className={styles.stemDownToChild} aria-hidden="true" />
          </>
        )}

        <div className={styles.desktopCardSlot}>
          {renderCardButton(node, expectedSex, currentGen === 1)}
        </div>
      </div>
    );
  };

  // Mobile 7x7 Staggered Overlapping Grid renderer (matches user's diagram 1:1)
  const renderMobileStaggeredTree = (root: AncestorTreeNodeDto) => {
    const father = root.father;
    const mother = root.mother;
    const patGrandfather = father?.father ?? null;
    const patGrandmother = father?.mother ?? null;
    const matGrandfather = mother?.father ?? null;
    const matGrandmother = mother?.mother ?? null;

    return (
      <div className={styles.mobileStaggeredGrid}>
        {/* Connectors */}
        <div
          className={styles.connUpRight}
          style={{ gridRow: '2 / 4', gridColumn: '2 / 3' }}
          aria-hidden="true"
        />
        <div
          className={styles.connDownRight}
          style={{ gridRow: '5 / 7', gridColumn: '2 / 3' }}
          aria-hidden="true"
        />
        <div
          className={styles.connUpRight}
          style={{ gridRow: '1 / 2', gridColumn: '4 / 5' }}
          aria-hidden="true"
        />
        <div
          className={styles.connDownRight}
          style={{ gridRow: '3 / 4', gridColumn: '4 / 5' }}
          aria-hidden="true"
        />
        <div
          className={styles.connUpRight}
          style={{ gridRow: '5 / 6', gridColumn: '4 / 5' }}
          aria-hidden="true"
        />
        <div
          className={styles.connDownRight}
          style={{ gridRow: '7 / 8', gridColumn: '4 / 5' }}
          aria-hidden="true"
        />

        {/* 1. Proband (Row 4, Cols 1..4) */}
        <div style={{ gridRow: '4', gridColumn: '1 / 4' }}>
          {renderCardButton(root, root.sex ?? 'UNKNOWN', true)}
        </div>

        {/* 2. Father (Row 2, Cols 3..6) */}
        <div style={{ gridRow: '2', gridColumn: '3 / 6' }}>
          {renderCardButton(father, 'MALE', false)}
        </div>

        {/* 3. Mother (Row 6, Cols 3..6) */}
        <div style={{ gridRow: '6', gridColumn: '3 / 6' }}>
          {renderCardButton(mother, 'FEMALE', false)}
        </div>

        {/* 4. Paternal Grandfather (Row 1, Cols 5..8) */}
        <div style={{ gridRow: '1', gridColumn: '5 / 8' }}>
          {renderCardButton(patGrandfather, 'MALE', false)}
        </div>

        {/* 5. Paternal Grandmother (Row 3, Cols 5..8) */}
        <div style={{ gridRow: '3', gridColumn: '5 / 8' }}>
          {renderCardButton(patGrandmother, 'FEMALE', false)}
        </div>

        {/* 6. Maternal Grandfather (Row 5, Cols 5..8) */}
        <div style={{ gridRow: '5', gridColumn: '5 / 8' }}>
          {renderCardButton(matGrandfather, 'MALE', false)}
        </div>

        {/* 7. Maternal Grandmother (Row 7, Cols 5..8) */}
        <div style={{ gridRow: '7', gridColumn: '5 / 8' }}>
          {renderCardButton(matGrandmother, 'FEMALE', false)}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <Loader size={32} />;
  }

  if (error || !treeRoot) {
    return <div className={styles.nodeCardEmpty}>{error ?? 'Brak danych drzewa.'}</div>;
  }

  const modalAge = selectedModalNode
    ? formatPolishAge(selectedModalNode.age, selectedModalNode.ageApproximate)
    : null;

  return (
    <div className={styles.treeContainer} data-testid="ancestor-tree-root">
      <div className={styles.desktopTree}>
        {renderDesktopBranch(treeRoot, 1, treeRoot.sex ?? 'UNKNOWN')}
      </div>

      {renderMobileStaggeredTree(treeRoot)}

      {/* PERSON DETAILS MODAL */}
      {selectedModalNode && (
        <div
          className={styles.modalOverlay}
          data-testid="tree-person-modal"
          onClick={() => {
            setSelectedModalNode(null);
          }}
        >
          <div
            className={styles.modalCard}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <PersonAvatar sex={selectedModalNode.sex} size="md" />
                <div>
                  <div className={styles.modalPersonName}>
                    {selectedModalNode.givenName ?? ''} {selectedModalNode.surname ?? ''}
                  </div>
                  <div className={styles.modalPersonSub}>
                    {formatCompactYears(selectedModalNode)}
                    {modalAge ? ` • ${modalAge}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Zamknij"
                onClick={() => {
                  setSelectedModalNode(null);
                }}
                className={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            {!selectedModalNode.privateRecord && (
              <div className={styles.modalBody}>
                {(selectedModalNode.birthDateText ?? selectedModalNode.birthPlace) && (
                  <div className={styles.modalRow}>
                    <span className={styles.modalLabel}>Urodzenie</span>
                    <span className={styles.modalValue}>
                      {selectedModalNode.birthDateText ?? ''}{' '}
                      {selectedModalNode.birthPlace
                        ? `(${selectedModalNode.birthPlace})`
                        : ''}
                    </span>
                  </div>
                )}
                {(selectedModalNode.weddingDateText ?? selectedModalNode.weddingPlace) && (
                  <div className={styles.modalRow}>
                    <span className={styles.modalLabel}>Ślub z drugim rodzicem</span>
                    <span className={styles.modalValue}>
                      {selectedModalNode.weddingDateText ?? ''}{' '}
                      {selectedModalNode.weddingPlace
                        ? `(${selectedModalNode.weddingPlace})`
                        : ''}
                    </span>
                  </div>
                )}
                {selectedModalNode.lifeState === 'DECEASED' &&
                  (selectedModalNode.deathDateText ?? selectedModalNode.deathPlace) && (
                    <div className={styles.modalRow}>
                      <span className={styles.modalLabel}>Śmierć</span>
                      <span className={styles.modalValue}>
                        {selectedModalNode.deathDateText ?? ''}{' '}
                        {selectedModalNode.deathPlace
                          ? `(${selectedModalNode.deathPlace})`
                          : ''}
                      </span>
                    </div>
                  )}
                {selectedModalNode.causeOfDeath && (
                  <div className={styles.modalRow}>
                    <span className={styles.modalLabel}>Przyczyna śmierci</span>
                    <span className={styles.modalValue}>{selectedModalNode.causeOfDeath}</span>
                  </div>
                )}
                {selectedModalNode.burialPlace && (
                  <div className={styles.modalRow}>
                    <span className={styles.modalLabel}>Miejsce pochówku</span>
                    <span className={styles.modalValue}>{selectedModalNode.burialPlace}</span>
                  </div>
                )}
              </div>
            )}

            <div className={styles.modalActions}>
              {!selectedModalNode.privateRecord && (
                <Link
                  to={`/biographies/${String(selectedModalNode.id)}`}
                  data-testid="modal-biography-link"
                  onClick={() => {
                    setSelectedModalNode(null);
                  }}
                  className={styles.modalBtnPrimary}
                >
                  📖 Przejdź do biografii
                </Link>
              )}

              {mode === 'full-tree' &&
                onSelectProband &&
                selectedModalNode.id !== treeRoot.id && (
                  <button
                    type="button"
                    data-testid="modal-set-proband-button"
                    onClick={() => {
                      const nextId = selectedModalNode.id;
                      setSelectedModalNode(null);
                      onSelectProband(nextId);
                    }}
                    className={styles.modalBtnSecondary}
                  >
                    🎯 Ustaw jako probanta
                  </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}