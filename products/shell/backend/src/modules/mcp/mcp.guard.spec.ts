import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpGuard } from './mcp.guard';

function guard(env: Record<string, string | undefined>): McpGuard {
  return new McpGuard({ get: (key: string) => env[key] } as unknown as ConfigService);
}

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('McpGuard', () => {
  it('hides the endpoint until MCP_TOKEN is configured', () => {
    expect(() => guard({}).canActivate(context({ authorization: 'Bearer x' }))).toThrow(
      NotFoundException,
    );
    expect(() => guard({ MCP_TOKEN: '   ' }).canActivate(context({}))).toThrow(NotFoundException);
  });

  it('requires the configured bearer token', () => {
    const g = guard({ MCP_TOKEN: 'secret' });
    expect(() => g.canActivate(context({}))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context({ authorization: 'Bearer nope' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => g.canActivate(context({ authorization: 'Basic secret' }))).toThrow(
      UnauthorizedException,
    );
    expect(g.canActivate(context({ authorization: 'Bearer secret' }))).toBe(true);
  });

  it('rejects browser origins outside CORS_ORIGINS and accepts listed ones', () => {
    const g = guard({ MCP_TOKEN: 'secret', CORS_ORIGINS: 'https://rdfgis.vpn, http://localhost:4200' });
    const auth = { authorization: 'Bearer secret' };
    expect(() => g.canActivate(context({ ...auth, origin: 'https://evil.example' }))).toThrow(
      ForbiddenException,
    );
    expect(g.canActivate(context({ ...auth, origin: 'https://rdfgis.vpn' }))).toBe(true);
  });

  it('accepts CLI clients, which send no Origin', () => {
    expect(guard({ MCP_TOKEN: 'secret' }).canActivate(context({ authorization: 'Bearer secret' }))).toBe(
      true,
    );
  });
});
