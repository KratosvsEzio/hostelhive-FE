import nx from '@nx/eslint-plugin';
import baseConfig from '../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'hh',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          // 'attribute' covers the host-element atoms (button[hh-button], [hh-chip]);
          // 'element' covers the standalone components (hh-badge, hh-card, …).
          type: ['element', 'attribute'],
          prefix: 'hh',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
