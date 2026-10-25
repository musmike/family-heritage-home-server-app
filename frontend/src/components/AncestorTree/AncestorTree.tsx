import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import Loader from '../Loader/Loader';
import PersonAvatar from '../PersonAvatar/PersonAvatar';
import styles from './AncestorTree.module.css';
import type { AncestorTreeNodeDto, PersonSex } from '../../types/biography';

interface AncestorTreeProps {
  rootPersonId: number;
  generations?: number;
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

const formatNodeLifespan = (node: AncestorTreeNodeDto): string => {
  if (node.privateRecord) {
    return 'Dane prywatne';
  }
  const b = node.birthYear !== null ? String(node.birthYear) : '?';
  const d = node.deathYear !== null ? String(node.deathYear) : '?';
  const ageStr = formatPolishAge(node.age, node.ageApproximate);

  if (node.lifeState === 'DECEASED') {
    const base = `${b}–${d}`;
    return ageStr ? `${base} (${ageStr})` : base;
  }
  if (node.birthYear !== null) {
    return ageStr ? `ur. ${b} (${ageStr})` : `ur. ${b}`;
  }
  return '';
};

const getBorderClass = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return styles.borderMale;
  if (sex === 'FEMALE') return styles.borderFemale;
  return styles.borderNeutral;
};

export default function AncestorTree({
  rootPersonId,
  generations = 3,
  mode,
  onSelectProband,
}: AncestorTreeProps) {
  const [treeRoot, setTreeRoot] = useState<AncestorTreeNodeDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const renderBranch = (
    node: AncestorTreeNodeDto | null,
    currentGen: number,
    expectedSex: PersonSex
  ) => {
    const hasFurtherGenerations = currentGen < generations;
    const isCompact = generations >= 4 && currentGen >= 3;

    return (
      <div className={styles.branchContainer}>
        {hasFurtherGenerations && (
          <>
            <div className={styles.parentsPairContainer}>
              {/* Father is always First: Left on Desktop, Upper/Higher on Mobile */}
              {renderBranch(node?.father ?? null, currentGen + 1, 'MALE')}
              {/* Mother is always Second: Right on Desktop, Lower on Mobile */}
              {renderBranch(node?.mother ?? null, currentGen + 1, 'FEMALE')}
            </div>
            <div className={styles.forkConnector} aria-hidden="true" />
          </>
        )}

        <div className={styles.nodeCardWrapper}>
          {!node ? (
            <div className={styles.nodeCardEmpty}>
              {expectedSex === 'MALE' ? 'Nieznany ojciec' : 'Nieznana matka'}
            </div>
          ) : (
            renderNodeCard(node, currentGen === 1, isCompact)
          )}
        </div>
      </div>
    );
  };

  const renderNodeCard = (
    node: AncestorTreeNodeDto,
    isProband: boolean,
    isCompact: boolean
  ) => {
    const fullName = `${node.givenName ?? ''} ${node.surname ?? ''}`.trim();
    const lifespan = formatNodeLifespan(node);
    const borderClass = getBorderClass(node.sex);
    const compactClass = isCompact ? styles.nodeCardCompact : '';
    const probandClass = isProband ? styles.nodeCardProband : '';

    const cardInner = (
      <>
        <div className={styles.nodeHeader}>
          {!isCompact && <PersonAvatar sex={node.sex} size="sm" />}
          <div className={styles.nodeTitleBox}>
            <div className={styles.nodeName}>{fullName}</div>
            {lifespan && <div className={styles.nodeLifespan}>{lifespan}</div>}
          </div>
        </div>

        {!node.privateRecord && (
          <div className={styles.nodeDetails}>
            {(node.birthDateText ?? node.birthPlace) && (
              <div className={styles.detailItem}>
                <span className={styles.detailTag}>Ur.:</span>{' '}
                {node.birthDateText ?? ''}{' '}
                {node.birthPlace ? `(${node.birthPlace})` : ''}
              </div>
            )}
            {(node.weddingDateText ?? node.weddingPlace) && (
              <div className={styles.detailItem}>
                <span className={styles.detailTag}>Ślub:</span>{' '}
                {node.weddingDateText ?? ''}{' '}
                {node.weddingPlace ? `(${node.weddingPlace})` : ''}
              </div>
            )}
            {node.lifeState === 'DECEASED' && (node.deathDateText ?? node.deathPlace) && (
              <div className={styles.detailItem}>
                <span className={styles.detailTag}>Zm.:</span>{' '}
                {node.deathDateText ?? ''}{' '}
                {node.deathPlace ? `(${node.deathPlace})` : ''}
              </div>
            )}
            {!isCompact && node.causeOfDeath && (
              <div className={styles.detailItem}>
                <span className={styles.detailTag}>Przyczyna:</span> {node.causeOfDeath}
              </div>
            )}
            {!isCompact && node.burialPlace && (
              <div className={styles.detailItem}>
                <span className={styles.detailTag}>Pochówek:</span> {node.burialPlace}
              </div>
            )}
          </div>
        )}

        {mode === 'full-tree' && (
          <div className={styles.nodeActions}>
            {!isProband && onSelectProband && (
              <button
                type="button"
                data-testid={`tree-set-proband-${String(node.id)}`}
                onClick={() => {
                  onSelectProband(node.id);
                }}
                className={styles.actionBtn}
              >
                🎯 Jako probant
              </button>
            )}
            {!node.privateRecord && (
              <Link
                to={`/biographies/${String(node.id)}`}
                data-testid={`tree-bio-link-${String(node.id)}`}
                className={styles.actionBtn}
              >
                📖 Biografia
              </Link>
            )}
          </div>
        )}
      </>
    );

    // In biography mode, clicking an ancestor card navigates directly to their biography
    if (mode === 'biography' && !isProband && !node.privateRecord) {
      return (
        <Link
          to={`/biographies/${String(node.id)}`}
          data-testid={`bio-tree-node-${String(node.id)}`}
          className={`${styles.nodeCard} ${styles.nodeCardClickable} ${borderClass} ${compactClass}`}
        >
          {cardInner}
        </Link>
      );
    }

    return (
      <div
        data-testid={`tree-node-${String(node.id)}`}
        className={`${styles.nodeCard} ${borderClass} ${probandClass} ${compactClass}`}
      >
        {cardInner}
      </div>
    );
  };

  if (isLoading) {
    return <Loader size={32} />;
  }

  if (error || !treeRoot) {
    return <div className={styles.nodeCardEmpty}>{error ?? 'Brak danych drzewa.'}</div>;
  }

  return (
    <div className={styles.treeContainer} data-testid="ancestor-tree-root">
      {renderBranch(treeRoot, 1, treeRoot.sex ?? 'UNKNOWN')}
    </div>
  );
}