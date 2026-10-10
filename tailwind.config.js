import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './App.tsx', './index.tsx', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './services/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#D9B26A',
        'background-light': '#f6f7f8',
        'background-dark': '#0D151D',
        'card-dark': '#182129',
        'text-secondary-dark': '#AEB8C2',
      },
      fontFamily: {
        display: ['Pretendard Variable', 'Pretendard', 'Plus Jakarta Sans', 'Noto Sans', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      screens: { xs: '400px' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)', 'smooth-out': 'cubic-bezier(0.22, 1, 0.36, 1)' },
      transitionDuration: { DEFAULT: '250ms' },
    },
  },
  plugins: [forms, containerQueries],
};
