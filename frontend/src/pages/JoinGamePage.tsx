import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { Alert, PageTitle } from '../components/Feedback';
import { api, errorMessage } from '../lib/api';

const ALLOWED = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;

export function JoinGamePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase().replace(ALLOWED, '').slice(0, 6));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.joinMulti(code);
      navigate(`/game/${res.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageTitle kicker="Multijoueur" title="Rejoindre une partie">
        Entre le code à 6 caractères affiché sur l’écran de l’organisateur.
      </PageTitle>
      <form onSubmit={onSubmit} className="card space-y-5 p-6">
        <label htmlFor="code" className="sr-only">Code de la partie</label>
        <input
          id="code"
          className="input text-center font-display text-3xl font-bold uppercase tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(ALLOWED, '').slice(0, 6))}
          placeholder="ABC234"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          autoFocus
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.length !== 6}>
          Rejoindre 🚀
        </Button>
      </form>
    </div>
  );
}
