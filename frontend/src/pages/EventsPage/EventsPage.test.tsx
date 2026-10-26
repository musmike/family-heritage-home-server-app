import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventsPage from './EventsPage';
import EventDetailsPage from './EventDetailsPage';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import type { EventsTimelinePageDto } from '../../types/eventTimeline';

vi.mock('../../api/eventTimelineApi', () => ({
  eventTimelineApi: {
    getEventsTimeline: vi.fn(),
    getEventById: vi.fn(),
  },
}));

describe('EventsPage and EventDetailsPage Components', () => {
  const mockTimeline: EventsTimelinePageDto = {
    page: 0,
    size: 5000,
    totalEvents: 2,
    totalPages: 1,
    availableTypes: [
      { code: 'BIRTH', label: 'Narodziny', system: true },
      { code: 'WEDDING', label: 'Ślub', system: true },
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
                typeLabel: 'Ślub',
                systemType: true,
                year: 1948,
                dateText: '10.06.1948',
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
                    ageAtEvent: 28,
                    ageApproximate: false,
                    parentNames: [],
                  },
                ],
                attributes: [],
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

  it('should render collapsed decades by default, expand decade and year on click, and filter by type', async () => {
    const mockedApi = vi.mocked(eventTimelineApi);
    mockedApi.getEventsTimeline.mockResolvedValue(mockTimeline);

    render(
      <MemoryRouter initialEntries={['/events']}>
        <Routes>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('decade-section-1940')).toBeInTheDocument();
    });

    // Collapsed by default -> year 1948 is not visible yet
    expect(screen.queryByTestId('year-toggle-1948')).not.toBeInTheDocument();

    // Expand decade 1940 -> year 1948 button appears
    fireEvent.click(screen.getByTestId('decade-toggle-1940'));
    expect(screen.getByTestId('year-toggle-1948')).toBeInTheDocument();

    // Expand year 1948 -> compact event tile appears
    fireEvent.click(screen.getByTestId('year-toggle-1948'));
    expect(screen.getByTestId('timeline-event-100')).toBeInTheDocument();
    expect(screen.getByText('Kowalski Jan')).toBeInTheDocument();

    // Filter by custom VACATION type
    fireEvent.click(screen.getByTestId('events-types-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('event-type-checkbox-VACATION'));
    await waitFor(() => {
      expect(mockedApi.getEventsTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ types: ['VACATION'] })
      );
    });
  });

  it('should render full event details on EventDetailsPage', async () => {
    const mockedApi = vi.mocked(eventTimelineApi);
    mockedApi.getEventById.mockResolvedValue(mockTimeline.decades[0].years[0].events[0]);

    render(
      <MemoryRouter initialEntries={['/events/100']}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Kowalski Jan \(28 lat\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Warszawa')).toBeInTheDocument();
  });
});