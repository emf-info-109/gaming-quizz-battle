import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllInstances, createInstance, createPlayer, dbAvailable, resetDatabase } from './helpers.js';

describe.skipIf(!dbAvailable)('joueurs anonymes (identification stateless)', () => {
  beforeAll(resetDatabase);
  afterAll(closeAllInstances);

  it('un joueur créé sur WEB-01 est reconnu par WEB-02', async () => {
    const web1 = createInstance('WEB-01');
    const web2 = createInstance('WEB-02');
    const p = await createPlayer(web1.app, 'NeoGamer', 'ninja');
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    const me = await request(web2.app).get('/api/players/me').set('Authorization', p.auth).expect(200);
    expect(me.body.player).toEqual({ id: p.id, pseudo: 'NeoGamer', avatar: 'ninja' });
    expect(me.headers['x-instance-name']).toBe('WEB-02');
  });

  it('le jeton n’est jamais stocké en clair', async () => {
    const web = createInstance('WEB-01');
    const p = await createPlayer(web.app, 'Secret');
    const [rows] = await web.pool.query('SELECT token_hash FROM players WHERE id = ?', [p.id]);
    const hash = (rows as Array<{ token_hash: string }>)[0]!.token_hash;
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(p.token);
  });

  it('refuse les jetons absents, mal formés ou inconnus', async () => {
    const web = createInstance('WEB-01');
    await request(web.app).get('/api/players/me').expect(401);
    await request(web.app).get('/api/players/me').set('Authorization', 'Bearer abc').expect(401);
    await request(web.app)
      .get('/api/players/me')
      .set('Authorization', `Bearer ${'A'.repeat(43)}`)
      .expect(401);
  });

  it('permet de modifier pseudo et avatar mais pas le score', async () => {
    const web = createInstance('WEB-01');
    const p = await createPlayer(web.app, 'Avant');
    const res = await request(web.app)
      .patch('/api/players/me')
      .set('Authorization', p.auth)
      .send({ pseudo: 'Après', avatar: 'unicorn' })
      .expect(200);
    expect(res.body.player).toMatchObject({ pseudo: 'Après', avatar: 'unicorn' });
    await request(web.app).patch('/api/players/me').set('Authorization', p.auth).send({ score: 1e6 }).expect(400);
  });

  it('valide les données (pseudo, avatar)', async () => {
    const web = createInstance('WEB-01');
    const bad = await request(web.app).post('/api/players').send({ pseudo: '<img src=x>', avatar: 'robot' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await request(web.app).post('/api/players').send({ pseudo: 'Correct', avatar: 'pikachu' }).expect(400);
  });

  it('limite la création de profils par IP', async () => {
    const web = createInstance('WEB-LIMIT', { RATE_LIMIT_PLAYER_CREATE_PER_15MIN: '2' });
    await createPlayer(web.app, 'Alpha');
    await createPlayer(web.app, 'Bravo');
    await request(web.app).post('/api/players').send({ pseudo: 'Charlie', avatar: 'robot' }).expect(429);
  });

  it('expose les catégories et les 140 questions', async () => {
    const web = createInstance('WEB-01');
    const res = await request(web.app).get('/api/categories').expect(200);
    expect(res.body.categories).toHaveLength(7);
    for (const c of res.body.categories) expect(c.questionCount).toBeGreaterThanOrEqual(20);
    const stats = await request(web.app).get('/api/stats').expect(200);
    expect(stats.body.questionCount).toBe(140);
    expect(stats.body.onlinePlayers).toBeGreaterThan(0);
  });
});
