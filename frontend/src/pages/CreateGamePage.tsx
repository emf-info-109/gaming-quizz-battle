import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CategoryGrid } from '../components/CategoryGrid';
import { Alert, PageTitle, Spinner } from '../components/Feedback';
import { useAsync } from '../hooks/useAsync';
import { api, errorMessage } from '../lib/api';

export function CreateGamePage() {
  const navigate = useNavigate();
  const categories = useAsync(() => api.categories(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const game = await api.createMulti(slug);
      navigate(`/game/${game.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div>
      <PageTitle kicker="Multijoueur" title="Créer une partie">
        Tu deviens l’organisateur : choisis la catégorie, partage le code, puis lance la partie quand tout le monde est prêt
        (30 joueurs maximum).
      </PageTitle>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {categories.error && <Alert>{categories.error}</Alert>}
      {categories.loading && <Spinner />}
      {categories.data && <CategoryGrid categories={categories.data} onPick={create} busySlug={busy} />}
    </div>
  );
}
