const { join } = require('path');
const preset = require('../../lib/tailwind-preset.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  // Globs are anchored to this config's dir so they resolve regardless of build CWD.
  content: [
    join(__dirname, 'src/**/*.{html,ts}'),
    join(__dirname, '../../lib/src/**/*.{html,ts}'),
  ],
};
