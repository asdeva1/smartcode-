import type { Config } from 'tailwindcss';

// Tailwind is used sparingly (layout utilities: flex/grid/spacing) -
// component styling itself goes through the MUI theme built from
// @smartcode/ui's design tokens, so the two never disagree on color.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  corePlugins: {
    preflight: false, // MUI provides its own CSS baseline
  },
  plugins: [],
};
export default config;
