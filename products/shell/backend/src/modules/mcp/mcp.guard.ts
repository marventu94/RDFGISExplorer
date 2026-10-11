import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Acceso al servidor MCP:
 * - sin `MCP_TOKEN` configurado, el endpoint no existe (404): se habilita a propósito;
 * - con token, exige `Authorization: Bearer <token>`;
 * - si llega un `Origin` (navegador), debe estar en `CORS_ORIGINS`. Los clientes
 *   MCP de escritorio y CLI no lo envían; la validación corta el DNS rebinding.
 */
@Injectable()
export class McpGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('MCP_TOKEN')?.trim();
    if (!token) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (origin) {
      const allowed = (this.config.get<string>('CORS_ORIGINS') ?? 'http://localhost:4200')
        .split(',')
        .map((value) => value.trim());
      if (!allowed.includes(origin)) {
        throw new ForbiddenException({ error: 'ORIGIN_NOT_ALLOWED' });
      }
    }

    const header = request.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !sameSecret(match[1].trim(), token)) {
      throw new UnauthorizedException({ error: 'INVALID_MCP_TOKEN' });
    }
    return true;
  }
}

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
