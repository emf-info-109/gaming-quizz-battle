import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnswerGrid } from '../components/AnswerGrid';
import { CategoryLogo } from '../components/CategoryLogo';
import { Button, LinkButton } from '../components/Button';
import { Alert, Spinner } from '../components/Feedback';
import { TimerBar } from '../components/TimerBar';
import { useCountdown } from '../hooks/useCountdown';
import { api, ApiError, errorMessage } from '../lib/api';
import { ANSWER_LETTERS, difficultyLabel, formatNumber } from '../lib/format';
import type { PublicQuestion, SoloAnswerResult, SoloResults } from '../lib/types';

type View =
  | { kind: 'loading' }
  | { kind: 'question'; question: PublicQuestion; remainingMs: number; durationMs: number; syncKey: number }
  | { kind: 'feedback'; question: PublicQuestion; result: SoloAnswerResult }
  | { kind: 'results'; results: SoloResults }
  | { kind: 'error'; message: string };

export function SoloGamePage() {
  const { gameId = '' } = useParams();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [questionCount, setQuestionCount] = useState(10);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const submitting = useRef(false);

  const showResults = useCallback(async () => {
    const results = await api.soloResults(gameId);
    setScore(results.totalScore);
    setView({ kind: 'results', results });
  }, [gameId]);

  const loadNext = useCallback(async () => {
    setView({ kind: 'loading' });
    setSelected(null);
    try {
      const next = await api.soloNext(gameId);
      if (next.finished) return showResults();
      setQuestionCount(next.questionCount);
      setView({ kind: 'question', question: next.question, remainingMs: next.remainingMs, durationMs: next.durationMs, syncKey: Date.now() });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'GAME_FINISHED') return showResults().catch((e) => setView({ kind: 'error', message: errorMessage(e) }));
      setView({ kind: 'error', message: errorMessage(err) });
    }
  }, [gameId, showResults]);

  // Reprise après rafraîchissement : on demande d'abord l'état au serveur.
  useEffect(() => {
    let cancelled = false;
    api
      .soloState(gameId)
      .then(async (state) => {
        if (cancelled) return;
        setQuestionCount(state.questionCount);
        setScore(state.score);
        if (state.status === 'finished') return showResults();
        if (state.current) {
          setView({
            kind: 'question',
            question: state.current.question,
            remainingMs: state.current.remainingMs,
            durationMs: state.questionDurationMs,
            syncKey: Date.now(),
          });
        } else {
          await loadNext();
        }
      })
      .catch((err) => !cancelled && setView({ kind: 'error', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [gameId, loadNext, showResults]);

  const submit = useCallback(
    async (choice: number | null) => {
      if (view.kind !== 'question' || submitting.current) return;
      submitting.current = true;
      setSelected(choice);
      try {
        const result = await api.soloAnswer(gameId, view.question.position, choice);
        setScore(result.totalScore);
        setView({ kind: 'feedback', question: view.question, result });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ALREADY_ANSWERED') await loadNext();
        else setView({ kind: 'error', message: errorMessage(err) });
      } finally {
        submitting.current = false;
      }
    },
    [gameId, view, loadNext],
  );

  const left = useCountdown(
    view.kind === 'question' ? view.remainingMs : 0,
    view.kind === 'question' ? view.syncKey : null,
    view.kind === 'question',
  );

  // Temps écoulé : on le signale au serveur, qui renvoie la correction.
  useEffect(() => {
    if (view.kind === 'question' && left <= 0 && selected === null) void submit(null);
  }, [left, view.kind, selected, submit]);

  // Raccourcis clavier : 1-4 ou A-D pour répondre, Entrée pour continuer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view.kind === 'question' && selected === null) {
        const idx = ['1', '2', '3', '4'].indexOf(e.key) >= 0 ? ['1', '2', '3', '4'].indexOf(e.key) : ANSWER_LETTERS.indexOf(e.key.toUpperCase() as 'A');
        if (idx >= 0) void submit(idx);
      } else if (view.kind === 'feedback' && e.key === 'Enter') {
        if (view.result.isLastQuestion) void showResults();
        else void loadNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, selected, submit, loadNext, showResults]);

  if (view.kind === 'loading') return <Spinner />;
  if (view.kind === 'error')
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <Alert>{view.message}</Alert>
        <LinkButton to="/solo" variant="secondary">Nouvelle partie</LinkButton>
      </div>
    );
  if (view.kind === 'results') return <SoloResultsView results={view.results} />;

  const question = view.question;
  const position = question.position;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span className="font-display uppercase tracking-wider text-slate-400 sm:tracking-widest">
          Question <span className="text-white">{position + 1}</span>/{questionCount}
        </span>
        <span className="font-display font-bold tabular-nums text-neon-cyan">{formatNumber(score)} pts</span>
      </div>
      <div className="mb-6 flex gap-1" aria-hidden="true">
        {Array.from({ length: questionCount }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < position ? 'bg-neon-blue' : i === position ? 'bg-neon-cyan' : 'bg-ink-700'}`} />
        ))}
      </div>

      <div key={position} className="card animate-pop p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md py-0.5 pl-0.5 pr-2 font-semibold" style={{ background: `${question.category.color}22`, color: question.category.color }}>
            <CategoryLogo slug={question.category.slug} name={question.category.name} size="xs" /> {question.category.name}
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">{difficultyLabel[question.difficulty]}</span>
        </div>
        <h2 className="mb-6 text-xl font-bold leading-snug sm:text-2xl">{question.prompt}</h2>

        {view.kind === 'question' ? (
          <>
            <div className="mb-6">
              <TimerBar remainingMs={left} totalMs={view.durationMs} />
            </div>
            <AnswerGrid answers={question.answers} onSelect={(i) => void submit(i)} selected={selected} disabled={selected !== null} />
          </>
        ) : (
          <>
            <FeedbackBanner result={view.result} />
            <AnswerGrid answers={question.answers} selected={view.result.selectedIndex} correctIndex={view.result.correctIndex} />
            <div className="mt-6 flex justify-end [&>button]:w-full sm:[&>button]:w-auto">
              {view.result.isLastQuestion ? (
                <Button size="lg" onClick={() => void showResults()} autoFocus>
                  Voir les résultats 🏁
                </Button>
              ) : (
                <Button size="lg" onClick={() => void loadNext()} autoFocus>
                  Question suivante →
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeedbackBanner({ result }: { result: SoloAnswerResult }) {
  if (result.isCorrect)
    return (
      <div className="mb-5 flex animate-pop items-center justify-between rounded-md border border-neon-green/40 bg-neon-green/10 px-4 py-3">
        <span className="font-display font-bold uppercase text-neon-green">✓ Bonne réponse !</span>
        <span className="font-display font-bold text-neon-green">+{result.points} pts</span>
      </div>
    );
  return (
    <div className="mb-5 flex animate-pop items-center justify-between rounded-md border border-neon-red/40 bg-neon-red/10 px-4 py-3">
      <span className="font-display font-bold uppercase text-neon-red">{result.timedOut ? '⏱ Temps écoulé' : '✗ Raté'}</span>
      <span className="text-sm text-red-200">Bonne réponse : {ANSWER_LETTERS[result.correctIndex]}</span>
    </div>
  );
}

function SoloResultsView({ results }: { results: SoloResults }) {
  const ratio = results.questionCount > 0 ? results.correctCount / results.questionCount : 0;
  const title = ratio >= 0.9 ? 'Légendaire !' : ratio >= 0.7 ? 'Excellent !' : ratio >= 0.5 ? 'Bien joué !' : 'Continue à t’entraîner !';
  return (
    <div className="mx-auto max-w-3xl">
      <div className="card relative mb-6 animate-pop overflow-hidden p-6 text-center sm:p-10">
        <span className="absolute inset-0 bg-gradient-to-br from-neon-blue/20 via-transparent to-neon-violet/20" aria-hidden="true" />
        <p className="relative font-display text-xs uppercase tracking-[0.3em] text-neon-cyan">{results.category}</p>
        <h1 className="relative mt-2 font-display text-3xl font-black sm:text-4xl">{title}</h1>
        <p className="relative mt-4 font-display text-5xl font-black text-gradient sm:text-6xl">{formatNumber(results.totalScore)}</p>
        <p className="relative mt-1 text-slate-400">points</p>
        <p className="relative mt-4 text-lg">
          <strong className="text-neon-green">{results.correctCount}</strong> / {results.questionCount} bonnes réponses
        </p>
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/solo" size="lg">Rejouer</LinkButton>
          <LinkButton to="/leaderboard" variant="secondary" size="lg">Classement</LinkButton>
        </div>
      </div>

      <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide">Correction</h2>
      <ol className="space-y-3">
        {results.questions.map((q) => (
          <li key={q.position} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                <span className="mr-2 text-slate-500">{q.position + 1}.</span>
                {q.prompt}
              </p>
              <span className={`shrink-0 font-display text-sm font-bold ${q.isCorrect ? 'text-neon-green' : 'text-neon-red'}`}>
                {q.isCorrect ? `+${q.points}` : '0'}
              </span>
            </div>
            <p className="mt-2 text-sm">
              <span className="text-neon-green">✓ {q.answers[q.correctIndex]}</span>
              {!q.isCorrect && (
                <span className="ml-3 text-red-300">
                  {q.selectedIndex === null ? '⏱ pas de réponse' : `✗ ${q.answers[q.selectedIndex]}`}
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-sm">
        <Link to="/" className="text-slate-400 hover:text-neon-cyan">← Retour à l’accueil</Link>
      </p>
    </div>
  );
}
