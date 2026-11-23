import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CategoryGrid } from '../components/CategoryGrid';
import { Alert, PageTitle, Spinner } from '../components/Feedback';
import { useAsync } from '../hooks/useAsync';
import { api, errorMessage } from '../lib/api';

export function SoloSetupPage() {
  const navigate = useNavigate();
  const categories = useAsync(() => api.categories(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const game = await api.createSolo(slug);
      navigate(`/solo/${game.gameId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div>
      <PageTitle kicker="Mode solo" title="Choisis ta catégorie">
        10 questions · 15 secondes par question · 500 points par bonne réponse + jusqu’à 500 points de bonus de rapidité.
      </PageTitle>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {categories.error && <Alert>{categories.error}</Alert>}
      {categories.loading && <Spinner />}
      {categories.data && <CategoryGrid categories={categories.data} onPick={start} busySlug={busy} />}
    </div>
  );
}
