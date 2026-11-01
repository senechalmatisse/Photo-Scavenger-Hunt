import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../../application/ports';
import { DomainError, DomainErrorKind } from '../../domain/domain-error';

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, number>> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

export interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly requestId?: string;
}

/**
 * Traduit les erreurs en réponses HTTP homogènes `{ statusCode, code, message, details }`.
 * Les erreurs métier gardent leur code stable ; les erreurs inattendues sont journalisées
 * et ne divulguent aucun détail technique au client.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.header('x-request-id');
    const body = this.toBody(exception, request);
    response.status(body.statusCode).json({ ...body, requestId });
  }

  private toBody(exception: unknown, request: Request): ErrorBody {
    if (exception instanceof DomainError) {
      return { statusCode: STATUS_BY_KIND[exception.kind], code: exception.code, message: exception.message, details: exception.details };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse() as string | { message?: string | string[] };
      const message = typeof payload === 'string' ? payload : payload.message;
      return {
        statusCode: status,
        code: status === HttpStatus.BAD_REQUEST ? 'INVALID_REQUEST' : HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? 'Requête invalide.' : (message ?? exception.message),
        details: Array.isArray(message) ? { errors: message } : undefined,
      };
    }
    this.logger.error('Erreur inattendue', {
      method: request.method,
      path: request.originalUrl,
      error: exception instanceof Error ? exception.stack : String(exception),
    });
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue.' };
  }
}
