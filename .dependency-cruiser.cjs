/** Module boundaries from ADR-0002. Paths are real paths: workspace links resolve to packages/. */
module.exports = {
  forbidden: [
    {
      name: 'no-feature-to-feature',
      comment: 'Features talk through core, contracts or events.',
      severity: 'error',
      from: { path: '^packages/features/([^/]+)/' },
      to: { path: '^packages/features/', pathNot: '^packages/features/$1/' },
    },
    {
      name: 'public-api-only',
      comment: 'Import a package through its index.ts, never its internals.',
      severity: 'error',
      from: { path: '^(packages/(?:features/[^/]+|[^/]+))/' },
      to: { path: '^packages/.+/src/', pathNot: ['^$1/', '/src/index[.]ts$'] },
    },
    {
      name: 'app-uses-public-api-only',
      severity: 'error',
      // Tailwind runs in Node and cannot load the React Native entry point of @azkaban/ui.
      from: { path: '^apps/', pathNot: 'tailwind[.]config[.]ts$' },
      to: { path: '^packages/.+/src/', pathNot: '/src/index[.]ts$' },
    },
    {
      name: 'pure-domain',
      comment: 'core and contracts stay free of React and Supabase.',
      severity: 'error',
      from: { path: '^packages/(core|contracts)/' },
      to: { path: 'node_modules/(@types/)?(react|@supabase)' },
    },
    {
      name: 'supabase-only-in-data',
      severity: 'error',
      from: { pathNot: '^packages/data/' },
      to: { path: 'node_modules/@supabase/' },
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    { name: 'not-to-unresolvable', severity: 'error', from: {}, to: { couldNotResolve: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    // Keep node_modules out of this list: the pure-domain and supabase rules need to see it.
    exclude: { path: '^apps/app/(dist|[.]expo|nativewind-env[.]d[.]ts)' },
  },
};
