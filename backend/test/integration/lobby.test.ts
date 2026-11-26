/**
 * Salle d'attente multijoueur : nom de partie, liste des parties ouvertes et chat.
 * Les requêtes alternent entre WEB-01 et WEB-02 (aucun état en mémoire).
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
  type TestInstance,
} from './helpers.js';

type Agent = ReturnType<typeof roundRobin>;

interface OpenGame {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  joined: boolean;
  host: { pseudo: string };
}
interface ChatMessage {
  id: number;
  kind: 'chat' | 'system';
  playerId: string | null;
  pseudo: string | null;
  text: string;
}

describe.skipIf(!dbAvailable)('salle d’attente : nom, liste des parties et chat', () => {
  let web1: TestInstance;
  let web2: TestInstance;
  let lb: Agent;

  const openGames = async (auth: string) =>
    (await lb().get('/api/games').set('Authorization', auth).expect(200)).body.games as OpenGame[];
  const state = async (code: string, auth: string, afterMessageId?: number) =>
    (
      await lb()
        .get(`/api/games/${code}`)
        .query(afterMessageId === undefined ? {} : { afterMessageId })
        .set('Authorization', auth)
        .expect(200)
    ).body as { name: string; isPublic: boolean; messages: ChatMessage[]; phase: string };

  beforeAll(async () => {
    await resetDatabase();
    web1 = createInstance('WEB-01', { MAX_PLAYERS_PER_GAME: '2' });
    web2 = createInstance('WEB-02', { MAX_PLAYERS_PER_GAME: '2' });
    lb = roundRobin([web1, web2]);
  });
  afterAll(closeAllInstances);

  it('donne un nom à la partie (ou « Partie de <pseudo> » par défaut)', async () => {
    const host = await createPlayer(web1.app, 'Nommeur');
    const named = await lb()
      .post('/api/games')
      .set('Authorization', host.auth)
      .send({ category: 'all', name: '  Les   pros du 🎮  ' })
      .expect(201);
    expect(named.body.name).toBe('Les pros du 🎮');
    expect((await state(named.body.code, host.auth)).name).toBe('Les pros du 🎮');

    const unnamed = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name: '' }).expect(201);
    expect(unnamed.body.name).toBe('Partie de Nommeur');

    for (const name of ['ab', 'x'.repeat(41), '<script>alert(1)</script>']) {
      const bad = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name }).expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('liste les salles publiques en attente, sans les privées ni celles lancées', async () => {
    const host = await createPlayer(web1.app, 'Hote');
    const guest = await createPlayer(web2.app, 'Invite');
    const viewer = await createPlayer(web1.app, 'Curieux');

    const pub = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'minecraft', name: 'Salle publique' }).expect(201);
    const priv = await lb()
      .post('/api/games')
      .set('Authorization', host.auth)
      .send({ category: 'all', name: 'Salle privée', isPublic: false })
      .expect(201);

    let list = await openGames(viewer.auth);
    const listed = list.find((g) => g.code === pub.body.code);
    expect(listed).toMatchObject({ name: 'Salle publique', playerCount: 1, maxPlayers: 2, joined: false, host: { pseudo: 'Hote' } });
    expect(list.some((g) => g.code === priv.body.code)).toBe(false);
    // La partie privée reste joignable avec son code
    expect((await state(priv.body.code, host.auth)).isPublic).toBe(false);

    // Rejoindre depuis la liste : compteur à jour, « joined » pour l'invité, salle complète toujours listée
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code: pub.body.code }).expect(200);
    list = await openGames(guest.auth);
    expect(list.find((g) => g.code === pub.body.code)).toMatchObject({ playerCount: 2, joined: true });
    const full = await lb().post('/api/games/join').set('Authorization', viewer.auth).send({ code: pub.body.code }).expect(409);
    expect(full.body.error.code).toBe('GAME_FULL');

    // Une fois lancée, la partie disparaît de la liste
    await lb().post(`/api/games/${pub.body.code}/start`).set('Authorization', host.auth).expect(200);
    list = await openGames(viewer.auth);
    expect(list.some((g) => g.code === pub.body.code)).toBe(false);
  });

  it('masque les salles dont l’organisateur est parti sans annuler', async () => {
    const host = await createPlayer(web1.app, 'Fantome');
    const viewer = await createPlayer(web2.app, 'Visiteur');
    const created = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name: 'Salle oubliée' }).expect(201);
    expect((await openGames(viewer.auth)).some((g) => g.code === created.body.code)).toBe(true);

    // L'organisateur n'interroge plus la partie depuis 2 minutes
    await web1.pool.execute(
      `UPDATE game_players gp JOIN games g ON g.id = gp.game_id
          SET gp.last_seen_at = NOW(3) - INTERVAL 2 MINUTE
        WHERE g.code = ? AND gp.player_id = ?`,
      [created.body.code, host.id],
    );
    expect((await openGames(viewer.auth)).some((g) => g.code === created.body.code)).toBe(false);

    // Il revient sur la salle : elle réapparaît
    await state(created.body.code, host.auth);
    expect((await openGames(viewer.auth)).some((g) => g.code === created.body.code)).toBe(true);
  });

  it('chat : messages partagés entre instances, annonces automatiques, chargement incrémental', async () => {
    const host = await createPlayer(web1.app, 'Chef');
    const alice = await createPlayer(web2.app, 'Alice');
    const outsider = await createPlayer(web1.app, 'Intrus');
    const { code } = (await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201)).body;

    await lb().post('/api/games/join').set('Authorization', alice.auth).send({ code }).expect(200);
    await request(web1.app).post(`/api/games/${code}/messages`).set('Authorization', host.auth).send({ text: 'Salut !' }).expect(201);
    await request(web2.app)
      .post(`/api/games/${code}/messages`)
      .set('Authorization', alice.auth)
      .send({ text: '  prête‮   à\u0007 jouer  ' })
      .expect(201);

    const all = (await state(code, host.auth)).messages;
    expect(all.map((m) => [m.kind, m.pseudo, m.text])).toEqual([
      ['system', null, 'Alice a rejoint la salle'],
      ['chat', 'Chef', 'Salut !'],
      ['chat', 'Alice', 'prête à jouer'],
    ]);
    expect(all.find((m) => m.text === 'Salut !')!.playerId).toBe(host.id);

    // Polling suivant : uniquement les nouveaux messages
    const lastId = all.at(-1)!.id;
    expect((await state(code, alice.auth, lastId)).messages).toEqual([]);
    await lb().post(`/api/games/${code}/leave`).set('Authorization', alice.auth).expect(200);
    const fresh = (await state(code, host.auth, lastId)).messages;
    expect(fresh.map((m) => m.text)).toEqual(['Alice a quitté la salle']);

    // Contrôles
    await lb().post(`/api/games/${code}/messages`).set('Authorization', outsider.auth).send({ text: 'coucou' }).expect(403);
    await lb().get(`/api/games/${code}`).set('Authorization', outsider.auth).expect(403);
    for (const text of ['   ', 'x'.repeat(201)]) {
      await lb().post(`/api/games/${code}/messages`).set('Authorization', host.auth).send({ text }).expect(400);
    }

    // Partie lancée : chat fermé et plus renvoyé dans l'état
    await lb().post(`/api/games/${code}/start`).set('Authorization', host.auth).expect(200);
    const closed = await lb().post(`/api/games/${code}/messages`).set('Authorization', host.auth).send({ text: 'trop tard' }).expect(409);
    expect(closed.body.error.code).toBe('CHAT_CLOSED');
    expect((await state(code, host.auth)).messages).toEqual([]);
  });

  it('limite le nombre de messages par joueur', async () => {
    const strict = createInstance('WEB-03', { RATE_LIMIT_CHAT_PER_MINUTE: '3' });
    const host = await createPlayer(strict.app, 'Bavard');
    const { code } = (await request(strict.app).post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201)).body;
    for (let i = 0; i < 3; i++) {
      await request(strict.app).post(`/api/games/${code}/messages`).set('Authorization', host.auth).send({ text: `msg ${i}` }).expect(201);
    }
    const limited = await request(strict.app).post(`/api/games/${code}/messages`).set('Authorization', host.auth).send({ text: 'encore' }).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
