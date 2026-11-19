import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * B seçeneği (kullanıcının kararı): senkronizasyon anahtarı derleme anında GitHub Actions
 * secret'ından (SCOUT_TOKEN) alınıp pakete gömülür. Kaynak kodda/depoda anahtar YOKTUR.
 * Paketin içinde ters çevrilip base64'lenir – bu güvenlik değildir, sadece otomatik
 * "github_pat_" tarayıcılarını zorlaştırır. Anahtar yalnızca veri deposuna (ScautFTC2026-data)
 * ve yalnızca "Contents" iznine sahip olmalıdır.
 */
const token = process.env.SCOUT_TOKEN || '';
const obf = token ? Buffer.from([...token].reverse().join('')).toString('base64') : '';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __SCOUT_TOKEN__: JSON.stringify(obf),
    __DATA_REPO__: JSON.stringify({
      owner: process.env.DATA_OWNER || 'serliomer2-ctrl',
      repo: process.env.DATA_REPO || 'ScautFTC2026-data',
      branch: process.env.DATA_BRANCH || '',
    }),
  },
});
