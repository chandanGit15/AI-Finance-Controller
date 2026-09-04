/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dce7ff',
          200: '#bdd2ff',
          300: '#92b2fb',
          400: '#648cf5',
          500: '#3f66ee',
          600: '#2b4de0',
          700: '#243ec4',
          800: '#20339c',
          900: '#1d2f7c',
        },
        navy: {
          950: '#081426',
          900: '#0c1d38',
          800: '#122844',
          700: '#1a3354',
          600: '#23406a',
          500: '#2d4f80',
          100: '#d6e2f2',
          200: '#adc2e0',
        },
        success: '#0e9f6e',
        warn: '#b45309',
        danger: '#c81e1e',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Consolas', '"Cascadia Code"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.08)',
        'panel-lg': '0 10px 24px -6px rgb(15 23 42 / 0.18)',
        drawer: '-12px 0 32px -8px rgb(8 20 38 / 0.25)',
        toast: '0 4px 16px -2px rgb(8 20 38 / 0.25)',
      },
    },
  },
  plugins: [],
}
