import { LinkButton } from '../components/Button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="font-display text-8xl font-semibold leading-none tabular-nums text-slate-500">404</p>
      <p className="mt-4 text-lg text-slate-300">Cette zone de la carte n’existe pas</p>
      <LinkButton to="/" className="mt-8">
        Retour au spawn
      </LinkButton>
    </div>
  );
}
