import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinGamePage } from '../src/pages/JoinGamePage';
import type { OpenGame } from '../src/lib/types';

const game = (over: Partial<OpenGame>): OpenGame => ({
  code: 'K7XM2P',
  name: 'Les pros de LoL',
  category: 'League of Legends',
  categorySlug: 'league-of-legends',
  host: { pseudo: 'asd', avatar: 'unicorn' },
  playerCount: 3,
  maxPlayers: 30,
  questionCount: 10,
  joined: false,
  createdAt: '2026-11-26T17:40:00Z',
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('liste des parties en attente', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche les salles et rejoint celle choisie', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/games') {
        return Promise.resolve(
          json({ games: [game({}), game({ code: 'ZZ2PQR', name: 'Salle pleine', playerCount: 30 })] }),
        );
      }
      if (url === '/api/games/join') return Promise.resolve(json({ code: 'K7XM2P', alreadyJoined: false }));
      return Promise.resolve(json({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/multi/join']}>
        <Routes>
          <Route path="/multi/join" element={<JoinGamePage />} />
          <Route path="/game/:code" element={<p>Salle K7XM2P ouverte</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Les pros de LoL')).toBeTruthy();
    // Une salle complète ne peut pas être rejointe
    expect((screen.getByRole('button', { name: 'Complète' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));
    await waitFor(() => expect(screen.getByText('Salle K7XM2P ouverte')).toBeTruthy());
    const joinCall = fetchMock.mock.calls.find(([url]) => url === '/api/games/join') as unknown as [string, RequestInit];
    expect(JSON.parse(String(joinCall[1].body))).toEqual({ code: 'K7XM2P' });
  });

  it('propose de créer une partie quand la liste est vide', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ games: [] }))));
    render(
      <MemoryRouter>
        <JoinGamePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Aucune partie publique/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Créer la mienne/ }).getAttribute('href')).toBe('/multi/create');
  });
});
