import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllInstances, createInstance, dbAvailable, resetDatabase } from './helpers.js';

describe.skipIf(!dbAvailable)('health checks et identification d’instance', () => {
  beforeAll(resetDatabase);
  afterAll(closeAllInstances);

  it('GET /health renvoie UP et le nom de l’instance', async () => {
    const web = createInstance('WEB-01');
    const res = await request(web.app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'UP', instance: 'WEB-01' });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.headers['x-instance-name']).toBe('WEB-01');
  });

  it('GET /ready renvoie 200 quand MySQL répond', async () => {
    const web = createInstance('WEB-01');
    const res = await request(web.app).get('/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'READY', checks: { database: 'UP' } });
  });

  it('GET /ready renvoie 503 si MySQL est injoignable, /health reste à 200', async () => {
    const broken = createInstance('WEB-BROKEN', { DB_HOST: '127.0.0.1', DB_PORT: '1' });
    const ready = await request(broken.app).get('/ready').expect(503);
    expect(ready.body).toMatchObject({ status: 'NOT_READY', checks: { database: 'DOWN' } });
    await request(broken.app).get('/health').expect(200);
  });

  it('GET /ready renvoie 503 pendant un arrêt propre', async () => {
    const web = createInstance('WEB-02');
    web.readiness.shuttingDown = true;
    const res = await request(web.app).get('/ready').expect(503);
    expect(res.body.status).toBe('SHUTTING_DOWN');
  });

  it('chaque réponse API porte X-Instance-Name, /api/instance l’expose', async () => {
    const a = createInstance('WEB-01');
    const b = createInstance('WEB-02');
    const ra = await request(a.app).get('/api/instance').expect(200);
    const rb = await request(b.app).get('/api/categories').expect(200);
    expect(ra.body.instance).toBe('WEB-01');
    expect(ra.headers['x-instance-name']).toBe('WEB-01');
    expect(rb.headers['x-instance-name']).toBe('WEB-02');
    expect(rb.headers['cache-control']).toBe('no-store');
  });

  it('le endpoint de diagnostic est limité en débit', async () => {
    const web = createInstance('WEB-DIAG', { RATE_LIMIT_DIAG_PER_MINUTE: '3' });
    for (let i = 0; i < 3; i++) await request(web.app).get('/api/diag/ping').expect(200);
    const res = await request(web.app).get('/api/diag/ping').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('les erreurs ne divulguent ni stack trace ni détail SQL', async () => {
    const web = createInstance('WEB-01');
    const res = await request(web.app).post('/api/players').set('Content-Type', 'application/json').send('{oops').expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at |stack|sql/i);
    await request(web.app).get('/api/inexistant').expect(404);
  });

  it('CORS : aucune origine tierce autorisée par défaut', async () => {
    const web = createInstance('WEB-01');
    const res = await request(web.app).get('/api/categories').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
