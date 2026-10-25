import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { SidebarProvider } from '../../context/SidebarContext';

describe('Sidebar Component', () => {
  const renderSidebar = () => {
    render(
      <BrowserRouter>
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      </BrowserRouter>
    );
  };

  it('should render enabled navigation links and disabled upcoming links', () => {
    renderSidebar();

    // Enabled links
    expect(screen.getByRole('link', { name: /Panel główny/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Biografie/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Wydarzenia/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Drzewo genealogiczne/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Pochówki/i })).not.toHaveAttribute('aria-disabled');

    // Disabled upcoming links
    expect(screen.getByRole('link', { name: /Wspomnienia i cytaty/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Dziennik/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Statystyki/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Galeria/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Dokumenty/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Miejsca/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Pamiątki/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('should render the dividers between sections', () => {
    renderSidebar();
    expect(screen.getAllByRole('separator')).toHaveLength(3);
  });
});