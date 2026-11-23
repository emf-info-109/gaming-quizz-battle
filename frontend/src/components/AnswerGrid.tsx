import { ANSWER_LETTERS } from '../lib/format';

const TILE_COLORS = [
  'from-neon-blue/25 to-neon-blue/5 border-neon-blue/50 hover:border-neon-blue',
  'from-neon-violet/25 to-neon-violet/5 border-neon-violet/50 hover:border-neon-violet',
  'from-neon-cyan/25 to-neon-cyan/5 border-neon-cyan/50 hover:border-neon-cyan',
  'from-neon-pink/25 to-neon-pink/5 border-neon-pink/50 hover:border-neon-pink',
];
const LETTER_COLORS = ['bg-neon-blue', 'bg-neon-violet', 'bg-neon-cyan text-ink-950', 'bg-neon-pink'];

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
        let state = `bg-gradient-to-br ${TILE_COLORS[i]}`;
        if (revealed) {
          if (isCorrect) state = 'border-neon-green bg-neon-green/15 shadow-[0_0_24px_-6px] shadow-neon-green';
          else if (isWrongPick) state = 'border-neon-red bg-neon-red/15';
          else state = 'border-white/5 bg-ink-800/60 opacity-60';
        } else if (isSelected) {
          state = 'border-neon-cyan bg-neon-cyan/15 ring-2 ring-neon-cyan/60';
        } else if (selected !== null) {
          state = 'border-white/5 bg-ink-800/60 opacity-50';
        }
        const votes = distribution?.[i] ?? 0;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || revealed || !onSelect}
            onClick={() => onSelect?.(i)}
            className={`group relative flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-3 text-left transition duration-200 enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:cursor-default ${state}`}
          >
            {distribution && totalVotes > 0 && (
              <span
                className="absolute inset-y-0 left-0 bg-white/5 transition-[width] duration-700"
                style={{ width: `${(votes / totalVotes) * 100}%` }}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white ${LETTER_COLORS[i]}`}
            >
              {ANSWER_LETTERS[i]}
            </span>
            <span className="relative flex-1 font-medium leading-snug">{answer}</span>
            {revealed && isCorrect && <span className="relative text-xl" aria-label="Bonne réponse">✅</span>}
            {revealed && isWrongPick && <span className="relative text-xl" aria-label="Mauvaise réponse">❌</span>}
            {distribution && (
              <span className="relative ml-1 rounded-md bg-black/30 px-2 py-0.5 text-xs tabular-nums text-slate-300">
                {votes}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
