import tsParser from '@typescript-eslint/parser';

// ---------------------------------------------------------------------------
// Architectural lint rules. These encode invariants as machine checks so that
// they cannot be quietly broken in feature code. Each rule names the invariant
// it protects.
// ---------------------------------------------------------------------------

function sqlText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.raw).join(' ');
  return null;
}

const wfb = {
  rules: {
    // INV-8: the language model never touches the database. No database client
    // import is permitted anywhere inside packages/ai.
    'no-db-in-ai': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename ?? context.getFilename();
        if (!/packages\/ai\//.test(file)) return {};
        return {
          ImportDeclaration(node) {
            const src = node.source.value;
            if (src === 'pg' || /(^|\/)(pool|db|database|drizzle|knex|typeorm)/i.test(String(src))) {
              context.report({ node, message: 'INV-8: packages/ai must not import a database client. Compose measures through the tool schema.' });
            }
            if (String(src).includes('@wfb/tenancy')) {
              context.report({ node, message: 'INV-8: packages/ai must not import the database pool from @wfb/tenancy.' });
            }
          },
        };
      },
    },

    // INV-6: every analytic is a measure. Aggregate SQL is forbidden outside
    // packages/measures.
    'no-aggregate-sql-outside-measures': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename ?? context.getFilename();
        if (/packages\/measures\//.test(file)) return {};
        if (/\/(test|tests)\//.test(file) || file.endsWith('.test.ts')) return {};
        function check(node) {
          const text = sqlText(node);
          if (!text) return;
          if (/\bSELECT\b/i.test(text) && /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(text)) {
            context.report({ node, message: 'INV-6: aggregate SQL is only permitted in packages/measures. Express this as a measure.' });
          }
        }
        return { Literal: check, TemplateLiteral: check };
      },
    },

    // INV-4: entity tables are never destructively updated. A raw UPDATE inside
    // a domain package is forbidden outside the supersession helper.
    'no-raw-update-outside-supersession': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename ?? context.getFilename();
        const inDomain = /packages\/(data-model|hierarchy|scenarios|costing|planning|skills)\//.test(file);
        if (!inDomain) return {};
        if (file.endsWith('supersession.ts')) return {};
        if (/\/(test|tests)\//.test(file) || file.endsWith('.test.ts')) return {};
        // Target the effective-dated ENTITY tables specifically. Updating the
        // overlay store (scenario_deltas), the closure, or the audit log is
        // legitimate and not a destructive entity mutation.
        const ENTITY = 'positions|people|occupancies|reporting_lines|locations|cost_centres|org_units|job_families|jobs|roles|skills|activities';
        const entityUpdate = new RegExp(`\\bUPDATE\\s+"?(${ENTITY})"?\\b`, 'i');
        function check(node) {
          const text = sqlText(node);
          if (!text) return;
          if (entityUpdate.test(text)) {
            context.report({ node, message: 'INV-4: no raw UPDATE on an entity table. Use the supersession helper.' });
          }
        }
        return { Literal: check, TemplateLiteral: check };
      },
    },

    // INV-2: tenant context is never user-supplied. Reading a tenant or
    // workspace identifier from the request object is forbidden outside the
    // authentication middleware.
    'no-tenant-from-request': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename ?? context.getFilename();
        if (/auth/i.test(file)) return {};
        if (/\/(test|tests)\//.test(file) || file.endsWith('.test.ts')) return {};
        return {
          MemberExpression(node) {
            // match req.<params|query|body|headers>.<...tenant|workspace...>
            const prop = node.property;
            const name = prop && (prop.name || prop.value);
            if (!name || !/tenant|workspace/i.test(String(name))) return;
            let cursor = node.object;
            let sawRequestBag = false;
            while (cursor && cursor.type === 'MemberExpression') {
              const seg = cursor.property && (cursor.property.name || cursor.property.value);
              if (seg && /^(params|query|body|headers|cookies)$/.test(String(seg))) sawRequestBag = true;
              cursor = cursor.object;
            }
            if (sawRequestBag) {
              context.report({ node, message: 'INV-2: tenant/workspace identity must come from the verified session, never from the request.' });
            }
          },
        };
      },
    },

    // INV-5: no user mutation touches the baseline directly. A controller or
    // command handler must not import a baseline repository.
    'no-baseline-repo-in-controllers': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename ?? context.getFilename();
        if (!/(controller|command|handler)/i.test(file)) return {};
        return {
          ImportDeclaration(node) {
            if (/baseline/i.test(String(node.source.value))) {
              context.report({ node, message: 'INV-5: controllers and command handlers must not import a baseline repository. Write through the scenario engine.' });
            }
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { wfb },
    rules: {
      'wfb/no-db-in-ai': 'error',
      'wfb/no-aggregate-sql-outside-measures': 'error',
      'wfb/no-raw-update-outside-supersession': 'error',
      'wfb/no-tenant-from-request': 'error',
      'wfb/no-baseline-repo-in-controllers': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
