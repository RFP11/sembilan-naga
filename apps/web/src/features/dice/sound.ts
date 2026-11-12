// Dice sounds, made on the spot with Web Audio: a burst of filtered noise for the clatter and a
// short tone for the hard "tock" of resin. No audio files to download.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/**
 * Browsers only let a page make sound after the person has clicked or typed on it; call this
 * from such an event so later throws (even other players') can be heard.
 */
export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function noiseBuffer(audio: AudioContext) {
  if (noise) return noise;
  noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.12), audio.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** One knock: on the table (lower, duller) or against another die (higher, brighter). */
export function clack(strength: number, against: "table" | "die") {
  if (!ctx || ctx.state !== "running") return;
  const audio = ctx;
  const now = audio.currentTime;
  const volume = Math.min(1, strength / 10) * 0.45;
  if (volume < 0.02) return;
  const jitter = 0.85 + Math.random() * 0.3;

  const out = audio.createGain();
  out.connect(audio.destination);

  const src = audio.createBufferSource();
  src.buffer = noiseBuffer(audio);
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = (against === "table" ? 1400 : 3200) * jitter;
  band.Q.value = against === "table" ? 1.2 : 3;
  const env = audio.createGain();
  const decay = against === "table" ? 0.07 : 0.04;
  env.gain.setValueAtTime(volume, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  src.connect(band).connect(env).connect(out);
  src.start(now);
  src.stop(now + decay + 0.02);

  const tone = audio.createOscillator();
  tone.type = "triangle";
  tone.frequency.value = (against === "table" ? 420 : 2300) * jitter;
  const toneEnv = audio.createGain();
  toneEnv.gain.setValueAtTime(volume * 0.5, now);
  toneEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  tone.connect(toneEnv).connect(out);
  tone.start(now);
  tone.stop(now + 0.05);
}
