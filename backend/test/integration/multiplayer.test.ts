/**
 * Tests du mode multijoueur réparti sur plusieurs instances.
 *
 * Chaque requête est envoyée alternativement à WEB-01 et WEB-02 (comme HAProxy
 * en round-robin sans sticky session). Les durées sont raccourcies pour que la
 * partie complète dure quelques secondes.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeAllInstances,
  createInstance,
  createPlayer,
  dbAvailable,
  resetDatabase,
  roundRobin,
  sleep,
  type TestInstance,
} from './helpers.js';

const FAST = {
  QUESTION_DURATION_MS: '1500',
  REVEAL_DURATION_MS: '900',
  COUNTDOWN_MS: '500',
  QUESTIONS_PER_GAME: '3',
};

type Agent = ReturnType<typeof roundRobin>;

async function waitFor(
  lb: Agent,
  code: string,
  auth: string,
  predicate: (s: Record<string, unknown>) => boolean,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await lb().get(`/api/games/${code}`).set('Authorization', auth).expect(200);
    if (predicate(res.body)) return res.body;
    await sleep(80);
  }
  throw new Error('Condition non atteinte à temps');
}

describe.skipIf(!dbAvailable)('mode multijoueur multi-instances', () => {
  let web1: TestInstance;
  let web2: TestInstance;
  let lb: Agent;

  beforeAll(async () => {
    await resetDatabase();
    web1 = createInstance('WEB-01', FAST);
    web2 = createInstance('WEB-02', FAST);
    lb = roundRobin([web1, web2]);
  });
  afterAll(closeAllInstances);

  it('déroule une partie complète avec 3 joueurs répartis sur 2 instances', async () => {
    const host = await createPlayer(web1.app, 'Organisateur', 'dragon');
    const alice = await createPlayer(web2.app, 'Alice', 'fox');
    const bob = await createPlayer(web1.app, 'Bob', 'robot');

    const created = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201);
    const code = created.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // Rejoindre (code en minuscules accepté) puis double "join" idempotent
    await lb().post('/api/games/join').set('Authorization', alice.auth).send({ code: code.toLowerCase() }).expect(200);
    await lb().post('/api/games/join').set('Authorization', bob.auth).send({ code }).expect(200);
    const again = await lb().post('/api/games/join').set('Authorization', bob.auth).send({ code }).expect(200);
    expect(again.body.alreadyJoined).toBe(true);

    // Salle d'attente identique vue depuis les deux instances
    const lobbyA = await request(web1.app).get(`/api/games/${code}`).set('Authorization', alice.auth).expect(200);
    const lobbyB = await request(web2.app).get(`/api/games/${code}`).set('Authorization', alice.auth).expect(200);
    expect(lobbyA.body.phase).toBe('lobby');
    expect(lobbyA.body.players.map((p: { pseudo: string }) => p.pseudo).sort()).toEqual(['Alice', 'Bob', 'Organisateur']);
    expect(lobbyB.body.players).toEqual(lobbyA.body.players);

    // Seul l'organisateur peut démarrer
    await lb().post(`/api/games/${code}/start`).set('Authorization', alice.auth).expect(403);
    await lb().post(`/api/games/${code}/start`).set('Authorization', host.auth).expect(200);
    await lb().post(`/api/games/${code}/start`).set('Authorization', host.auth).expect(409);

    // Impossible de rejoindre une partie commencée
    const late = await createPlayer(web2.app, 'Retardataire');
    const lateRes = await lb().post('/api/games/join').set('Authorization', late.auth).send({ code }).expect(409);
    expect(lateRes.body.error.code).toBe('GAME_ALREADY_STARTED');

    const totals = new Map<string, number>([
      [host.id, 0],
      [alice.id, 0],
      [bob.id, 0],
    ]);

    for (let q = 0; q < 3; q++) {
      const s = await waitFor(lb, code, host.auth, (st) => st.phase === 'question' && st.questionIndex === q);
      const question = s.question as { position: number; answers: string[] };
      expect(question.position).toBe(q);
      // Aucune information sur la bonne réponse pendant la question
      expect(s.reveal).toBeNull();
      expect(JSON.stringify(s)).not.toMatch(/correct_index|correctIndex/);

      // Alice répond 0, Bob répond 1 ; l'organisateur ne répond pas
      const ra = await lb().post(`/api/games/${code}/answers`).set('Authorization', alice.auth).send({ position: q, choice: 0 });
      expect(ra.status).toBe(201);
      expect(ra.body).toEqual({ accepted: true, position: q, choice: 0 });
      await lb().post(`/api/games/${code}/answers`).set('Authorization', bob.auth).send({ position: q, choice: 1 }).expect(201);

      // Pendant la question, les scores affichés n'incluent pas la question en cours
      const during = await lb().get(`/api/games/${code}`).set('Authorization', host.auth).expect(200);
      if (during.body.phase === 'question') {
        const visibleTotal = during.body.players.reduce((n: number, p: { score: number }) => n + p.score, 0);
        expect(visibleTotal).toBe([...totals.values()].reduce((a, b) => a + b, 0));
        expect(during.body.answeredCount).toBe(2);
      }

      const r = await waitFor(lb, code, alice.auth, (st) => st.phase === 'reveal' && st.questionIndex === q);
      const reveal = r.reveal as { correctIndex: number; distribution: number[] };
      expect(reveal.correctIndex).toBeGreaterThanOrEqual(0);
      expect(reveal.distribution[0]! + reveal.distribution[1]!).toBe(2);
      const myAnswer = r.myAnswer as { choice: number; isCorrect: boolean; points: number };
      expect(myAnswer.choice).toBe(0);
      expect(myAnswer.isCorrect).toBe(reveal.correctIndex === 0);

      const players = r.players as Array<{ id: string; score: number; lastPoints: number | null }>;
      for (const p of players) totals.set(p.id, p.score);
      expect(players.find((p) => p.id === host.id)!.lastPoints).toBeNull();
      // Classement trié par score décroissant
      const scores = players.map((p) => p.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }

    const final = await waitFor(lb, code, bob.auth, (st) => st.phase === 'finished');
    expect(final.status).toBe('finished');
    const finalPlayers = final.players as Array<{ id: string; score: number; rank: number }>;
    expect(finalPlayers).toHaveLength(3);
    expect(finalPlayers[0]!.rank).toBe(1);

    // Les scores persistés (game_players) correspondent aux scores calculés depuis les réponses
    const [rows] = await web2.pool.query(
      'SELECT gp.player_id, gp.score FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE g.code = ?',
      [code],
    );
    for (const row of rows as Array<{ player_id: string; score: number }>) {
      expect(row.score).toBe(finalPlayers.find((p) => p.id === row.player_id)!.score);
    }

    // Les réponses hors délai sont refusées
    const closed = await lb().post(`/api/games/${code}/answers`).set('Authorization', host.auth).send({ position: 2, choice: 0 });
    expect(closed.status).toBe(409);

    // La partie compte dans le classement général
    const board = await lb().get('/api/leaderboard').expect(200);
    const ids = board.body.entries.map((e: { playerId: string }) => e.playerId);
    expect(ids).toEqual(expect.arrayContaining([host.id, alice.id, bob.id]));
  }, 30_000);

  it('une réponse envoyée 6 fois en parallèle sur 2 instances n’est comptée qu’une fois', async () => {
    const host = await createPlayer(web1.app, 'Hôte');
    const spammer = await createPlayer(web2.app, 'Spammeur');
    const { body } = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'pokemon' }).expect(201);
    await lb().post('/api/games/join').set('Authorization', spammer.auth).send({ code: body.code }).expect(200);
    await lb().post(`/api/games/${body.code}/start`).set('Authorization', host.auth).expect(200);
    await waitFor(lb, body.code, spammer.auth, (st) => st.phase === 'question' && st.questionIndex === 0);

    const results = await Promise.all(
      [0, 1, 2, 3, 0, 1].map((choice) =>
        lb().post(`/api/games/${body.code}/answers`).set('Authorization', spammer.auth).send({ position: 0, choice }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);

    const [rows] = await web1.pool.query(
      `SELECT COUNT(*) AS n FROM answers a JOIN games g ON g.id = a.game_id WHERE g.code = ? AND a.player_id = ?`,
      [body.code, spammer.id],
    );
    expect(Number((rows as Array<{ n: number }>)[0]!.n)).toBe(1);
  }, 20_000);

  it('respecte la limite de participants même avec des arrivées simultanées', async () => {
    const small1 = createInstance('WEB-01', { ...FAST, MAX_PLAYERS_PER_GAME: '3' });
    const small2 = createInstance('WEB-02', { ...FAST, MAX_PLAYERS_PER_GAME: '3' });
    const slb = roundRobin([small1, small2]);
    const host = await createPlayer(small1.app, 'Chef');
    const { body } = await slb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201);

    const players = await Promise.all(
      ['Joueur1', 'Joueur2', 'Joueur3', 'Joueur4', 'Joueur5', 'Joueur6'].map((name) => createPlayer(small2.app, name)),
    );
    const results = await Promise.all(
      players.map((p) => slb().post('/api/games/join').set('Authorization', p.auth).send({ code: body.code })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(4);
    expect(rejected[0]!.body.error.code).toBe('GAME_FULL');
  });

  it('survit au redémarrage d’une instance en pleine partie (aucun état en mémoire)', async () => {
    const a = createInstance('WEB-01', FAST);
    const host = await createPlayer(a.app, 'Résilient');
    const { body } = await request(a.app).post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201);
    await request(a.app).post(`/api/games/${body.code}/start`).set('Authorization', host.auth).expect(200);

    // "Arrêt" de WEB-01 : on ferme son pool et on l'oublie complètement
    await a.close();

    // Une instance toute neuve reprend la partie là où elle en est
    const fresh = createInstance('WEB-03', FAST);
    const freshLb = roundRobin([fresh]);
    const s = await waitFor(freshLb, body.code, host.auth, (st) => st.phase === 'question');
    await request(fresh.app)
      .post(`/api/games/${body.code}/answers`)
      .set('Authorization', host.auth)
      .send({ position: s.questionIndex, choice: 2 })
      .expect(201);
    const r = await waitFor(freshLb, body.code, host.auth, (st) => st.phase === 'reveal');
    expect((r.myAnswer as { choice: number }).choice).toBe(2);
  }, 20_000);

  it('l’organisateur qui quitte la salle d’attente annule la partie', async () => {
    const host = await createPlayer(web1.app, 'Partant');
    const guest = await createPlayer(web2.app, 'Invité');
    const { body } = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201);
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code: body.code }).expect(200);
    await lb().post(`/api/games/${body.code}/leave`).set('Authorization', host.auth).expect(200);
    const s = await lb().get(`/api/games/${body.code}`).set('Authorization', guest.auth).expect(200);
    expect(s.body.phase).toBe('cancelled');
  });

  it('un non-participant ne peut pas lire l’état d’une partie', async () => {
    const host = await createPlayer(web1.app, 'Discret');
    const spy = await createPlayer(web2.app, 'Espion');
    const { body } = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201);
    const res = await lb().get(`/api/games/${body.code}`).set('Authorization', spy.auth).expect(403);
    expect(res.body.error.code).toBe('NOT_IN_GAME');
    await lb().get('/api/games/ZZZZZZ').set('Authorization', spy.auth).expect(404);
  });
});
