/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif']
      },
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
      }
    }
  },
  plugins: []
};
