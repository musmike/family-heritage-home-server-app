import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GalleryPage from './GalleryPage';
import { AuthContext } from '../../context/AuthContext';
import { mediaApi } from '../../api/mediaApi';
import type { MediaGalleryPageDto } from '../../types/media';

vi.mock('../../api/mediaApi', () => ({
  mediaApi: {
    getGalleryPage: vi.fn(),
    getAllCollections: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    previewFilename: vi.fn(),
    uploadMedia: vi.fn(),
    uploadBatchMedia: vi.fn(),
    getMediaById: vi.fn(),
    updateMedia: vi.fn(),
    bulkUpdateMedia: vi.fn(),
    linkExistingMedia: vi.fn(),
    unlinkMediaFromContext: vi.fn(),
    deleteMedia: vi.fn(),
    getThumbnailUrl: (id: number) => `http://mock/media/${String(id)}/thumbnail`,
    getFileUrl: (id: number) => `http://mock/media/${String(id)}/file`,
    getVersionFileUrl: (id: number, vId: number) =>
      `http://mock/media/${String(id)}/versions/${String(vId)}/file`,
  },
}));

describe('GalleryPage Component', () => {
  const adminContext = {
    user: { username: 'admin', roles: ['ROLE_ADMIN'] },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const mockGalleryPage: MediaGalleryPageDto = {
    content: [
      {
        id: 10,
        mediaType: 'IMAGE',
        primaryContext: 'PERSON',
        portrait: true,
        relativePath: 'undated/collections/zbior_babci/portraits/single/zbior_babci_01.jpg',
        fileName: 'zbior_babci_01.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
        title: 'Dziadek w wojsku',
        description: null,
        year: 1938,
        collectionId: 1,
        collectionName: 'Zbiór po babci Katarzynie',
        createdAt: '2026-10-30T10:00:00',
        personIds: [5],
        personNames: ['Jan Kowalski'],
        depictedPersons: [
          {
            personId: 5,
            displayName: 'Jan Kowalski',
            sex: 'MALE',
            linkType: 'DEPICTED',
          },
        ],
        graveIds: [],
        cemeteryNames: [],
        eventIds: [],
        eventLabels: [],
      },
    ],
    page: 0,
    size: 48,
    totalElements: 1,
    totalPages: 1,
    totalImagesCount: 1,
    totalVideosCount: 0,
    collections: [
      {
        id: 1,
        name: 'Zbiór po babci Katarzynie',
        slug: 'zbior_babci',
        description: 'Stare fotografie z pudełka po babci',
        founderPersonId: 5,
        founderPersonName: 'Katarzyna Kowalska',
        mediaCount: 1,
        createdAt: '2026-10-30T09:00:00',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render media items in open upload-date ribbons, drill down in PERSON view, and allow creating a collection', async () => {
    const mockedApi = vi.mocked(mediaApi);
    mockedApi.getGalleryPage.mockResolvedValue(mockGalleryPage);
    mockedApi.createCollection.mockResolvedValue(mockGalleryPage.collections[0]);

    render(
      <MemoryRouter>
        <AuthContext value={adminContext}>
          <GalleryPage />
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('gallery-item-10')).toBeInTheDocument();
    });
    expect(screen.getByText('Dziadek w wojsku')).toBeInTheDocument();

    // Switch to PERSON view -> shows clickable person tile "Jan Kowalski"
    fireEvent.change(screen.getByTestId('gal-category-select'), {
      target: { value: 'PERSON' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('gallery-grouped-sections')).toBeInTheDocument();
    });
    expect(screen.getByText('Jan Kowalski')).toBeInTheDocument();

    // Click on "Jan Kowalski" tile -> shows "Portrety jednoosobowe" tile
    fireEvent.click(screen.getByText('Jan Kowalski'));
    expect(screen.getByText('Portrety jednoosobowe')).toBeInTheDocument();

    // Open Create Collection form and submit
    fireEvent.click(screen.getByTestId('open-create-collection-button'));
    fireEvent.change(screen.getByTestId('col-name-input'), {
      target: { value: 'Nowy zbiór rodzinny' },
    });
    fireEvent.click(screen.getByTestId('submit-create-collection-button'));

    await waitFor(() => {
      expect(mockedApi.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nowy zbiór rodzinny' })
      );
    });
  });
});