/** Types partagés avec les réponses de l'API. */
export interface Player {
  id: string;
  pseudo: string;
  avatar: string;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
}

export interface PublicQuestion {
  position: number;
  prompt: string;
  answers: [string, string, string, string];
  difficulty: 'easy' | 'medium' | 'hard';
  category: { slug: string; name: string; icon: string; color: string };
}

export interface SoloCreated {
  gameId: string;
  questionCount: number;
  questionDurationMs: number;
  category: string;
}

export interface SoloState {
  gameId: string;
  status: 'in_progress' | 'finished' | 'cancelled' | 'lobby';
  category: string;
  questionCount: number;
  questionDurationMs: number;
  currentPosition: number | null;
  score: number;
  correctCount: number;
  answeredCount: number;
  current: { question: PublicQuestion; remainingMs: number } | null;
}

export type SoloNext =
  | { finished: true }
  | { finished: false; question: PublicQuestion; durationMs: number; remainingMs: number; questionCount: number };

export interface SoloAnswerResult {
  position: number;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  timedOut: boolean;
  points: number;
  responseMs: number;
  totalScore: number;
  correctCount: number;
  isLastQuestion: boolean;
}

export interface SoloResults {
  gameId: string;
  category: string;
  questionCount: number;
  totalScore: number;
  correctCount: number;
  questions: Array<{
    position: number;
    prompt: string;
    category: string;
    difficulty: string;
    answers: string[];
    correctIndex: number;
    selectedIndex: number | null;
    isCorrect: boolean;
    points: number;
    responseMs: number | null;
  }>;
}

export type MultiPhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'finished' | 'cancelled';

export interface PlayerStanding {
  id: string;
  pseudo: string;
  avatar: string;
  isHost: boolean;
  score: number;
  correctCount: number;
  rank: number;
  answeredCurrent: boolean;
  lastPoints: number | null;
}

export interface MultiGameState {
  code: string;
  status: 'lobby' | 'in_progress' | 'finished' | 'cancelled';
  phase: MultiPhase;
  phaseRemainingMs: number;
  questionIndex: number;
  questionCount: number;
  questionDurationMs: number;
  revealDurationMs: number;
  category: string;
  categoryIcon: string;
  maxPlayers: number;
  hostPlayerId: string;
  isHost: boolean;
  players: PlayerStanding[];
  answeredCount: number;
  question: PublicQuestion | null;
  myAnswer: { choice: number | null; isCorrect?: boolean; points?: number } | null;
  reveal: { correctIndex: number; distribution: [number, number, number, number] } | null;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  pseudo: string;
  avatar: string;
  gamesPlayed: number;
  correctAnswers: number;
  questionsSeen: number;
  totalScore: number;
  successRate: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  soloGames: number;
  multiGames: number;
  totalScore: number;
  correctAnswers: number;
  questionsSeen: number;
  successRate: number;
  bestScore: number;
  recentGames: Array<{
    gameId: string;
    mode: 'solo' | 'multi';
    category: string | null;
    score: number;
    correctCount: number;
    questionCount: number;
    finishedAt: string;
  }>;
}

export interface GlobalStats {
  onlinePlayers: number;
  totalPlayers: number;
  finishedGames: number;
  activeMultiGames: number;
  questionCount: number;
}

export interface InstanceInfo {
  instance: string;
  hostname: string;
  pid: number;
  uptime: number;
  nodeVersion: string;
  appVersion: string;
  serverTime: string;
}
