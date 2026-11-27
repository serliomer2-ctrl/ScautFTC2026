/** Renkler CSS değişkenlerinden gelir; tema (dark/light/field) data-theme ile değişir. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
        ok: v('ok'),
        warn: v('warn'),
        bad: v('bad'),
        red: { alliance: v('alliance-red') },
        blue: { alliance: v('alliance-blue') },
      },
    },
  },
  plugins: [],
};
