/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    // CI runs lint, test, build, typecheck and e2e in parallel on one runner, so component specs
    // run several times slower there than locally. The first test in a file also pays for
    // compiling the component, and the 5s default timed those out intermittently
    // (hostel-form.spec, review.spec) while locally they finish in under a second.
    testTimeout: 15_000,
    // One process per spec file. Analog defaults to `vmThreads`, which reuses a worker across
    // files: component specs hold on to ~30 MB a test, the heap climbed past Node's limit
    // mid-suite, the worker died, and Vitest waited on it forever, so every CI run from
    // f20b6e1 (#177) on was cancelled at six hours. `forks` starts each file clean.
    pool: 'forks',
    // The heaviest file (onboarding-wizard.spec) peaks near 2 GB; pin the heap so that holds on
    // any machine rather than only where Node's default happens to be ~4 GB.
    execArgv: ['--max-old-space-size=4096'],
    server: {
      deps: {
        // Imports named exports from the CommonJS google-libphonenumber, which Node's own ESM
        // loader refuses; inlined, Vite handles the interop as the VM pool did.
        inline: ['ngx-material-intl-tel-input'],
      },
    },
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8' as const,
    },
  },
}));
