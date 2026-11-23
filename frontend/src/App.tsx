import type { ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { RequireProfile } from './components/RequireProfile';
import { PlayerProvider } from './hooks/PlayerContext';
import { CloudDashboardPage } from './pages/CloudDashboardPage';
import { CreateGamePage } from './pages/CreateGamePage';
import { HomePage } from './pages/HomePage';
import { JoinGamePage } from './pages/JoinGamePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { MultiGamePage } from './pages/MultiGamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { SoloGamePage } from './pages/SoloGamePage';
import { SoloSetupPage } from './pages/SoloSetupPage';

const guard = (el: ReactNode) => <RequireProfile>{el}</RequireProfile>;

export const routes = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'leaderboard', element: <LeaderboardPage /> },
      { path: 'cloud-dashboard', element: <CloudDashboardPage /> },
      { path: 'solo', element: guard(<SoloSetupPage />) },
      { path: 'solo/:gameId', element: guard(<SoloGamePage />) },
      { path: 'multi/create', element: guard(<CreateGamePage />) },
      { path: 'multi/join', element: guard(<JoinGamePage />) },
      { path: 'game/:code', element: guard(<MultiGamePage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return (
    <PlayerProvider>
      <RouterProvider router={router} />
    </PlayerProvider>
  );
}
