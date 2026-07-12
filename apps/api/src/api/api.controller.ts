import { Controller, Get, Post, Param, Query, Body, Req, UnauthorizedException } from '@nestjs/common';
import { assertCapability, type TenantContext } from '@wfb/tenancy';
import type { ScopeType } from '@wfb/measures';
import { ApiService } from './api.service.js';
import type { AuthedRequest } from '../auth/request.js';

// Resolve the request's tenant context from the session (attached by the
// middleware), applying an optional as-at date. Identity always comes from the
// session; only the as-at read date may come from the query (INV-2).
function contextOf(req: AuthedRequest, asAt?: string): TenantContext {
  if (!req.wfb) throw new UnauthorizedException('Not authenticated');
  return asAt ? { ...req.wfb, asAt } : req.wfb;
}

@Controller('api')
export class ApiController {
  constructor(private readonly svc: ApiService) {}

  @Get('tree')
  tree(
    @Req() req: AuthedRequest,
    @Query('scenario') scenario?: string,
    @Query('root') root?: string,
    @Query('asAt') asAt?: string,
  ) {
    const ctx = contextOf(req, asAt);
    assertCapability(ctx.role, 'scenario:read');
    return this.svc.getTree(ctx, { scenarioId: scenario, rootId: root });
  }

  @Get('measures')
  measures(
    @Req() req: AuthedRequest,
    @Query('scenario') scenario?: string,
    @Query('scope') scope?: ScopeType,
    @Query('anchor') anchor?: string,
    @Query('asAt') asAt?: string,
  ) {
    const ctx = contextOf(req, asAt);
    assertCapability(ctx.role, 'measure:read');
    return this.svc.getMeasures(ctx, { scenarioId: scenario, scopeType: scope, anchor });
  }

  @Get('scenarios')
  scenarios(@Req() req: AuthedRequest) {
    return this.svc.listScenarios(contextOf(req));
  }

  @Post('scenarios')
  createScenario(@Req() req: AuthedRequest, @Body() body: { name: string; parent?: string }) {
    const ctx = contextOf(req);
    assertCapability(ctx.role, 'scenario:edit');
    return this.svc.createScenario(ctx, body.name, body.parent);
  }

  @Post('scenarios/:id/edit')
  edit(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { edits: { table: string; externalId: string; op: 'upsert' | 'delete'; overrides?: Record<string, unknown> }[] },
  ) {
    const ctx = contextOf(req);
    assertCapability(ctx.role, 'scenario:edit');
    return this.svc.applyEdits(ctx, id, body.edits);
  }

  @Get('scenarios/:id/compare')
  compare(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('scope') scope?: ScopeType,
    @Query('anchor') anchor?: string,
  ) {
    const ctx = contextOf(req);
    assertCapability(ctx.role, 'measure:read');
    return this.svc.compare(ctx, id, { scopeType: scope, anchor });
  }

  @Get('cost/:id/decompose')
  decompose(@Req() req: AuthedRequest, @Param('id') id: string, @Query('scenario') scenario?: string) {
    return this.svc.decompose(contextOf(req), id, scenario);
  }

  @Post('ingest/analyze')
  ingest(@Req() req: AuthedRequest, @Body() body: { csv: string }) {
    const ctx = contextOf(req);
    assertCapability(ctx.role, 'data:ingest');
    return this.svc.analyzeCsv(body.csv ?? '');
  }
}
