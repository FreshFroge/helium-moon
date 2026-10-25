// Test the shipped recording and actual phrase/mix helpers used in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playerBreathMix, playerHeartbeatMix, PLAYER_BREATH_VARIANTS } from '../client/audio/synth.js';
import { PLAYER_BREATH_BOUNDARIES, recordedBreathPhrase } from '../client/audio/playerBreath.js';

const wav = fs.readFileSync(new URL('../assets/audio/player_breathing.wav', import.meta.url));
assert.equal(wav.toString('ascii',0,4),'RIFF');
let rate,channels,bits,data;
for(let i=12;i+8<=wav.length;) {
  const tag=wav.toString('ascii',i,i+4), size=wav.readUInt32LE(i+4), start=i+8;
  if(tag==='fmt ') { assert.equal(wav.readUInt16LE(start),1);channels=wav.readUInt16LE(start+2);rate=wav.readUInt32LE(start+4);bits=wav.readUInt16LE(start+14); }
  if(tag==='data') data=wav.subarray(start,start+size);
  i=start+size+(size%2);
}
assert.equal(channels,1);assert.equal(bits,16);
const pcm=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
const rms = signal => Math.sqrt(signal.reduce((sum,x)=>sum+x*x,0)/signal.length);

test('the shipped recording contains ten distinct usable breath phrases', () => {
  assert.ok(pcm.length/rate>15.3 && pcm.length/rate<15.6);
  assert.equal(PLAYER_BREATH_BOUNDARIES.length-1,PLAYER_BREATH_VARIANTS*2);
  const lengths=new Set();
  for(let i=0;i<PLAYER_BREATH_VARIANTS*2;i++) {
    const clip=recordedBreathPhrase(pcm,rate,i);
    assert.ok(clip.every(Number.isFinite));
    assert.ok(clip.length/rate>1.3 && clip.length/rate<1.8);
    assert.ok(rms(clip)>0.01 && rms(clip)<0.15);
    assert.equal(Math.abs(clip[0]),0);assert.equal(Math.abs(clip.at(-1)),0);
    lengths.add(clip.length);
  }
  assert.ok(lengths.size>=3);
  assert.throws(()=>recordedBreathPhrase(pcm.slice(0,100),rate,0),/Incomplete/);
});

test('breathing is very quiet and independent of fear/proximity', () => {
  for(const exert of [0,0.3,0.7,1]) for(const downed of [0,1]) {
    const quiet=playerBreathMix(exert,0,downed);
    assert.deepEqual(playerBreathMix(exert,1,downed),quiet);
    assert.ok(quiet.gain<=0.0181);
  }
  assert.ok(playerBreathMix(0,0).gain<=0.003);
  assert.ok(playerBreathMix(1,0).gain>playerBreathMix(0,0).gain);
  assert.ok(rms(pcm)*playerBreathMix(1,0).gain<0.002);
});

test('heartbeat stays subdued and follows only exertion or injury', () => {
  for(const exert of [0,0.5,1]) {
    const mix=playerHeartbeatMix(exert,0);
    assert.ok(mix.gain>0 && mix.gain<=0.0201);
    assert.ok(mix.bpm>=60 && mix.bpm<=100);
  }
  assert.ok(playerHeartbeatMix(1,1).gain<0.03);
  assert.ok(playerHeartbeatMix(0,0).gain<0.01);
});

test('condensation strength stays separate from quiet playback gain', () => {
  assert.equal(playerBreathMix(0,0).visualStrength,0);
  assert.ok(playerBreathMix(1,0).visualStrength>0.5);
  assert.equal(playerBreathMix(1,1,1).visualStrength,playerBreathMix(1,0,1).visualStrength);
});
