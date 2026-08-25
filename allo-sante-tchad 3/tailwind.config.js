import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Palette inspiree du drapeau tchadien, versions sobres et
        // fortement contrastees pour rester lisibles en plein soleil.
        sable: {
          50: '#FBFAF7',
          100: '#F4F1EA',
          200: '#E7E2D6',
          300: '#D3CCBB',
        },
        nil: {
          // bleu
          50: '#EAF1F9',
          100: '#CFE0F2',
          200: '#9DC0E4',
          400: '#2E6FB7',
          600: '#0B4C8C',
          700: '#083A6B',
          900: '#04223F',
        },
        soleil: {
          // jaune
          100: '#FFF3CC',
          300: '#FFD84D',
          500: '#E8A800',
          700: '#8A6400',
        },
        urgence: {
          // rouge
          50: '#FDEDEC',
          100: '#FAD7D4',
          500: '#D32F2F',
          600: '#B71C1C',
          800: '#7F1010',
        },
        vital: '#C62828',
        urgent: '#EF6C00',
        jour: '#F9A825',
        planifie: '#2E7D32',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'Arial', 'sans-serif'],
        ar: ['Noto Naskh Arabic', 'Noto Sans Arabic', 'Amiri', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        carte: '0 1px 2px rgba(4,34,63,.08), 0 2px 8px rgba(4,34,63,.06)',
      },
      minHeight: { touch: '3.5rem' },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant('rtl', '[dir="rtl"] &')
      addVariant('ltr', '[dir="ltr"] &')
      addVariant('lite', '[data-lite="1"] &')
    }),
  ],
}
