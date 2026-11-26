/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#2563EB',
          600: '#155EEF',
          700: '#1D4ED8',
          900: '#172554',
        },
        surface: '#F5F8FF',
      },
    },
  },
  plugins: [],
};
