/** Service Worker kaydı – yalnızca üretim derlemesinde ve güvenli bağlamda (https / localhost) */
export function registerPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker kaydedilemedi:', e));
  });
}
