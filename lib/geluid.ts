"use client";

/**
 * Meldingsklank als een echte bel: een grondtoon met onharmonische boventonen,
 * elk met een eigen uitsterftijd. Dat is wat een klok van een piep onderscheidt.
 *
 * Alles wordt met de Web Audio API opgewekt, dus er is geen audiobestand nodig
 * en er kan ook niets ontbreken.
 */
let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Bouwer =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Bouwer) return null;
  context ??= new Bouwer();
  return context;
}

/** Boventonen van een klok: de verhoudingen zijn bewust niet harmonisch. */
const BOVENTONEN = [
  { verhouding: 1, sterkte: 1, uitloop: 1 },
  { verhouding: 2.0, sterkte: 0.55, uitloop: 0.7 },
  { verhouding: 3.01, sterkte: 0.42, uitloop: 0.5 },
  { verhouding: 4.17, sterkte: 0.3, uitloop: 0.36 },
  { verhouding: 5.43, sterkte: 0.22, uitloop: 0.26 },
  // De hoge, korte boventonen geven de scherpe "ting" bij de aanslag.
  { verhouding: 6.79, sterkte: 0.16, uitloop: 0.18 },
  { verhouding: 8.2, sterkte: 0.12, uitloop: 0.12 },
  { verhouding: 10.1, sterkte: 0.08, uitloop: 0.09 },
];

/** Korte, heldere tik van de hamer: geeft de aanslag zijn scherpte. */
function tik(audio: AudioContext, start: number): void {
  const lengte = Math.floor(audio.sampleRate * 0.02);
  const buffer = audio.createBuffer(1, lengte, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < lengte; i += 1) {
    // Snel uitdovende ruis.
    data[i] = (Math.random() * 2 - 1) * (1 - i / lengte) ** 3;
  }
  const bron = audio.createBufferSource();
  bron.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 7000;
  filter.Q.value = 1.2;

  const gain = audio.createGain();
  gain.gain.value = 0.09;

  bron.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  bron.start(start);
  bron.stop(start + 0.03);
}

function luidBel(
  audio: AudioContext,
  grondtoon: number,
  start: number,
  duur: number,
  volume: number,
): void {
  for (const boventoon of BOVENTONEN) {
    const oscillator = audio.createOscillator();
    oscillator.type = "sine";
    // Een fractie detune geeft de klok zweving, anders klinkt hij dood.
    oscillator.frequency.value = grondtoon * boventoon.verhouding;
    oscillator.detune.value = (boventoon.verhouding - 1) * 4;

    const gain = audio.createGain();
    const piek = volume * boventoon.sterkte;
    const uit = start + duur * boventoon.uitloop;
    gain.gain.setValueAtTime(0, start);
    // Zeer korte aanslag: dat "tikt" en maakt het een ting in plaats van een toon.
    gain.gain.linearRampToValueAtTime(piek, start + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, uit);

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(uit + 0.02);
  }
}

export function ontgrendelGeluid(): void {
  const audio = ctx();
  if (!audio || audio.state === "running") return;
  void audio.resume().catch(() => undefined);
}

export function speelNotificatieGeluid(): void {
  const audio = ctx();
  if (!audio) return;

  const speel = () => {
    // Eén slag met een scherpe aanslag: eerst de tik, dan de klok.
    const start = audio.currentTime + 0.02;
    tik(audio, start);
    luidBel(audio, 1567.98, start, 1.2, 0.16);
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
