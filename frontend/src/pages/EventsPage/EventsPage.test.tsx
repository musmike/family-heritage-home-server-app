import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventsPage from './EventsPage';
import EventDetailsPage from './EventDetailsPage';
import { AuthContext } from '../../context/AuthContext';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import type { EventsTimelinePageDto } from '../../types/eventTimeline';

vi.mock('../../api/eventTimelineApi', () => ({
  eventTimelineApi: {
    getEventsTimeline: vi.fn(),
    getEventById: vi.fn(),
    getAvailableTypes: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    updateEventDetails: vi.fn(),
    deleteEvent: vi.fn(),
  },
}));

vi.mock('../../api/mediaApi', () => ({
  mediaApi: {
    getMediaByEvent: vi.fn().mockResolvedValue({ directMedia: [], subEventGroups: [] }),
    getThumbnailUrl: (id: number) => `http://mock/media/${String(id)}/thumbnail`,
    getFileUrl: (id: number) => `http://mock/media/${String(id)}/file`,
  },
}));

describe('EventsPage and EventDetailsPage Components', () => {
  const adminContext = {
    user: { username: 'admin', roles: ['ROLE_ADMIN'] },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const mockTimeline: EventsTimelinePageDto = {
    page: 0,
    size: 5000,
    totalEvents: 2,
    totalPages: 1,
    minAvailableYear: 1940,
    maxAvailableYear: 2020,
    availableTypes: [
      { code: 'BIRTH', label: 'Narodziny', system: true },
      { code: 'WEDDING', label: 'Ślub i wesele', system: true },
      { code: 'VACATION', label: 'Wakacje w górach', system: false },
    ],
    decades: [
      {
        decadeStart: 1940,
        decadeLabel: 'Lata 1940–1949',
        eventsCount: 1,
        years: [
          {
            year: 1948,
            events: [
              {
                eventId: 100,
                typeCode: 'WEDDING',
                typeLabel: 'Ślub i wesele',
                assignedTypeCodes: ['WEDDING'],
                assignedTypeLabels: ['Ślub i wesele'],
                systemType: true,
                description: '## Przebieg uroczystości\nWspomnienia ze **ślubu** w Warszawie.',
                year: 1948,
                dateText: '10.06.1948, godz. 14:00:00',
                locationName: 'Warszawa',
                participants: [
                  {
                    personId: 1,
                    givenName: 'Jan',
                    surname: 'Kowalski',
                    sex: 'MALE',
                    lifeState: 'DECEASED',
                    archived: false,
                    privateRecord: false,
                    roleCode: 'PRINCIPAL',
                    roleLabel: 'Główny uczestnik',
                    ageAtEvent: 28,
                    ageApproximate: false,
                    parentNames: [],
                  },
                ],
                attributes: [],
                subEvents: [
                  {
                    eventId: 101,
                    typeCode: 'WEDDING_CEREMONY',
                    typeLabel: 'Ceremonia ślubu',
                    systemType: true,
                    year: 1948,
                    dateText: '10.06.1948, godz. 14:00:00',
                    locationName: 'Warszawa',
                    participants: [],
                    attributes: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    undatedEvents: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should default to DESC sort order, commit year slider only on mouseUp, and expand decades/years', async () => {
    const mockedApi = vi.mocked(eventTimelineApi);
    mockedApi.getEventsTimeline.mockResolvedValue(mockTimeline);

    render(
      <MemoryRouter initialEntries={['/events']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventDetailsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('decade-section-1940')).toBeInTheDocument();
    });

    // Default sortOrder is DESC
    expect(mockedApi.getEventsTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'DESC' })
    );

    expect(screen.queryByTestId('year-toggle-1948')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('decade-toggle-1940'));
    expect(screen.getByTestId('year-toggle-1948')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('year-toggle-1948'));
    expect(screen.getByTestId('timeline-event-100')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-subevent-101')).toBeInTheDocument();
    expect(screen.getByText(/↳ Podwydarzenie: Ceremonia ślubu/i)).toBeInTheDocument();
    expect(screen.getByText('Jan Kowalski')).toBeInTheDocument();

    // Dragging slider changes visual value without calling API until mouseUp
    const callCountBeforeDrag = mockedApi.getEventsTimeline.mock.calls.length;
    const sliderFrom = screen.getByTestId('slider-year-from');
    fireEvent.change(sliderFrom, { target: { value: '1950' } });
    expect(mockedApi.getEventsTimeline.mock.calls.length).toBe(callCountBeforeDrag);

    fireEvent.mouseUp(sliderFrom);
    await waitFor(() => {
      expect(mockedApi.getEventsTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ yearFrom: 1950 })
      );
    });
  });

  it('should render full event details with Markdown description section on EventDetailsPage', async () => {
    const mockedApi = vi.mocked(eventTimelineApi);
    mockedApi.getEventById.mockResolvedValue(mockTimeline.decades[0].years[0].events[0]);

    render(
      <MemoryRouter initialEntries={['/events/100']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/events/:eventId" element={<EventDetailsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Jan Kowalski \(28 lat\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Warszawa')).toBeInTheDocument();
    expect(screen.getByText('10.06.1948, godz. 14:00:00')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-event-description-section')).toBeInTheDocument();
    expect(screen.getByText('Przebieg uroczystości')).toBeInTheDocument();
  });
});