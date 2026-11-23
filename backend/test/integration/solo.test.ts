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
} from './helpers.js';

describe.skipIf(!dbAvailable)('mode solo', () => {
  beforeAll(resetDatabase);
  afterAll(closeAllInstances);

  it('déroule une partie complète en alternant les instances (round-robin)', async () => {
    const web1 = createInstance('WEB-01');
    const web2 = createInstance('WEB-02');
    const lb = roundRobin([web1, web2]);
    const p = await createPlayer(web1.app, 'SoloStar', 'wizard');

    const created = await lb().post('/api/solo/games').set('Authorization', p.auth).send({ category: 'minecraft' }).expect(201);
    const gameId = created.body.gameId as string;
    expect(created.body.questionCount).toBe(10);

    // Résultats indisponibles avant la fin
    await lb().get(`/api/solo/games/${gameId}/results`).set('Authorization', p.auth).expect(409);

    let expectedScore = 0;
    const seenInstances = new Set<string>();
    for (let pos = 0; pos < 10; pos++) {
      const next = await lb().post(`/api/solo/games/${gameId}/next`).set('Authorization', p.auth).expect(200);
      seenInstances.add(next.headers['x-instance-name'] as string);
      expect(next.body.question.position).toBe(pos);
      expect(next.body.question.answers).toHaveLength(4);
      // La bonne réponse n'est jamais envoyée avec la question
      expect(JSON.stringify(next.body)).not.toMatch(/correct/i);

      // Rejouer /next renvoie la même question (idempotent)
      const again = await lb().post(`/api/solo/games/${gameId}/next`).set('Authorization', p.auth).expect(200);
      expect(again.body.question.prompt).toBe(next.body.question.prompt);
      seenInstances.add(again.headers['x-instance-name'] as string);

      const ans = await lb()
        .post(`/api/solo/games/${gameId}/answers`)
        .set('Authorization', p.auth)
        .send({ position: pos, choice: pos % 4 })
        .expect(201);
      seenInstances.add(ans.headers['x-instance-name'] as string);
      expect(ans.body.correctIndex).toBeGreaterThanOrEqual(0);
      if (ans.body.isCorrect) expect(ans.body.points).toBeGreaterThanOrEqual(500);
      else expect(ans.body.points).toBe(0);
      expectedScore += ans.body.points;
      expect(ans.body.totalScore).toBe(expectedScore);
      expect(ans.body.isLastQuestion).toBe(pos === 9);

      // Deuxième réponse à la même question : refusée
      await lb()
        .post(`/api/solo/games/${gameId}/answers`)
        .set('Authorization', p.auth)
        .send({ position: pos, choice: 0 })
        .expect(409);
    }
    expect(seenInstances).toEqual(new Set(['WEB-01', 'WEB-02']));

    const results = await lb().get(`/api/solo/games/${gameId}/results`).set('Authorization', p.auth).expect(200);
    expect(results.body.totalScore).toBe(expectedScore);
    expect(results.body.questions).toHaveLength(10);
    expect(results.body.questions[0]).toHaveProperty('correctIndex');

    const lbRes = await lb().get('/api/leaderboard?category=minecraft').expect(200);
    const entry = lbRes.body.entries.find((e: { playerId: string }) => e.playerId === p.id);
    expect(entry).toMatchObject({ gamesPlayed: 1, totalScore: expectedScore, questionsSeen: 10 });

    const stats = await lb().get('/api/players/me/stats').set('Authorization', p.auth).expect(200);
    expect(stats.body.stats).toMatchObject({ gamesPlayed: 1, soloGames: 1, totalScore: expectedScore });
  });

  it('une réponse après le chrono vaut 0 point (temps mesuré par le serveur)', async () => {
    const web = createInstance('WEB-FAST', { QUESTION_DURATION_MS: '1000' });
    const p = await createPlayer(web.app, 'Lent');
    const g = await request(web.app).post('/api/solo/games').set('Authorization', p.auth).send({ category: 'all' }).expect(201);
    const id = g.body.gameId;
    const q = await request(web.app).post(`/api/solo/games/${id}/next`).set('Authorization', p.auth).expect(200);
    await sleep(1_600);
    // On "triche" en envoyant toutes les réponses possibles : seule la 1re est enregistrée et elle est hors délai.
    const ans = await request(web.app)
      .post(`/api/solo/games/${id}/answers`)
      .set('Authorization', p.auth)
      .send({ position: q.body.question.position, choice: 0 })
      .expect(201);
    expect(ans.body).toMatchObject({ timedOut: true, points: 0, isCorrect: false, selectedIndex: null });
  });

  it('une question expirée sans réponse est enregistrée automatiquement', async () => {
    const web = createInstance('WEB-FAST', { QUESTION_DURATION_MS: '1000' });
    const p = await createPlayer(web.app, 'Distrait');
    const g = await request(web.app).post('/api/solo/games').set('Authorization', p.auth).send({ category: 'pokemon' }).expect(201);
    const id = g.body.gameId;
    await request(web.app).post(`/api/solo/games/${id}/next`).set('Authorization', p.auth).expect(200);
    await sleep(1_600);
    const next = await request(web.app).post(`/api/solo/games/${id}/next`).set('Authorization', p.auth).expect(200);
    expect(next.body.question.position).toBe(1);
    const state = await request(web.app).get(`/api/solo/games/${id}`).set('Authorization', p.auth).expect(200);
    expect(state.body).toMatchObject({ answeredCount: 1, score: 0, currentPosition: 1 });
    expect(state.body.current.question.position).toBe(1);
  });

  it('refuse les réponses à une autre question que la question en cours', async () => {
    const web = createInstance('WEB-01');
    const p = await createPlayer(web.app, 'Malin');
    const g = await request(web.app).post('/api/solo/games').set('Authorization', p.auth).send({ category: 'fortnite' }).expect(201);
    await request(web.app).post(`/api/solo/games/${g.body.gameId}/next`).set('Authorization', p.auth).expect(200);
    const res = await request(web.app)
      .post(`/api/solo/games/${g.body.gameId}/answers`)
      .set('Authorization', p.auth)
      .send({ position: 5, choice: 1 })
      .expect(409);
    expect(res.body.error.code).toBe('NOT_CURRENT_QUESTION');
  });

  it('un joueur ne peut pas accéder à la partie d’un autre', async () => {
    const web = createInstance('WEB-01');
    const owner = await createPlayer(web.app, 'Proprio');
    const intruder = await createPlayer(web.app, 'Intrus');
    const g = await request(web.app).post('/api/solo/games').set('Authorization', owner.auth).send({ category: 'all' }).expect(201);
    await request(web.app).get(`/api/solo/games/${g.body.gameId}`).set('Authorization', intruder.auth).expect(404);
    await request(web.app).post(`/api/solo/games/${g.body.gameId}/next`).set('Authorization', intruder.auth).expect(404);
  });

  it('refuse une catégorie inconnue', async () => {
    const web = createInstance('WEB-01');
    const p = await createPlayer(web.app, 'Curieux');
    await request(web.app).post('/api/solo/games').set('Authorization', p.auth).send({ category: 'zelda' }).expect(404);
  });
});
