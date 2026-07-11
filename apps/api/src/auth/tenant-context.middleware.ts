import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import { today } from '@wfb/tenancy';
import { SESSION_COOKIE, verifySession } from './session.js';
import type { AuthedRequest } from './request.js';

// The tenant context is derived here and only here, from the verified session
// cookie (INV-2), never from a path, query, body or arbitrary header.
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: AuthedRequest, _res: Response, next: NextFunction): void {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) {
      const claims = verifySession(token);
      if (claims) {
        req.wfb = {
          tenantId: claims.tenantId,
          workspaceId: claims.workspaceId,
          userId: claims.userId,
          role: claims.role,
          asAt: today(),
        };
      }
    }
    next();
  }
}
