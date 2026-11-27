/** Tarama geri bildirimi: kısa bip (WebAudio) + titreşim. Ses izni gerektirmez; ilk dokunuştan sonra çalışır. */
let ctx = null;
export function beep(kind = 'ok') {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = kind === 'ok' ? 1320 : kind === 'dup' ? 660 : 220;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'ok' ? 0.12 : 0.25));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch { /* ses yok: sorun değil */ }
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : kind === 'dup' ? [40, 60, 40] : 250);
}
