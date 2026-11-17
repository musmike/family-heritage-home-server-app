import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination Component', () => {
  it('should render subtitle and simple page list when totalPages <= 7', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={0}
        totalPages={5}
        totalElements={50}
        elementsLabel="Łącznie elementów"
        onPageChange={handlePageChange}
      />
    );

    expect(screen.getByTestId('pagination-subtitle')).toHaveTextContent(
      'Łącznie elementów: 50 (strona 1 z 5)'
    );
    expect(screen.getByTestId('pagination-prev')).toBeDisabled();
    expect(screen.getByTestId('pagination-next')).not.toBeDisabled();

    // Pages 1 to 5
    expect(screen.getByTestId('pagination-page-1')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page-5')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pagination-page-3'));
    expect(handlePageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId('pagination-next'));
    expect(handlePageChange).toHaveBeenCalledWith(1);
  });

  it('should handle ellipsis when totalPages > 7 and jump to specific page', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={5}
        totalPages={12}
        totalElements={120}
        elementsLabel="Łącznie elementów"
        onPageChange={handlePageChange}
      />
    );

    expect(screen.getByTestId('pagination-page-1')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page-5')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page-6')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page-7')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page-12')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pagination-prev'));
    expect(handlePageChange).toHaveBeenCalledWith(4);
  });
});

