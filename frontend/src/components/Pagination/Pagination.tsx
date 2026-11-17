import React from 'react';
import styles from './Pagination.module.css';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalElements?: number;
  elementsLabel?: string;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

type PageItem = number | 'ellipsis-left' | 'ellipsis-right';

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalElements,
  elementsLabel,
  onPageChange,
  disabled = false,
}) => {
  if (totalPages <= 1 && totalElements === undefined) {
    return null;
  }

  const generatePageItems = (): PageItem[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    if (currentPage <= 3) {
      return [0, 1, 2, 3, 4, 'ellipsis-right', totalPages - 1];
    }

    if (currentPage >= totalPages - 4) {
      return [
        0,
        'ellipsis-left',
        totalPages - 5,
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
      ];
    }

    return [
      0,
      'ellipsis-left',
      currentPage - 1,
      currentPage,
      currentPage + 1,
      'ellipsis-right',
      totalPages - 1,
    ];
  };

  const pageItems = generatePageItems();

  return (
    <div className={styles.paginationBar} data-testid="pagination-bar">
      {elementsLabel && totalElements !== undefined && (
        <span className={styles.pageSubtitle} data-testid="pagination-subtitle">
          {elementsLabel}: <strong>{totalElements}</strong> (strona{' '}
          {totalPages === 0 ? 0 : currentPage + 1} z {totalPages})
        </span>
      )}

      {totalPages > 1 && (
        <div className={styles.controlsGroup}>
          <button
            type="button"
            data-testid="pagination-prev"
            disabled={disabled || currentPage <= 0}
            onClick={() => {
              onPageChange(currentPage - 1);
            }}
            className={styles.navButton}
            aria-label="Poprzednia strona"
          >
            ← Poprzednia
          </button>

          {pageItems.map((item, index) => {
            if (typeof item === 'string') {
              return (
                <span
                  key={`${item}-${String(index)}`}
                  className={styles.ellipsis}
                  aria-hidden="true"
                >
                  …
                </span>
              );
            }

            const pageNum = item + 1;
            const isActive = item === currentPage;

            return (
              <button
                key={item}
                type="button"
                data-testid={`pagination-page-${String(pageNum)}`}
                disabled={disabled}
                onClick={() => {
                  if (!isActive) {
                    onPageChange(item);
                  }
                }}
                className={`${styles.pageButton} ${isActive ? styles.active : ''}`}
                aria-label={`Przejdź do strony ${String(pageNum)}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            data-testid="pagination-next"
            disabled={disabled || currentPage + 1 >= totalPages}
            onClick={() => {
              onPageChange(currentPage + 1);
            }}
            className={styles.navButton}
            aria-label="Następna strona"
          >
            Następna →
          </button>
        </div>
      )}
    </div>
  );
};

