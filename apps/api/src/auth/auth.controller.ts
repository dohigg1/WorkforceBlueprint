import { Controller, Post, Get, Body, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { getAdminPool, type Role } from '@wfb/tenancy';
import { SESSION_COOKIE, signSession } from './session.js';
import type { AuthedRequest } from './request.js';

/**
 * Development authentication. In production this is a real identity provider;
 * here a dev login resolves a workspace by slug to an owning membership and
 * mints a signed session. The tenant identity thereafter comes only from that
 * session (INV-2).
 */
@Controller('auth')
export class AuthController {
  @Post('dev-login')
  async devLogin(
    @Body() body: { workspace?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantId: string; workspaceId: string; role: Role }> {
    const slug = body.workspace ?? 'demo';
    const admin = getAdminPool();
    const { rows } = await admin.query<{
      ws: string; ten: string; uid: string; role: Role;
    }>(
      `SELECT w.id AS ws, w.tenant_id AS ten, m.user_id AS uid, m.role AS role
       FROM workspaces w
       JOIN memberships m ON m.workspace_id = w.id
       WHERE w.slug = $1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 ELSE 2 END
       LIMIT 1`,
      [slug],
    );
    const found = rows[0];
    if (!found) throw new UnauthorizedException(`No workspace or membership for '${slug}'`);

    const token = signSession({
      tenantId: found.ten, workspaceId: found.ws, userId: found.uid, role: found.role,
    });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    return { tenantId: found.ten, workspaceId: found.ws, role: found.role };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: AuthedRequest): { authenticated: boolean; role?: Role; workspaceId?: string } {
    if (!req.wfb) return { authenticated: false };
    return { authenticated: true, role: req.wfb.role, workspaceId: req.wfb.workspaceId };
  }
}
