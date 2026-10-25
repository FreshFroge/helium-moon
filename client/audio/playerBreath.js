// Phrases from the attributed recording, separated at quiet breath pauses.
export const PLAYER_BREATH_FILE = 'assets/audio/player_breathing.wav';
export const PLAYER_BREATH_BOUNDARIES = [0, 1.65, 3.35, 4.95, 6.45, 7.95, 9.45, 10.95, 12.45, 13.95, 15.4];

export function recordedBreathPhrase(pcm, sampleRate, index) {
  const a = PLAYER_BREATH_BOUNDARIES[index], b = PLAYER_BREATH_BOUNDARIES[index + 1];
  if (a === undefined || b === undefined || b * sampleRate > pcm.length + sampleRate * 0.02) throw new Error('Incomplete breathing recording');
  const data = pcm.slice(Math.round(a * sampleRate), Math.min(pcm.length, Math.round(b * sampleRate)));
  const fade = Math.round(sampleRate * 0.035);
  for (let i = 0; i < data.length; i++) data[i] *= Math.min(1, i / fade, (data.length - 1 - i) / fade);
  return data;
}
