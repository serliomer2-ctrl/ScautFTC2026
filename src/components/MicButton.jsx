import React, { useEffect, useRef, useState } from 'react';

/**
 * Sesle yazdırma (Web Speech API). Tarayıcı desteklemiyorsa hiç görünmez.
 * Türkçe / İngilizce seçilebilir; kesinleşen cümleler onAppend ile mevcut nota eklenir,
 * ara (henüz kesinleşmemiş) metin butonun yanında canlı gösterilir.
 * Not: Chrome'da tanıma Google sunucusunda yapılır → internet gerekir; iOS Safari cihaz üzerinde çalışabilir.
 */
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const LANGS = [
  { id: 'tr-TR', label: 'TR' },
  { id: 'en-US', label: 'EN' },
];

export default function MicButton({ onAppend }) {
  const [on, setOn] = useState(false);
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('bb2.micLang') || 'tr-TR';
    } catch {
      return 'tr-TR';
    }
  });
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState('');
  const recRef = useRef(null);
  const appendRef = useRef(onAppend);
  appendRef.current = onAppend;

  useEffect(() => () => recRef.current?.abort(), []);
  if (!SR) return null;

  function start() {
    setErr('');
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) txt && appendRef.current(txt);
        else live += txt + ' ';
      }
      setInterim(live.trim());
    };
    rec.onerror = (e) => {
      setErr(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi' : e.error === 'network' ? 'Tanıma için internet gerekli' : e.error === 'no-speech' ? '' : 'Ses tanıma hatası');
    };
    rec.onend = () => {
      setOn(false);
      setInterim('');
    };
    recRef.current = rec;
    rec.start();
    setOn(true);
  }

  const stop = () => recRef.current?.stop();

  return (
    <div className="mt-2 grid gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={on ? stop : start}
          className={`btn min-h-[48px] flex-1 border-2 ${on ? 'animate-pulse border-bad bg-bad text-white' : 'border-line bg-raised'}`}
          aria-pressed={on}
        >
          {on ? '⏹ Dinleniyor… bitirmek için dokun' : '🎤 Sesle Yazdır'}
        </button>
        <div className="flex rounded-xl bg-raised p-1">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={on}
              onClick={() => (setLang(l.id), localStorage.setItem('bb2.micLang', l.id))}
              className={`h-10 w-10 rounded-lg text-xs font-bold ${lang === l.id ? 'bg-accent text-accent-fg' : 'text-muted'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      {interim && <p className="rounded-lg bg-raised px-3 py-2 text-sm italic text-muted">… {interim}</p>}
      {err && <p className="text-xs text-bad">{err}</p>}
    </div>
  );
}
