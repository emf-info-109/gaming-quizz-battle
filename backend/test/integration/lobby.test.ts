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

  /** Simule un joueur silencieux depuis `seconds` secondes. */
  const backdate = async (code: string, playerId: string, seconds: number) => {
    await web1.pool.execute(
      `UPDATE game_players gp JOIN games g ON g.id = gp.game_id
          SET gp.last_seen_at = NOW(3) - INTERVAL ? SECOND
        WHERE g.code = ? AND gp.player_id = ?`,
      [seconds, code, playerId],
    );
  };
  const secondsSinceSeen = async (code: string, playerId: string) => {
    const [rows] = await web1.pool.execute<import('mysql2').RowDataPacket[]>(
      `SELECT TIMESTAMPDIFF(MICROSECOND, gp.last_seen_at, NOW(3)) / 1e6 AS s
         FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE g.code = ? AND gp.player_id = ?`,
      [code, playerId],
    );
    return Number(rows[0]!.s);
  };

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
    const privHost = await createPlayer(web2.app, 'Discret');
    const guest = await createPlayer(web2.app, 'Invite');
    const viewer = await createPlayer(web1.app, 'Curieux');

    const pub = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'minecraft', name: 'Salle publique' }).expect(201);
    const priv = await lb()
      .post('/api/games')
      .set('Authorization', privHost.auth)
      .send({ category: 'all', name: 'Salle privée', isPublic: false })
      .expect(201);

    let list = await openGames(viewer.auth);
    const listed = list.find((g) => g.code === pub.body.code);
    expect(listed).toMatchObject({ name: 'Salle publique', playerCount: 1, maxPlayers: 2, joined: false, host: { pseudo: 'Hote' } });
    expect(list.some((g) => g.code === priv.body.code)).toBe(false);
    // La partie privée reste joignable avec son code
    expect((await state(priv.body.code, privHost.auth)).isPublic).toBe(false);

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

  it('annule la partie si l’organisateur disparaît sans annuler (onglet fermé)', async () => {
    const host = await createPlayer(web1.app, 'Fantome');
    const guest = await createPlayer(web2.app, 'Patient');
    const late = await createPlayer(web1.app, 'Retard');
    const created = await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name: 'Salle oubliée' }).expect(201);
    const code = created.body.code as string;
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code }).expect(200);
    expect((await openGames(late.auth)).some((g) => g.code === code)).toBe(true);

    // L'organisateur n'interroge plus la partie depuis 2 minutes
    await backdate(code, host.id, 120);
    expect((await openGames(late.auth)).some((g) => g.code === code)).toBe(false);
    expect((await state(code, guest.auth)).phase).toBe('cancelled');
    const refused = await lb().post('/api/games/join').set('Authorization', late.auth).send({ code }).expect(409);
    expect(refused.body.error.code).toBe('GAME_CANCELLED');
    // Même s'il revient, la partie reste annulée
    expect((await state(code, host.auth)).phase).toBe('cancelled');
  });

  it('« away » à la fermeture de l’onglet : 10 s pour revenir (un rechargement n’annule rien)', async () => {
    const host = await createPlayer(web1.app, 'Recharge');
    const guest = await createPlayer(web2.app, 'Temoin');
    const { code } = (await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201)).body;
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code }).expect(200);

    await lb().post(`/api/games/${code}/away`).set('Authorization', host.auth).expect(200);
    const away = await secondsSinceSeen(code, host.id);
    expect(away).toBeGreaterThanOrEqual(79);
    expect(away).toBeLessThan(85);
    // Toujours dans le délai de grâce : la partie n'est pas annulée
    expect((await state(code, guest.auth)).phase).toBe('lobby');

    // Rechargement de la page : la requête suivante le rend présent
    await state(code, host.auth);
    expect(await secondsSinceSeen(code, host.id)).toBeLessThan(5);

    // Onglet fermé pour de bon : le délai de grâce passe
    await lb().post(`/api/games/${code}/away`).set('Authorization', host.auth).expect(200);
    await backdate(code, host.id, 91);
    expect((await state(code, guest.auth)).phase).toBe('cancelled');
  });

  it('un joueur n’est que dans une salle à la fois', async () => {
    const host = await createPlayer(web1.app, 'Multi');
    const other = await createPlayer(web2.app, 'Autre');
    const guest = await createPlayer(web1.app, 'Volage');

    const a = (await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name: 'Salle A' }).expect(201)).body;
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code: a.code }).expect(200);

    // L'organisateur crée une 2e partie : la première est annulée pour tout le monde
    const b = (await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all', name: 'Salle B' }).expect(201)).body;
    expect((await state(a.code, guest.auth)).phase).toBe('cancelled');
    expect((await openGames(other.auth)).map((g) => g.code)).not.toContain(a.code);
    expect((await state(b.code, host.auth)).phase).toBe('lobby');

    // Un joueur qui rejoint une autre salle quitte la précédente (avec une annonce)
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code: b.code }).expect(200);
    const c = (await lb().post('/api/games').set('Authorization', other.auth).send({ category: 'all', name: 'Salle C' }).expect(201)).body;
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code: c.code }).expect(200);
    const inB = await lb().get(`/api/games/${b.code}`).set('Authorization', host.auth).expect(200);
    expect(inB.body.players.map((p: { pseudo: string }) => p.pseudo)).toEqual(['Multi']);
    expect(inB.body.messages.at(-1).text).toBe('Volage a quitté la salle');
    await lb().get(`/api/games/${b.code}`).set('Authorization', guest.auth).expect(403);

    // L'organisateur qui rejoint la partie d'un autre annule la sienne
    // (les salles de ce fichier sont limitées à 2 joueurs : on libère une place)
    await lb().post(`/api/games/${c.code}/leave`).set('Authorization', guest.auth).expect(200);
    await lb().post('/api/games/join').set('Authorization', host.auth).send({ code: c.code }).expect(200);
    expect((await state(b.code, host.auth)).phase).toBe('cancelled');
  });

  it('retire de la salle un joueur qui ne donne plus signe de vie', async () => {
    const host = await createPlayer(web1.app, 'Gardien');
    const guest = await createPlayer(web2.app, 'Disparu');
    const { code } = (await lb().post('/api/games').set('Authorization', host.auth).send({ category: 'all' }).expect(201)).body;
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code }).expect(200);

    await backdate(code, guest.id, 120);
    const s = await lb().get(`/api/games/${code}`).set('Authorization', host.auth).expect(200);
    expect(s.body.players.map((p: { pseudo: string }) => p.pseudo)).toEqual(['Gardien']);
    expect(s.body.messages.at(-1).text).toBe('Disparu a quitté la salle');
    // Il peut revenir tant que la partie n'a pas commencé
    await lb().post('/api/games/join').set('Authorization', guest.auth).send({ code }).expect(200);
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
