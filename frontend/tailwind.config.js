/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif']
      },
      colors: {
        night: '#0b0f1a',
        dusk: '#0f172a',
        mist: '#e2e8f0',
        ember: '#f97316',
        aurora: '#22d3ee'
      },
      boxShadow: {
        glow: '0 0 40px rgba(34, 211, 238, 0.15)',
        soft: '0 20px 60px rgba(15, 23, 42, 0.25)'
      }
    }
  },
  plugins: []
};
