/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Base — deep ink, not pure black, with a cool undertone.
        ink: {
          DEFAULT: '#0A0E14',
          800: '#0D121A',
          700: '#121823', // raised panels
          600: '#161D29',
          500: '#1E2733', // hairline borders
        },
        bone: '#E8EEF2', // primary text
        mist: '#8A99A8', // muted / secondary text
        // Signal accents — these encode state, not decoration.
        signal: {
          DEFAULT: '#34E5C4', // secure · verified · connected
          dim: '#1B6B5E',
          glow: 'rgba(52, 229, 196, 0.16)',
        },
        ember: {
          DEFAULT: '#FF8A5B', // data in flight · active transfer
          dim: '#7A3F28',
          glow: 'rgba(255, 138, 91, 0.16)',
        },
        alert: {
          DEFAULT: '#FF5D6C', // dropped · error
          dim: '#7A2730',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.28em',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 60px -30px rgba(0,0,0,0.8)',
        signalglow: '0 0 0 1px rgba(52,229,196,0.4), 0 0 28px -4px rgba(52,229,196,0.5)',
      },
      keyframes: {
        'pulse-node': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.12)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scan': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'drift': {
          '0%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
          '100%': { transform: 'translateY(0px)' },
        },
      },
      animation: {
        'pulse-node': 'pulse-node 2.2s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'scan': 'scan 2.4s linear infinite',
        'drift': 'drift 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
