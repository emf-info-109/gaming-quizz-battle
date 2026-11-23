import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

/**
 * Ajoute à CHAQUE réponse :
 *   - X-Instance-Name : nom de l'instance qui a traité la requête (WEB-01, WEB-02...)
 *   - X-Request-Id    : identifiant unique, utile pour retrouver une requête dans les logs
 * et journalise la requête une fois terminée.
 */
export function requestContext(instanceName: string, logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    req.requestId = randomUUID();
    res.setHeader('X-Instance-Name', instanceName);
    res.setHeader('X-Request-Id', req.requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const meta = {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ip: req.ip,
      };
      if (res.statusCode >= 500) logger.error('request', meta);
      else if (res.statusCode >= 400) logger.warn('request', meta);
      else logger.debug('request', meta);
    });
    next();
  };
}

/** Les réponses de l'API ne doivent jamais être mises en cache (polling, état de partie). */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
