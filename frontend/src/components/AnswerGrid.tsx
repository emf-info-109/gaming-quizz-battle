import { ANSWER_LETTERS } from '../lib/format';
import { CheckIcon, XIcon } from './Icons';

/**
 * Les quatre réponses : c'est le « moment » de l'écran, là où vit la couleur.
 * Chaque réponse garde sa couleur (lettre A/B/C/D en coin coupé) ; la tuile reste neutre.
 */
const LETTER_COLORS = ['bg-neon-blue text-white', 'bg-neon-violet text-white', 'bg-neon-cyan text-ink-950', 'bg-neon-pink text-white'];
const HOVER_BORDERS = ['enabled:hover:border-neon-blue/60', 'enabled:hover:border-neon-violet/60', 'enabled:hover:border-neon-cyan/60', 'enabled:hover:border-neon-pink/60'];

interface AnswerGridProps {
  answers: readonly string[];
  onSelect?: (index: number) => void;
  /** Réponse choisie par le joueur */
  selected?: number | null;
  /** Bonne réponse (uniquement après correction) */
  correctIndex?: number | null;
  /** Nombre de joueurs par réponse (multijoueur, après correction) */
  distribution?: readonly number[] | null;
  disabled?: boolean;
}

export function AnswerGrid({ answers, onSelect, selected = null, correctIndex = null, distribution = null, disabled }: AnswerGridProps) {
  const revealed = correctIndex !== null && correctIndex !== undefined;
  const totalVotes = distribution?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {answers.map((answer, i) => {
        const isSelected = selected === i;
        const isCorrect = revealed && i === correctIndex;
        const isWrongPick = revealed && isSelected && !isCorrect;
        let state = `border-white/[0.08] bg-ink-850 enabled:hover:bg-ink-800 ${HOVER_BORDERS[i]}`;
        if (revealed) {
          if (isCorrect) state = 'border-neon-green/70 bg-neon-green/[0.08]';
          else if (isWrongPick) state = 'border-neon-red/70 bg-neon-red/[0.08]';
          else state = 'border-white/[0.06] bg-ink-850 opacity-50';
        } else if (isSelected) {
          state = 'border-neon-cyan bg-ink-800';
        } else if (selected !== null) {
          state = 'border-white/[0.06] bg-ink-850 opacity-50';
        }
        const votes = distribution?.[i] ?? 0;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || revealed || !onSelect}
            onClick={() => onSelect?.(i)}
            className={`relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,opacity,transform] duration-150 ease-out-soft enabled:active:scale-[0.98] disabled:cursor-default ${state}`}
          >
            {distribution && totalVotes > 0 && (
              <span
                className="absolute inset-y-0 left-0 bg-white/[0.04] transition-[width] duration-500 ease-out-soft"
                style={{ width: `${(votes / totalVotes) * 100}%` }}
                aria-hidden="true"
              />
            )}
            <span
              className={`chamfer-sm relative flex h-10 w-10 shrink-0 items-center justify-center font-display text-lg font-semibold ${LETTER_COLORS[i]}`}
            >
              {ANSWER_LETTERS[i]}
            </span>
            <span className="relative flex-1 font-medium leading-snug text-slate-100">{answer}</span>
            {revealed && isCorrect && (
              <span className="relative text-neon-green" aria-label="Bonne réponse">
                <CheckIcon className="h-5 w-5" />
              </span>
            )}
            {revealed && isWrongPick && (
              <span className="relative text-neon-red" aria-label="Mauvaise réponse">
                <XIcon className="h-5 w-5" />
              </span>
            )}
            {distribution && (
              <span className="relative w-6 shrink-0 text-right text-sm tabular-nums text-slate-400" title="Joueurs ayant choisi cette réponse">
                {votes}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
