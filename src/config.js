/**
 * Depo ayarları. GitHub Pages'te çalışırken owner/repo adresten otomatik bulunur
 * (https://<owner>.github.io/<repo>/). Giriş ekranındaki "Senkronizasyon Ayarları"ndan değiştirilebilir.
 * branch boş = deponun varsayılan dalı.
 */
function detectRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo } : null;
}

/* Derleme anında gömülen değerler (vite.config.js → define) */
const DATA = typeof __DATA_REPO__ !== 'undefined' ? __DATA_REPO__ : {};
const OBF = typeof __SCOUT_TOKEN__ !== 'undefined' ? __SCOUT_TOKEN__ : '';

/** Gömülü senkronizasyon anahtarı (B seçeneği) – varsa gözlemciler hiçbir ayar yapmaz */
export const BUILT_IN_TOKEN = OBF ? [...atob(OBF)].reverse().join('') : '';

export const DEFAULT_REPO = {
  owner: 'serliomer2-ctrl',
  repo: 'ScautFTC2026',
  path: 'scouting_data.json',
  ...detectRepo(),
  branch: '',
  // Ayrı veri deposu (varsayılan: ScautFTC2026-data)
  ...(DATA.owner && { owner: DATA.owner }),
  ...(DATA.repo && { repo: DATA.repo }),
  ...(DATA.branch && { branch: DATA.branch }),
};

/**
 * Puan modeli (Maç Simülatörü + İttifak Seçimi). Biobuzz kural kitabındaki gerçek değerlerle
 * güncelleyin – Simülatör sekmesinden de değiştirilebilir (cihazda saklanır).
 */
export const DEFAULT_SCORING = {
  autoTip: 10, // otonomdaki 1 Tip kaç puan
  teleTip: 5, // TeleOp'taki 1 Tip kaç puan
  endFlower: 15, // End Game Flower başarılı olursa
  autoBonus: 5, // otonomu "Başarılı" tamamlarsa (park / görev bonusu varsayımı)
};

export const SYNC_INTERVAL_MS = 45_000;

/**
 * Cloudflare Worker adresi (worker/worker.js, A seçeneği). Gömülü anahtar YOKSA kullanılır;
 * doluysa tüm okuma/yazma bu ara sunucudan geçer,
 * gözlemciler hiçbir anahtar/ayar girmez. Adres gizli değildir; anahtar Worker'da saklanır.
 * Derlemede VITE_PROXY_URL ile de verilebilir.
 */
export const PROXY_URL = (import.meta.env.VITE_PROXY_URL || 'https://biobuzz-sync.serli-omer2.workers.dev').replace(/\/$/, '');

/** Gelişmiş ayarlar yalnızca Worker yoksa ya da adres ?admin ile açılırsa görünür */
export const SHOW_SYNC_SETTINGS =
  (!PROXY_URL && !BUILT_IN_TOKEN) || new URLSearchParams(location.search).has('admin');
