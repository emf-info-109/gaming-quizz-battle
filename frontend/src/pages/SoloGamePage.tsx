import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnswerGrid } from '../components/AnswerGrid';
import { CategoryLogo } from '../components/CategoryLogo';
import { Button, LinkButton } from '../components/Button';
import { Alert, Spinner } from '../components/Feedback';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ClockIcon, XIcon } from '../components/Icons';
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
        <span className="tabular-nums text-slate-400">
          Question <span className="font-medium text-white">{position + 1}</span>/{questionCount}
        </span>
        <span className="font-display text-lg font-semibold tabular-nums text-white">{formatNumber(score)} pts</span>
      </div>
      <div className="mb-6 flex gap-1" aria-hidden="true">
        {Array.from({ length: questionCount }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < position ? 'bg-slate-500' : i === position ? 'bg-neon-cyan' : 'bg-ink-700'}`} />
        ))}
      </div>

      <div key={position} className="card animate-pop p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <CategoryLogo slug={question.category.slug} name={question.category.name} size="xs" /> {question.category.name}
          </span>
          <span aria-hidden="true">·</span>
          <span>{difficultyLabel[question.difficulty]}</span>
        </div>
        <h2 className="mb-6 text-2xl font-semibold leading-tight text-white sm:text-3xl">{question.prompt}</h2>

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
                  Voir les résultats
                </Button>
              ) : (
                <Button size="lg" onClick={() => void loadNext()} autoFocus>
                  Question suivante <ArrowRightIcon />
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
      <div className="mb-5 flex animate-pop items-center justify-between rounded-lg border border-neon-green/30 bg-neon-green/[0.08] px-4 py-3">
        <span className="flex items-center gap-2 font-medium text-neon-green">
          <CheckIcon /> Bonne réponse
        </span>
        <span className="font-display text-xl font-semibold tabular-nums text-neon-green">+{result.points} pts</span>
      </div>
    );
  return (
    <div className="mb-5 flex animate-pop items-center justify-between gap-3 rounded-lg border border-neon-red/30 bg-neon-red/[0.08] px-4 py-3">
      <span className="flex items-center gap-2 font-medium text-neon-red">
        {result.timedOut ? <ClockIcon /> : <XIcon />}
        {result.timedOut ? 'Temps écoulé' : 'Raté'}
      </span>
      <span className="text-sm text-red-200">Bonne réponse : {ANSWER_LETTERS[result.correctIndex]}</span>
    </div>
  );
}

function SoloResultsView({ results }: { results: SoloResults }) {
  const ratio = results.questionCount > 0 ? results.correctCount / results.questionCount : 0;
  const title = ratio >= 0.9 ? 'Légendaire' : ratio >= 0.7 ? 'Excellent' : ratio >= 0.5 ? 'Bien joué' : 'Continue à t’entraîner';
  return (
    <div className="mx-auto max-w-3xl">
      <div className="card mb-8 animate-fade-up p-6 text-center sm:p-10">
        <p className="text-sm text-slate-400">{results.category}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold uppercase text-white sm:text-5xl">{title}</h1>
        <p className="mt-6 font-display text-7xl font-semibold leading-none tabular-nums text-neon-cyan">{formatNumber(results.totalScore)}</p>
        <p className="mt-2 text-slate-400">points</p>
        <p className="mt-4 text-lg text-slate-300">
          <strong className="font-semibold tabular-nums text-white">{results.correctCount}</strong>/{results.questionCount} bonnes réponses
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/solo" size="lg">Rejouer</LinkButton>
          <LinkButton to="/leaderboard" variant="secondary" size="lg">Classement</LinkButton>
        </div>
      </div>

      <h2 className="mb-4 font-display text-2xl font-semibold text-white">Correction</h2>
      <ol className="space-y-3">
        {results.questions.map((q) => (
          <li key={q.position} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-100">
                <span className="mr-2 tabular-nums text-slate-500">{q.position + 1}.</span>
                {q.prompt}
              </p>
              <span className={`shrink-0 font-display text-base font-semibold tabular-nums ${q.isCorrect ? 'text-neon-green' : 'text-slate-500'}`}>
                {q.isCorrect ? `+${q.points}` : '0'}
              </span>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-neon-green">
                <CheckIcon /> {q.answers[q.correctIndex]}
              </span>
              {!q.isCorrect && (
                <span className="inline-flex items-center gap-1.5 text-red-300">
                  {q.selectedIndex === null ? <ClockIcon /> : <XIcon />}
                  {q.selectedIndex === null ? 'Pas de réponse' : q.answers[q.selectedIndex]}
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-sm">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-white">
          <ArrowLeftIcon /> Retour à l’accueil
        </Link>
      </p>
    </div>
  );
}
