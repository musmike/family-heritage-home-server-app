import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MediaGallerySection from './MediaGallerySection';
import { mediaApi } from '../../api/mediaApi';

vi.mock('../../api/mediaApi', () => ({
  mediaApi: {
    getMediaByPerson: vi.fn(),
    getMediaByGrave: vi.fn(),
    getMediaByEvent: vi.fn(),
    previewFilename: vi.fn(),
    uploadMedia: vi.fn(),
    uploadBatchMedia: vi.fn(),
    updateMedia: vi.fn(),
    deleteMedia: vi.fn(),
    getThumbnailUrl: (id: number) => `http://mock/media/${String(id)}/thumbnail`,
    getFileUrl: (id: number) => `http://mock/media/${String(id)}/file`,
  },
}));

describe('MediaGallerySection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mediaApi).getMediaByPerson.mockResolvedValue([
      {
        id: 50,
        mediaType: 'IMAGE',
        primaryContext: 'PERSON',
        relativePath: 'undated/collections/jan_kowalski/jan_kowalski_portrait_01.jpg',
        fileName: 'jan_kowalski_portrait_01.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        title: 'Portret ślubny',
        description: null,
        createdAt: '2026-10-31T10:00:00',
        personIds: [1],
        graveIds: [],
      },
    ]);
  });

  it('should render media tiles without raw filename on main tile, open fullscreen lightbox and show details drawer for admin', async () => {
    render(
      <MemoryRouter>
        <MediaGallerySection
          context="PERSON"
          personId={1}
          primaryMediaId={50}
          isAdmin={true}
          sectionTitle="Zdjęcia i portrety tej osoby"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('media-tile-50')).toBeInTheDocument();
    });

    // Title is visible, but raw snake_case filename is hidden on the main tile
    expect(screen.getByText('Portret ślubny')).toBeInTheDocument();
    expect(screen.queryByText(/Nazwa pliku:/i)).not.toBeInTheDocument();

    // Click tile -> opens Fullscreen Lightbox
    fireEvent.click(screen.getByTestId('media-tile-50'));
    expect(screen.getByTestId('media-lightbox-modal')).toBeInTheDocument();

    // Open details drawer -> filename and admin path become visible
    fireEvent.click(screen.getByTestId('toggle-media-details-drawer'));
    expect(
      screen.getByText(/Nazwa pliku: jan_kowalski_portrait_01\.jpg/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ścieżka na dysku \(widoczna dla administratora\):/i)
    ).toBeInTheDocument();
  });
});