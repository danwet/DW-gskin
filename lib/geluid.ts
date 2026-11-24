"use client";

/**
 * Korte meldingsklank, gegenereerd met de Web Audio API: geen bestand nodig en
 * dus ook niets dat kan ontbreken. Twee korte tonen na elkaar, zacht gehouden.
 *
 * Moet vanuit een klik worden aangeroepen: browsers starten audio pas na een
 * gebruikersactie.
 */
let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Bouwer = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Bouwer) return null;
  context ??= new Bouwer();
  return context;
}

function toon(audio: AudioContext, frequentie: number, start: number, duur: number, volume = 0.16) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequentie;
  // Zachte aanzet en uitloop, anders klikt het.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duur);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duur + 0.02);
}

/**
 * Eenmalig ontgrendelen bij de eerste klik of toetsaanslag in de app. Zonder dat
 * blijft de audiocontext in sommige browsers opgeschort en hoor je alleen de
 * eerste keer iets.
 */
export function ontgrendelGeluid(): void {
  const audio = ctx();
  if (!audio || audio.state === "running") return;
  void audio.resume().catch(() => undefined);
}

export function speelNotificatieGeluid(): void {
  const audio = ctx();
  if (!audio) return;

  const speel = () => {
    // Pas plannen als de context loopt; anders staan de tonen op een bevroren
    // klok en hoor je ze één keer of helemaal niet.
    const nu = audio.currentTime + 0.02;
    toon(audio, 880, nu, 0.16, 0.14);
    toon(audio, 1174.66, nu + 0.11, 0.22, 0.11);
  };

  if (audio.state === "running") {
    speel();
    return;
  }
  void audio
    .resume()
    .then(() => {
      if (audio.state === "running") speel();
    })
    .catch(() => undefined);
}
