
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}',
    './public/**/*.{html,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        'zoom-out': {
          '0%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        wiggle: "wiggle 0.5s ease-in-out infinite",
        'zoom-out-once': 'zoom-out 0.4s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar-hide'),
  ],
}