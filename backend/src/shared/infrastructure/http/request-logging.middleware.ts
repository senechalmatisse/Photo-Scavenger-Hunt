import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from '../../application/ports';

/**
 * Identifiant de corrélation (`x-request-id`, repris s'il est fourni par Traefik) et journal d'accès :
 * méthode, chemin, statut, durée. Le corps des requêtes n'est jamais journalisé.
 */
export function requestLogging(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = request.header('x-request-id') || randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    const started = performance.now();
    response.on('finish', () => {
      if (request.path.endsWith('/health')) {
        return;
      }
      logger.info('Requête HTTP', {
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
