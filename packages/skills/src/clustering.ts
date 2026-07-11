/**
 * AI-assisted clustering of positions into candidate roles (E11-02). This
 * proposes; it never applies. Clustering must always be reviewable and never
 * applied automatically, because a role architecture is a judgement a consultant
 * owns. The heuristic groups by grade and the significant tokens of the title;
 * a production deployment may substitute an embedding-based clusterer whose
 * output flows through the same review step.
 */

export interface PositionForClustering {
  externalId: string;
  title: string;
  grade: string | null;
}

export interface RoleProposal {
  roleKey: string;
  suggestedName: string;
  grade: string | null;
  memberExternalIds: string[];
  size: number;
  /** Confidence in the cluster cohesion, 0..1. Always overridable by review. */
  confidence: number;
}

// Tokens that describe a team or an index rather than the nature of the role.
const NOISE = new Set(['alpha', 'bravo', 'core', 'edge', 'north', 'south', 'team', 'the', 'of', 'and']);

function significantTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE.has(t) && !/^\d+$/.test(t));
}

export function proposeRoles(positions: PositionForClustering[]): RoleProposal[] {
  const groups = new Map<string, { name: string[]; grade: string | null; members: string[] }>();
  for (const p of positions) {
    const tokens = significantTokens(p.title).slice(0, 3);
    const key = `${p.grade ?? 'NA'}|${tokens.join(' ')}`;
    const g = groups.get(key) ?? { name: tokens, grade: p.grade, members: [] };
    g.members.push(p.externalId);
    groups.set(key, g);
  }

  const proposals: RoleProposal[] = [];
  for (const [key, g] of groups) {
    if (g.members.length < 2) continue; // singletons are not a role cluster
    const slug = key.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
    proposals.push({
      roleKey: `ROLE-${slug}`,
      suggestedName: titleCase(g.name.join(' ')) + (g.grade ? ` (${g.grade})` : ''),
      grade: g.grade,
      memberExternalIds: g.members.slice().sort(),
      size: g.members.length,
      confidence: Math.min(0.98, 0.6 + 0.4 * Math.min(1, g.members.length / 8)),
    });
  }
  return proposals.sort((a, b) => b.size - a.size);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
