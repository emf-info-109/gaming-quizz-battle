import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CategoryGrid } from '../components/CategoryGrid';
import { Alert, PageTitle, Spinner } from '../components/Feedback';
import { usePlayer } from '../hooks/PlayerContext';
import { useAsync } from '../hooks/useAsync';
import { api, errorMessage } from '../lib/api';

const NAME_MAX = 40;

export function CreateGamePage() {
  const navigate = useNavigate();
  const { player } = usePlayer();
  const categories = useAsync(() => api.categories(), []);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultName = `Partie de ${player?.pseudo ?? 'moi'}`;
  const trimmed = name.trim();
  const nameError = trimmed.length > 0 && trimmed.length < 3 ? 'Au moins 3 caractères (ou laisse vide).' : null;

  async function create(slug: string) {
    if (nameError) return;
    setBusy(slug);
    setError(null);
    try {
      const game = await api.createMulti(slug, { name: trimmed || undefined, isPublic });
      navigate(`/game/${game.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div>
      <PageTitle kicker="Multijoueur" title="Créer une partie">
        Tu deviens l’organisateur : donne un nom à ta salle, choisis la catégorie, discute avec les joueurs qui arrivent,
        puis lance la partie quand tout le monde est prêt (30 joueurs maximum).
      </PageTitle>

      <section className="card mb-6 grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-6">
        <div>
          <label htmlFor="game-name" className="mb-2 block text-sm font-medium text-slate-300">
            Nom de la partie <span className="text-slate-500">(facultatif)</span>
          </label>
          <input
            id="game-name"
            className="input font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            placeholder={defaultName}
            autoComplete="off"
            aria-describedby="game-name-hint"
            aria-invalid={Boolean(nameError)}
          />
          <p id="game-name-hint" className={`mt-1.5 text-xs ${nameError ? 'text-neon-red' : 'text-slate-500'}`}>
            {nameError ?? `${trimmed.length}/${NAME_MAX} · affiché dans la liste des parties et dans la salle d’attente`}
          </p>
        </div>

        <fieldset className="sm:mb-6">
          <legend className="mb-2 text-sm font-medium text-slate-300">Visibilité</legend>
          <div className="inline-flex w-full rounded-md border border-white/10 bg-ink-900 p-1 sm:w-auto" role="radiogroup">
            {[
              { value: true, label: '🌍 Publique', hint: 'Visible dans la liste' },
              { value: false, label: '🔒 Privée', hint: 'Avec le code uniquement' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={isPublic === o.value}
                onClick={() => setIsPublic(o.value)}
                title={o.hint}
                className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                  isPublic === o.value ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="-mt-3 text-xs text-slate-500 sm:col-span-2">
          {isPublic
            ? 'Partie publique : n’importe quel joueur peut la trouver dans « Rejoindre une partie ».'
            : 'Partie privée : seuls les joueurs à qui tu donnes le code (ou le lien) peuvent entrer.'}
        </p>
      </section>

      <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-slate-300">
        Choisis la catégorie pour créer la salle
      </h2>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {categories.error && <Alert>{categories.error}</Alert>}
      {categories.loading && <Spinner />}
      {categories.data && <CategoryGrid categories={categories.data} onPick={create} busySlug={busy} />}
    </div>
  );
}
