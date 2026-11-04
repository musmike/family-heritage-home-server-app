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
    getGalleryPage: vi.fn(),
    previewFilename: vi.fn(),
    uploadMedia: vi.fn(),
    uploadBatchMedia: vi.fn(),
    updateMedia: vi.fn(),
    bulkUpdateMedia: vi.fn(),
    linkExistingMedia: vi.fn(),
    unlinkMediaFromContext: vi.fn(),
    deleteMedia: vi.fn(),
    getThumbnailUrl: (id: number) => `http://mock/media/${String(id)}/thumbnail`,
    getFileUrl: (id: number) => `http://mock/media/${String(id)}/file`,
    getAllCollections: vi.fn().mockResolvedValue([]),
    getMediaById: vi.fn(),
    getVersionFileUrl: (id: number, vId: number) =>
      `http://mock/media/${String(id)}/versions/${String(vId)}/file`,
  },
}));

describe('MediaGallerySection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockItems = [
      {
        id: 50,
        mediaType: 'IMAGE' as const,
        primaryContext: 'PERSON' as const,
        relativePath: 'undated/collections/jan_kowalski/jan_kowalski_portrait_01.jpg',
        fileName: 'jan_kowalski_portrait_01.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        title: 'Portret ślubny',
        description: null,
        metadataDateText: '15.07.2018, godz. 14:23:08',
        metadataDateSource: 'EXIF: DateTimeOriginal (Data wykonania zdjęcia)',
        createdAt: '2026-10-31T10:00:00',
        personIds: [1],
        graveIds: [],
      },
      {
        id: 51,
        mediaType: 'VIDEO' as const,
        primaryContext: 'PERSON' as const,
        relativePath: 'undated/collections/jan_kowalski/nagranie_01.mp4',
        fileName: 'nagranie_01.mp4',
        mimeType: 'video/mp4',
        fileSize: 4096,
        title: 'Wywiad rodzinny',
        description: null,
        createdAt: '2026-10-31T11:00:00',
        personIds: [1],
        graveIds: [],
      },
    ];
    vi.mocked(mediaApi).getMediaByPerson.mockResolvedValue(mockItems);
    vi.mocked(mediaApi).getMediaByGrave.mockResolvedValue(mockItems);
    vi.mocked(mediaApi).getMediaByEvent.mockResolvedValue(mockItems);
  });

  it('should filter by image/video, open fullscreen lightbox, show metadata source tag, and allow linking existing gallery media', async () => {
    vi.mocked(mediaApi).getGalleryPage.mockResolvedValue({
      content: [
        {
          id: 99,
          mediaType: 'IMAGE',
          primaryContext: 'EVENT',
          relativePath: 'dated/1990s/1995/wakacje_01.jpg',
          fileName: 'wakacje_01.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
          title: 'Wujek na wakacjach',
          description: null,
          createdAt: '2026-10-31T12:00:00',
          personIds: [],
          graveIds: [],
        },
      ],
      page: 0,
      size: 60,
      totalElements: 1,
      totalPages: 1,
      totalImagesCount: 1,
      totalVideosCount: 0,
      collections: [],
    });

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
    expect(screen.getByTestId('media-tile-51')).toBeInTheDocument();

    // Filter to Videos Only -> hides image 50, keeps video 51
    fireEvent.click(screen.getByTestId('media-filter-video'));
    expect(screen.queryByTestId('media-tile-50')).not.toBeInTheDocument();
    expect(screen.getByTestId('media-tile-51')).toBeInTheDocument();

    // Reset filter to All
    fireEvent.click(screen.getByTestId('media-filter-all'));
    expect(screen.getByTestId('media-tile-50')).toBeInTheDocument();

    // Click tile 50 -> opens Fullscreen Lightbox and shows metadata source tag in details drawer
    fireEvent.click(screen.getByTestId('media-tile-50'));
    expect(screen.getByTestId('media-lightbox-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-media-details-drawer'));
    expect(
      screen.getByText(/Nazwa pliku: jan_kowalski_portrait_01\.jpg/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/EXIF: DateTimeOriginal \(Data wykonania zdjęcia\)/i)
    ).toBeInTheDocument();

    // Close lightbox and open "Wybierz istniejące z galerii" modal
    fireEvent.click(screen.getByTestId('media-lightbox-modal'));
    fireEvent.click(screen.getByTestId('open-link-existing-media-button'));

    await waitFor(() => {
      expect(screen.getByTestId('existing-gallery-candidate-99')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('existing-gallery-candidate-99'));
    fireEvent.click(screen.getByTestId('confirm-link-existing-media-button'));

    await waitFor(() => {
      expect(mediaApi.linkExistingMedia).toHaveBeenCalledWith(
        expect.objectContaining({ mediaIds: [99], personId: 1 })
      );
    });
  });

  it('should display primary photo badge for graves only when admin', async () => {
    // 1. Non-admin on GRAVE context
    const { unmount } = render(
      <MediaGallerySection
        context="GRAVE"
        graveId={10}
        primaryMediaId={50}
        isAdmin={false}
        sectionTitle="Zdjęcia nagrobka"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('media-tile-50')).toBeInTheDocument();
    });
    expect(screen.queryByText(/⭐ Zdjęcie główne/i)).not.toBeInTheDocument();

    unmount();

    // 2. Admin on GRAVE context
    render(
      <MediaGallerySection
        context="GRAVE"
        graveId={10}
        primaryMediaId={50}
        isAdmin={true}
        sectionTitle="Zdjęcia nagrobka"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('media-tile-50')).toBeInTheDocument();
    });
    expect(screen.getByText(/⭐ Zdjęcie główne/i)).toBeInTheDocument();
  });

  it('should render description as resizable textarea in edit modal', async () => {
    render(
      <MediaGallerySection
        context="PERSON"
        personId={1}
        isAdmin={true}
        sectionTitle="Zdjęcia i nagrania"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('media-tile-50')).toBeInTheDocument();
    });

    // Open lightbox
    fireEvent.click(screen.getByTestId('media-tile-50'));

    // Open details drawer and edit mode
    fireEvent.click(screen.getByTestId('toggle-media-details-drawer'));
    fireEvent.click(screen.getByTestId('start-edit-media-item-button'));

    await waitFor(() => {
      const descField = screen.getByLabelText(/Opis tekstowy \(zwykły tekst\)/i);
      expect(descField.tagName.toLowerCase()).toBe('textarea');
    });
  });
});