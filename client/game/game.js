// HELIUM MOON - client game: owns the renderer, scene, local player, audio/voice,
// the active transport (local sim or server), session lifecycle and every
// per-player sensory effect of the terror radius.
import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { World, SURFACE } from '../../shared/world.js';
import { GameSim } from '../../shared/sim/sim.js';
import { NOTES } from '../../shared/sim/objectives.js';
import { HV_STATES } from '../../shared/sim/heliumVoice.js';
import { SF_STATES } from '../../shared/sim/skunk.js';
import { clamp, lerp, smoothstep, pointAtDistance } from '../../shared/math.js';
import { terrorAtDistance, horrorCues } from '../../shared/horror.js';
import { Renderer } from '../render/renderer.js';
import { TextureBank } from '../render/textures.js';
import { G } from '../render/shaderlib.js';
import { makePropMaterials } from '../render/props.js';
import { Environment } from './environment.js';
import { PlayerController } from './player.js';
import { Flashlight } from './flashlight.js';
import { BreathFX, AnomalyFX } from './effects.js';
import { Input } from '../core/input.js';
import { AudioEngine } from '../audio/audio.js';
import { VoiceSystem } from '../audio/voice.js';
import { LocalTransport } from '../net/transport.js';
import { SnapBuffer, HeliumView, SkunkView, PlayerAvatar, ObjectiveViews, PLAYER_COLORS } from '../entities/views.js';

const T = CONFIG.TERROR;
const PST = ['alive', 'downed', 'dead', 'escaped'];
const REMOTE_LIGHTS = 2;

function textureList(q) {
  const L = [];
  for (const b of ['cedar', 'cottonwood', 'elm', 'hackberry', 'oak', 'sycamore']) {
    L.push([`bark_${b}_c`, `assets/tex/bark_${b}_c.jpg`], [`bark_${b}_n`, `assets/tex/bark_${b}_n.jpg`, { srgb: false }], [`bark_${b}_r`, `assets/tex/bark_${b}_r.jpg`, { srgb: false }]);
  }
  for (const l of ['ash', 'aspen', 'bush', 'cedar', 'oak']) L.push([`leafc_${l}`, `assets/tex/leafc_${l}.png`, { repeat: false }]);
  L.push(['grass_card', 'assets/tex/grass_card.png', { repeat: false }], ['reed_card', 'assets/tex/reed_card.png', { repeat: false }]);
  L.push(['moon', 'assets/tex/moon.png', { repeat: false }], ['water_n', 'assets/tex/water_n.png', { srgb: false }], ['frost', 'assets/tex/frost.png', { srgb: false }]);
  for (const p of ['concrete_c', 'granite_c', 'gravel_c', 'metal_c', 'wood_c']) L.push([p, `assets/tex/${p}.jpg`]);
  for (const p of ['concrete_n', 'corrugated_n', 'gravel_n', 'wood_n']) L.push([p, `assets/tex/${p}.jpg`, { srgb: false }]);
  return L;
}
const GROUND = ['litter', 'trail', 'mud', 'grass', 'silt', 'clay'];

export class Game {
  constructor(canvas, settings, ui, opts = {}) {
    this.canvas = canvas; this.settings = settings; this.ui = ui; this.opts = opts;
    this.mode = 'loading'; this.paused = false;
    this.net = null; this.offs = []; this.myId = null;
    this.terror = 0; this.fear = 0; this.cold = 0; this.critical = 0; this.gasFx = 0; this.damage = 0; this.heartPulse = 0;
    this.hvDist = 1e9; this.sightCool = 0; this.chasing = false;
    this.avatars = new Map(); this.plBufs = new Map(); this.pending = new Set();
    this.inputT = 0; this.sessionT = 0; this.last = 0; this.fpsAcc = 0; this.fpsN = 0; this.fps = 60; this.frameMs = 16;
    this.lobby = null; this.notesRead = []; this.reading = null; this.prog = null; this.exposure = 1;
  }

  // ---------------------------------------------------------------- loading
  async init(progress) {
    const set = this.settings;
    const preset = this.preset = set.preset;
    this.renderer = new Renderer(this.canvas, set);
    this.renderer.setQuality(preset, set.renderScale);
    progress(0.02, 'Loading textures');
    const bank = this.bank = new TextureBank(this.renderer.gl);
    const gsize = preset.label === 'Low' || preset.label === 'Medium' ? 512 : 1024;
    const list = textureList();
    let done = 0;
    const total = list.length + 2;
    await Promise.all([
      bank.loadAll(list, () => progress(0.02 + 0.22 * (++done / total), 'Loading textures')),
      bank.array('groundC', GROUND.map((g) => `assets/tex/ground_${g}_c.jpg`), gsize, true).then(() => progress(0.02 + 0.22 * (++done / total), 'Loading textures')),
      bank.array('groundN', GROUND.map((g) => `assets/tex/ground_${g}_n.jpg`), gsize, false).then(() => progress(0.02 + 0.22 * (++done / total), 'Loading textures')),
    ]);
    bank.tex.frost.wrapS = bank.tex.frost.wrapT = THREE.MirroredRepeatWrapping; bank.tex.frost.needsUpdate = true;
    this.world = await World.createAsync({}, (f, t) => progress(0.25 + f * 0.3, t));
    const world = this.world;
    progress(0.56, 'Planting trees');
    await new Promise((r) => setTimeout(r, 0));
    this.env = new Environment(world, bank, this.renderer, preset, (t) => progress(0.62, t));
    this.scene = this.env.scene;
    this.camera = new THREE.PerspectiveCamera(set.fov, window.innerWidth / window.innerHeight, 0.06, 2600);
    this.scene.add(this.camera);
    this.player = new PlayerController(world, this.camera, set);
    this.flashlight = new Flashlight(this.scene, preset);
    this.remoteLights = [];
    for (let i = 0; i < REMOTE_LIGHTS; i++) {
      const L = new THREE.SpotLight(0xfff1dc, 0, 40, THREE.MathUtils.degToRad(26), 0.3, 1.6);
      this.scene.add(L); this.scene.add(L.target); this.remoteLights.push(L);
    }
    this.input = new Input(this.canvas, set);
    this.input.onLockChange = (locked) => this._onLockChange(locked);
    this.propMats = makePropMaterials(bank.tex);
    this.objViews = new ObjectiveViews(this.scene, this.propMats);
    this.breath = new BreathFX(this.scene);
    this.anomaly = new AnomalyFX(this.scene, world);
    progress(0.72, 'Recording the night');
    this.audio = new AudioEngine(set);
    await this.audio.init(world, (f) => progress(0.72 + f * 0.16, 'Recording the night'));
    this.player.onFootstep = (info) => this.audio.footstep(info);
    this.player.onLand = (impact) => this.audio.footstep({
      surface: this.player.surface, water: this.player.inWater, brush: this.player.inBrush,
      loud: clamp(impact / 8, 0.5, 1), speed: 0,
    });
    this.audio.onExhale = (v) => this._exhale(v);
    this.audio.onBeat = () => { this.heartPulse = 1; };
    this.voice = new VoiceSystem(this.audio, set, {
      myId: () => (this.net ? this.net.myId() : 'p1'),
      sig: (to, data) => this.net && this.net.networked && this.net.send({ t: 'sig', to, data }),
      voiceState: (mic) => this.net && this.net.networked && this.net.send({ t: 'voice_state', mic }),
      act: (a) => this.net && this.mode === 'playing' && this.net.send({ t: 'act', ...a }),
      binary: (b) => this.net && this.net.binary(b),
      get networked() { return false; },
    });
    Object.defineProperty(this.voice.net, 'networked', { get: () => !!(this.net && this.net.networked) });
    this.voice.onChange = (st) => this.ui.voiceStatus(st);
    progress(0.9, 'Something is in the trees');
    const [hv, sf] = await Promise.all([HeliumView.create(this.scene, world), SkunkView.create(this.scene)]);
    this.hv = hv; this.sf = sf;
    this.hvBuf = new SnapBuffer([3, 4], [7, 10]); this.sfBuf = new SnapBuffer([3, 4], [6, 8]);
    progress(0.97, 'Compiling shaders');
    this._menuCamera(0);
    this.env.update(0.016, this.camera, 0);
    this._precompile();
    window.addEventListener('resize', () => this._resize());
    set.onChange(() => this._settingsChanged());
    const wake = () => { this.audio.resume(); };
    window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true);
    this._resize();
    this.mode = 'menu';
    progress(1, 'Ready');
    if (!this.opts.manual) { this.last = performance.now(); requestAnimationFrame((t) => this._frame(t)); }
  }

  // compile every program against the HDR scene target the game really renders into (compiling against the
  // canvas produced a second, unused sRGB variant of every material) - creatures included, so their first
  // appearance doesn't stall the frame
  _precompile() {
    const gl = this.renderer.gl;
    const vis = [this.hv.root.visible, this.sf.root.visible];
    this.hv.root.visible = true; this.sf.root.visible = true;
    try { gl.setRenderTarget(this.renderer.sceneRT); gl.compile(this.scene, this.camera); } catch (e) { /* optional */ }
    gl.setRenderTarget(null);
    this.hv.root.visible = vis[0]; this.sf.root.visible = vis[1];
  }

  _resize() {
    this.renderer.resize();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  _settingsChanged() {
    const s = this.settings;
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    if (s.preset !== this.renderer.preset || this._rs !== s.renderScale) { this._rs = s.renderScale; this.renderer.setQuality(s.preset, s.renderScale); }
    if (!s.adaptiveRes && this.renderer.dynScale !== 1) { this.renderer.dynScale = 1; this.renderer.resize(); }
  }

  // ---------------------------------------------------------------- transport + session
  attach(net) {
    this.detach();
    this.net = net;
    this.offs = [
      net.on('start', (m) => this.beginSession(m.info)),
      net.on('snap', (m) => this._onSnap(m.s)),
      net.on('ev', (m) => { for (const e of m.ev) this._onEvent(e); }),
      net.on('chat', (m) => this.ui.chatLine(m.name, m.text, this._colorOf(m.from))),
      net.on('sig', (m) => this.voice.onSignal(m.from, m.data)),
      net.on('binary', (b) => this.voice.onBinary(b)),
      net.on('left', (m) => this._dropAvatar(m.id)),
      net.on('lobby', (m) => this._onLobby(m)),
      net.on('disconnect', () => { if (this.net === net) this._disconnected(); }),
    ];
  }

  detach() {
    for (const f of this.offs) f(); this.offs = [];
    const previous = this.net;
    this.net = null; this.lobby = null; this.myId = null;
    // Unsubscribe before closing so an intentional mode change cannot trigger
    // the old connection's disconnect handler and send us back to the menu.
    if (previous) previous.close();
    this.voice && this.voice.dropAllPeers();
  }

  startSingle(name) {
    this.audio.resume();
    const t = new LocalTransport(this.world);
    this.attach(t);
    t.start(name || this.settings.playerName || 'You');
  }

  _onLobby(m) {
    this.lobby = m;
    this.voice.syncPeers(m.players.map((p) => p.id));
    this.ui.lobby(m, this.myId || this.net.myId());
    if (m.state === 'lobby' && (this.mode === 'playing' || this.mode === 'ended')) this._toLobbyView();
  }

  _toLobbyView() {
    this._endSessionCleanup();
    this.mode = 'lobby';
    this.ui.showEnd(null); this.ui.showHUD(false); this.ui.showMenu(true); this.ui.openLobby();
  }

  _disconnected() {
    if (this.mode === 'playing' || this.mode === 'ended' || this.mode === 'lobby') {
      this.ui.toast('Lost connection to the server.', 5000);
      this.quitToMenu(true);
    }
  }

  beginSession(info) {
    this._endSessionCleanup();
    this.info = info; this.myId = this.net.myId();
    this.mode = 'playing'; this.paused = false; this.ended = false; this.result = null;
    this.snapT = -1; this.renderT = 0; this.interp = this.net.networked ? 0.12 : 0.06;
    this.hvBuf.clear(); this.sfBuf.clear(); this.plBufs.clear();
    this.objViews.build(info.layout, this.world);
    for (const [id, a] of this.avatars) a.dispose(this.scene);
    this.avatars.clear();
    info.players.forEach((p, i) => { if (p.id !== this.myId) this._ensureAvatar(p.id, p.name, i); });
    this.names = new Map(info.players.map((p, i) => [p.id, { name: p.name, idx: i }]));
    const idx = Math.max(0, info.players.findIndex((p) => p.id === this.myId));
    const sp = GameSim.prototype.spawnPoint.call({ world: this.world }, idx);
    this.player.spawn(sp.x, sp.z, sp.yaw);
    this.player.injured = 0; this.player.slow = 1; this.player.downed = 0; this.player.lookLock = null;
    this.flashlight.battery = 1; this.flashlight.on = true; this.flashlight.snap(this.camera);
    this.terror = 0; this.fear = 0; this.cold = 0; this.critical = 0; this.gasFx = 0; this.damage = 0; this.chasing = false;
    this.me = null; this.myState = 'alive'; this.health = CONFIG.PLAYER.MAX_HEALTH;
    this.notesRead = []; this.reading = null; this.sessionT = 0; this.fade = 1; this.fadeTarget = 0;
    this.obj = null; this.team = { fuel: false, fuse: false }; this.extractOpen = false; this.spectate = null;
    this.anomaly.reset();
    this.audio.stopAll();
    this.ui.showEnd(null); this.ui.showMenu(false); this.ui.showPause(false); this.ui.showHUD(true);
    this.ui.intro();
    this.input.enabled = true;
    if (!this.input.locked) { this.input.requestLock(); this.ui.clickToPlay(!this.input.locked && !this.input.dragLook); }
    this._objectivesDirty = true;
  }

  _endSessionCleanup() {
    this.ui.closeChat();
    this.voice && this.voice.endSession();
    this.audio && this.audio.stopAll();
    this.reading = null; this.ui.showNote(null);
  }

  restart() {
    if (!this.net) return;
    if (this.net.networked) { if (this._isHost()) this.net.send({ t: 'restart' }); else this.ui.toast('Waiting for the host to restart…'); }
    else this.net.send({ t: 'restart' });
  }

  returnToLobby() { if (this.net && this.net.networked) { if (this._isHost()) this.net.send({ t: 'to_lobby' }); else this._toLobbyView(); } }

  quitToMenu(silent = false) {
    this._endSessionCleanup();
    if (this.net && this.net.networked) this.net.send({ t: 'leave' });
    this.detach();
    for (const a of this.avatars.values()) a.dispose(this.scene);
    this.avatars.clear();
    this.objViews.clear();
    this.mode = 'menu'; this.paused = false; this.input.enabled = false; this.input.exitLock();
    this.ui.showHUD(false); this.ui.showPause(false); this.ui.showEnd(null); this.ui.showMenu(true);
    if (!silent) this.ui.toast('');
  }

  _isHost() { return !!(this.lobby && this.lobby.host === (this.net && this.net.myId())); }

  pause(on) {
    if (this.mode !== 'playing') return;
    this.paused = on;
    if (this.net && !this.net.networked) this.net.paused = on;
    this.ui.showPause(on);
    if (on) this.input.exitLock();
    else { this.input.requestLock(); this.ui.clickToPlay(false); }
  }

  _onLockChange(locked) {
    if (this.mode !== 'playing' || this.ended) return;
    if (!locked && !this.input.dragLook && !this.paused && !this.ui.chatOpen) this.pause(true);
    if (locked) this.ui.clickToPlay(false);
  }

  _colorOf(id) { const n = this.names && this.names.get(id); return '#' + PLAYER_COLORS[(n ? n.idx : 0) % PLAYER_COLORS.length].toString(16).padStart(6, '0'); }

  async _ensureAvatar(id, name, idx) {
    if (this.avatars.has(id) || this.pending.has(id)) return;
    this.pending.add(id);
    const a = await PlayerAvatar.create(this.scene, id, name, idx);
    this.pending.delete(id);
    if (this.mode !== 'playing' || !this.names || !this.names.has(id)) { a.dispose(this.scene); return; }
    this.avatars.set(id, a);
    this._precompile();
  }
  _dropAvatar(id) { const a = this.avatars.get(id); if (a) { a.dispose(this.scene); this.avatars.delete(id); } this.plBufs.delete(id); this.voice.dropPeer(id); }

  // ---------------------------------------------------------------- network state
  _onSnap(s) {
    if (this.mode !== 'playing') return;
    if (this.snapT < 0) this.renderT = s.t - this.interp;
    this.snapT = s.t; this.simState = s.st; this.phase = s.ph;
    this.hvBuf.push(s.t, s.hv); this.sfBuf.push(s.t, s.sf);
    for (const row of s.pl) {
      if (row[0] === this.myId) { this.me = row; continue; }
      let b = this.plBufs.get(row[0]);
      if (!b) { b = new SnapBuffer([4], [0, 6, 7, 8]); this.plBufs.set(row[0], b); }
      b.push(s.t, row);
    }
    if (s.obj) {
      const wasTeam = { ...this.team };
      this.obj = s.obj; this.team = s.obj.team; this.extractOpen = s.obj.ex;
      this.objViews.apply(s.obj);
      if (wasTeam.fuel !== this.team.fuel || wasTeam.fuse !== this.team.fuse) this._objectivesDirty = true;
    }
    this.gas = s.gas || [];
    if (this.me) {
      const st = PST[this.me[8]];
      if (st !== this.myState) this._myStateChanged(this.myState, st);
      this.myState = st; this.health = this.me[7];
    }
  }

  _myStateChanged(from, to) {
    if (to === 'downed') { this.ui.toast('You are down. A teammate can revive you.', 4000); }
    if (to === 'alive' && from === 'downed') { this.player.downed = 0; this.ui.toast('Back on your feet.', 2500); }
    if (to === 'dead' && this.net.networked) { this.ui.toast('You died. Spectating your team.', 5000); this.voice.disableMicTransmit = true; }
    if (to === 'escaped') this.ui.toast('You made it to the cruiser.', 4000);
  }

  _name(id) { const n = this.names && this.names.get(id); return n ? n.name : 'Someone'; }

  _onEvent(e) {
    if (this.mode !== 'playing') return;
    const A = this.audio, pos = e.x !== undefined ? { x: e.x, y: e.y ?? (this.world.heightAt(e.x, e.z) + 1), z: e.z } : null;
    switch (e.type) {
      case 'begin': this._objectivesDirty = true; break;
      case 'hv_vocal': if (this._near(pos, CONFIG.HV.FOOTSTEP_MAX_DISTANCE) && this._canSee(pos)) { A.hvVocal(e.k, e.s, pos); this.voice.suppress(2); } break;
      case 'hv_sig': if (this._canSee(pos)) { A.signature(pos); this.voice.suppress(2.6); } break;
      case 'sf_vocal': A.sfVocal(e.k, e.s, pos); break;
      case 'snap': break; // no artificial branch-snap warning of an unseen approach
      case 'chase':
        this.chasing = !!e.on;
        break;
      case 'hit':
        if (e.pid === this.myId) { this.damage = 1; this.player.shake = 1.2; A.ui('hurt', 0.9); this.player.injured = 1; }
        else { const a = this.avatars.get(e.pid); if (a) A.at('hurt', { x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z }, { gain: 1, ref: 5 }); }
        break;
      case 'downed': case 'dead':
        if (e.pid === this.myId) { this.damage = 1; this.player.shake = 1.6; A.ui('down', 1); this.player.downed = 1; }
        else { const a = this.avatars.get(e.pid); if (a) A.at('down', { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z }, { gain: 1.1, ref: 6 }); this.ui.toast(`${this._name(e.pid)} ${e.type === 'dead' ? 'is gone' : 'is down'}.`, 3500); }
        break;
      case 'revived': if (e.pid !== this.myId) this.ui.toast(`${this._name(e.by)} revived ${this._name(e.pid)}.`, 3000); break;
      case 'gas': A.sfVocal('gas', e.seq || 1, pos); break;
      case 'objective': {
        const s = this.objViews.stations.get(e.id);
        this.ui.toast({ gen: 'The generator coughs and catches.', relay: 'The relay box hums back to life.', mast: 'Distress call sent. A county unit is responding to the highway bridge.' }[e.id] || 'Objective complete.', 5000);
        if (s) {
          const sp = { x: s.def.x, y: s.def.y + 0.6, z: s.def.z };
          if (e.id === 'gen') A.loopAt('gen', 'genLoop', sp, { gain: 1.1, ref: 5, reverb: 0.3 });
          if (e.id === 'relay') A.loopAt('relay', 'hum', sp, { gain: 0.35, ref: 2 });
          if (e.id === 'mast') A.at('radio', { x: s.def.x, y: s.def.y + 1.4, z: s.def.z }, { gain: 1.2, ref: 4 });
        }
        this._objectivesDirty = true;
        break;
      }
      case 'extract_open': {
        const ex = this.info.layout.extract;
        A.loopAt('siren', 'siren', { x: ex.x + 4, y: ex.y + 1.6, z: ex.z + 3 }, { gain: 1.5, ref: 25, rolloff: 1, reverb: 0.5 });
        this._objectivesDirty = true;
        break;
      }
      case 'pickup': {
        const it = this.info.layout.items.find((i) => i.id === e.id);
        this.objViews.setHeld(e.id, true);
        if (e.pid === this.myId) {
          if (e.kind === 'battery') { this.flashlight.addBattery(CONFIG.FLASHLIGHT.BATTERY_PICKUP); A.ui('clink', 0.6); this.ui.toast('Fresh batteries.', 2000); }
          else if (e.kind === 'note') { A.ui('paper', 0.8); const n = NOTES.find((q) => q.id === e.note); if (n) { this.notesRead.push(n.id); this.reading = n; this.ui.showNote(n); } }
          else { A.ui('clink', 0.7); this.ui.toast(e.kind === 'fuel' ? 'Picked up the gas can.' : 'Picked up the fuse kit.', 3000); }
        } else if (it && e.kind !== 'battery') this.ui.toast(`${this._name(e.pid)} found ${e.kind === 'note' ? 'a note' : it.name.toLowerCase()}.`, 3000);
        if (e.kind === 'note' && e.pid !== this.myId) { const n = NOTES.find((q) => q.id === e.note); if (n && !this.notesRead.includes(n.id)) this.notesRead.push(n.id); }
        this._objectivesDirty = true;
        break;
      }
      case 'mimic': this.voice.onMimicEvent(e); break;
      case 'end': this._end(e); break;
      default: break;
    }
  }

  _near(p, d) { return p && Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < d; }

  _canSee(p) {
    if (!p) return false;
    const to = new THREE.Vector3(p.x, p.y, p.z).sub(this.camera.position);
    const distance = to.length();
    if (distance > 45) return false;
    const facing = to.normalize().dot(this.camera.getWorldDirection(new THREE.Vector3()));
    if (facing < Math.cos(THREE.MathUtils.degToRad(this.camera.fov / 2))) return false;
    if (distance > 14 && (!this.flashlight.on || facing < 0.9)) return false;
    const eye = this.camera.position;
    return this.world.lineOfSight(eye.x, eye.y, eye.z, p.x, p.y, p.z, { brushK: 0.3 }) > 0.3;
  }

  _end(r) {
    if (this.ended) return;
    this.ended = true; this.result = r;
    this.ui.closeChat();
    this.voice.endSession();
    this.endDelay = r.result === 'won' ? 2.5 : 3.2;     // game-clock countdown to the end screen
    this.fadeTarget = r.result === 'won' ? 0.4 : 0.85;
  }

  _showEnd() {
    const r = this.result;
    this.mode = 'ended'; this.input.enabled = false; this.input.exitLock();
    this.ui.showHUD(false); this.ui.showPause(false); this.ui.showNote(null);
    const me = r.players.find((p) => p.id === this.myId);
    this.ui.showEnd(r, { me: me ? me.state : 'dead', networked: !!this.net.networked, host: this._isHost(), notes: this.notesRead.length });
  }

  // ---------------------------------------------------------------- main loop
  _frame(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.1); this.last = now;
    this.step(dt);
    requestAnimationFrame((t) => this._frame(t));
  }

  // deterministic stepping for tests: ?manual=1, then game.advance(frames, dt)
  advance(frames = 1, dt = 1 / 30, render = true) {
    for (let i = 0; i < frames; i++) this.step(dt, render && i === frames - 1);
  }

  step(dt, render = true) {
    const t0 = performance.now();
    // A solo pause freezes both the sim and client-owned gameplay (battery,
    // movement, session clock and effects). Keep real time for UI/audio and
    // rendering; multiplayer continues while a player's pause menu is open.
    const gameplayDt = this.paused && this.net && !this.net.networked ? 0 : dt;
    G.uTime.value += gameplayDt;
    if (this.net && this.net.tick && !(this.paused && !this.net.networked)) this.net.tick(dt);
    if (this.mode === 'playing' || this.mode === 'ended') this._updatePlaying(gameplayDt);
    else this._menuCamera(dt);
    this.env.update(gameplayDt, this.camera, 0);
    this.audio.setListener(this.camera);
    this.audio.update(dt, { terror: this.terror, fear: this.fear, cold: this.cold, exert: this.exert || 0, gas: this.gasFx, downed: this.player.downed, critical: this.critical, inGame: this.mode === 'playing' && !this.paused, menu: this.mode !== 'playing' });
    const meP = this.player.pos;
    this.voice.update(dt, {
      ptt: this.mode === 'playing' && !this.input.textFocus && this.input.down('talk'), inGame: this.mode === 'playing',
      alive: this.myState !== 'dead', me: { x: meP.x, y: meP.y + 1.6, z: meP.z }, players: this._playerPositions(),
    });
    if (render) this._render(dt);
    this.input.endFrame();
    this._perf(performance.now() - t0, dt);
  }

  _playerPositions() {
    const m = this._ppos || (this._ppos = new Map()); m.clear();
    for (const [id, a] of this.avatars) m.set(id, { x: a.pos.x, y: a.pos.y + 1.6, z: a.pos.z, state: PST[a.state] });
    return m;
  }

  _menuCamera(dt) {
    const w = this.world;
    this._mt = (this._mt || 0) + dt;
    const p = pointAtDistance(w.trail, w.trailCum, 6);
    const q = pointAtDistance(w.trail, w.trailCum, 48);
    const sway = Math.sin(this._mt * 0.07) * 0.6;
    const x = p.x + Math.sin(this._mt * 0.05) * 0.4, z = p.z;
    const y = w.heightAt(x, z) + 1.65;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(q.x + Math.cos(q.dir) * sway, w.heightAt(q.x, q.z) + 1.4, q.z - Math.sin(q.dir) * sway);
    this.camera.updateMatrixWorld();
    // a figure standing where the trail bends; he is gone if you stare long enough
    const fx = q.x + Math.cos(q.dir) * 3.6, fz = q.z - Math.sin(q.dir) * 3.6;
    const vis = (this._mt % 70) < 52;
    this.hv.update(dt, [fx, w.heightAt(fx, fz), fz, Math.atan2(p.x - fx, p.z - fz), Math.atan2(p.x - fx, p.z - fz), 0, 0, vis ? 4 : 12, 0.25, 0, 10]);
    this.sf.update(dt, null);
    this.flashlight.light.intensity = 0;
    for (const L of this.remoteLights) L.intensity = 0;
    this.terror = 0.12; this.cold = 0; this.fear = 0;
    G.uTerror.value = 0.1; G.uCold.value = 0;
  }

  _updatePlaying(dt) {
    const pl = this.player, inp = this.input, A = this.audio;
    this.sessionT += dt;
    const active = this.mode === 'playing' && !this.paused && !this.ended;
    if (this.ended && this.mode === 'playing') { this.endDelay -= dt; if (this.endDelay <= 0) this._showEnd(); }
    // ---- input-driven actions
    const typing = inp.textFocus;
    if (active && !typing) {
      if (inp.hitCode('Escape') && !inp.locked) this.pause(true);
      if (inp.hit('flashlight') && this.myState === 'alive') { this.flashlight.toggle(); A.ui(this.flashlight.on ? 'clickOn' : 'clickOff', 0.5); }
      if (inp.hit('chat') && this.net.networked) this.ui.openChat((text) => { if (text) this.net.send({ t: 'chat', text }); });
      if (inp.hitCode('F3')) this.ui.toggleDebug();
      if (this.reading && (inp.hit('interact') || inp.hit('forward') || inp.hit('back') || inp.hit('left') || inp.hit('right'))) { this.reading = null; this.ui.showNote(null); inp.pressed.delete(this.settings.bindings.interact); }
    }
    this.ui.showInventory(active && !typing && inp.down('inventory'), () => this._inventoryData());
    // ---- local player
    const downed = this.myState === 'downed', dead = this.myState === 'dead' || this.myState === 'escaped';
    pl.downed = lerp(pl.downed, downed ? 1 : 0, 1 - Math.exp(-dt * 3));
    pl.slow = this.gasFx > 0.3 ? 0.6 : 1;
    pl.injured = this.health < CONFIG.PLAYER.MAX_HEALTH ? 1 : 0;
    const frozen = !active || typing || downed || dead || !!this.reading;
    if (!dead) pl.update(active && !typing ? dt : dt, frozen ? { consumeLook: () => inp.consumeLook(), down: () => false, hit: () => false } : inp, { frozen, noLook: !active || typing });
    else this._spectate(dt);
    // ---- interpolation clock
    if (this.snapT >= 0) {
      const target = this.snapT - this.interp;
      this.renderT += dt;
      if (Math.abs(this.renderT - target) > 0.6) this.renderT = target; else this.renderT += (target - this.renderT) * Math.min(1, dt * 4);
    }
    // ---- monsters
    const hs = this.hvBuf.sample(this.renderT);
    this.hv.update(dt, hs);
    let shine = 0;
    const fl = this.flashlight;
    const ss = this.sfBuf.sample(this.renderT);
    if (ss && fl.on && fl.light.intensity > 5) {
      const h = this.sf.headPos(this._v1 || (this._v1 = new THREE.Vector3()));
      const to = h.clone().sub(fl.light.position); const d = to.length();
      if (d < 35) shine = clamp((to.normalize().dot(fl.dir) - 0.9) / 0.08, 0, 1) * (1 - d / 35) * this.world.lineOfSight(fl.light.position.x, fl.light.position.y, fl.light.position.z, h.x, h.y, h.z, { brushK: 0.15 });
    }
    this.sf.update(dt, ss, shine);
    this._monsterFoley(dt);
    // ---- teammates
    this._updateAvatars(dt);
    // ---- terror radius (evaluated for this player only, from their own position)
    this._terror(dt, hs);
    // ---- gas
    let gasT = 0;
    const gasU = this._gasU || (this._gasU = []); gasU.length = 0;
    for (const g of this.gas || []) {
      const [x, y, z, r, k] = g;
      gasU.push(g);
      const d = Math.hypot(x - pl.pos.x, (y - pl.pos.y - 1.2) * 1.5, z - pl.pos.z);
      if (d < r * (0.55 + 0.45 * k)) gasT = Math.max(gasT, k);
    }
    this.gasFx = lerp(this.gasFx, gasT, 1 - Math.exp(-dt * (gasT > this.gasFx ? 1.5 : 0.35)));
    this.damage = Math.max(0, this.damage - dt * 0.7);
    this.heartPulse = Math.max(0, this.heartPulse - dt * 4);
    // ---- interaction
    this._interact(dt, active && !typing && !this.reading);
    // ---- flashlight + breath + anomalies
    const walkBob = Math.sin(pl.bobT) * clamp(pl.speed / 2, 0, 1);
    fl.update(dt, this.camera, this.terror, { walkBob, gas: this.gasFx, off: dead });
    this.objViews.update(dt, this.sessionT, {
      on: fl.on, pos: fl.light.position, dir: fl.dir,
      k: fl.light.intensity / CONFIG.FLASHLIGHT.INTENSITY,
    });
    this.breath.update(dt);
    // eye/camera adaptation: a beam landing on something close floods the view, so exposure drops
    const lit = fl.on && fl.light.intensity > 5 && !dead;
    const expT = lit ? clamp(Math.pow(this._beamDistance() / 7.5, 1.3), 0.16, 1) : 1;
    this.exposure += (expT - this.exposure) * (1 - Math.exp(-dt * (expT < this.exposure ? 5 : 1.1)));
    const sawAnomaly = this.anomaly.update(dt, this.camera, this.terror);
    if (sawAnomaly && !this._anomShown) { this._anomShown = true; }
    if (!sawAnomaly) this._anomShown = false;
    // ---- network input @ 20 Hz
    this.inputT -= dt;
    if (this.inputT <= 0 && this.net && !this.ended) {
      this.inputT = 1 / CONFIG.NET.INPUT_HZ;
      this.net.send({ t: 'in', x: +pl.pos.x.toFixed(2), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(3), pitch: +pl.pitch.toFixed(3),
        viewFov: this.camera.fov, viewAspect: this.camera.aspect,
        crouch: pl.crouching, sprint: pl.sprinting, flash: fl.on && fl.light.intensity > 1, noise: +(pl.noise + (this.useId && this._stationNoisy ? 0.6 : 0)).toFixed(2),
        voice: +this.voice.voiceLevel.toFixed(2), hidden: pl.hidden, use: this.useId || null, revive: this.reviveId || null });
    }
    // ---- HUD
    this._fade(dt);
    this._hud(dt);
  }

  _spectate(dt) {
    // follow a living teammate (multiplayer) or stay where you fell
    let target = null;
    for (const a of this.avatars.values()) if (a.state === 0 || a.state === 1) { target = a; break; }
    if (!target) { this.player._camera(dt, 0); return; }
    const back = new THREE.Vector3(Math.sin(target.yaw) * 2.6, 1.0, Math.cos(target.yaw) * 2.6);
    const want = target.pos.clone().add(back).setY(target.pos.y + 2.2);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 4));
    this.camera.lookAt(target.pos.x, target.pos.y + 1.3, target.pos.z);
    this.camera.updateMatrixWorld();
    this.spectate = target.id;
  }

  _updateAvatars(dt) {
    let lightIdx = 0;
    const cam = this.camera.position;
    const sorted = [...this.avatars.values()].sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam));
    for (const a of sorted) {
      const b = this.plBufs.get(a.id);
      const s = b && b.sample(this.renderT);
      if (!s) continue;
      const before = a.pos.clone();
      a.update(dt, s, cam);
      // footsteps for teammates
      const moved = Math.hypot(a.pos.x - before.x, a.pos.z - before.z);
      if (moved < 3) {
        a.stride += moved;
        const sl = a.flags & 4 ? 1.25 : a.flags & 1 ? 0.6 : 0.8;
        if (a.stride > sl && a.state === 0) {
          a.stride = 0;
          const surf = this.world.surfaceAt(a.pos.x, a.pos.z), wd = this.world.waterAt(a.pos.x, a.pos.z);
          this.audio.footstep({ surface: surf, water: wd !== null ? Math.max(0, wd - this.world.heightAt(a.pos.x, a.pos.z)) : 0, brush: this.world.gridAt(this.world.gBrush, a.pos.x, a.pos.z), loud: a.flags & 4 ? 1 : a.flags & 1 ? 0.15 : 0.45, speed: a.speed }, { x: a.pos.x, y: a.pos.y + 0.1, z: a.pos.z });
        }
      }
      // flashlight
      if ((a.flags & 2) && a.state !== 2 && a.state !== 3 && lightIdx < this.remoteLights.length && a.pos.distanceTo(cam) < 90) {
        const L = this.remoteLights[lightIdx++];
        const hp = a.handPos(this._v2 || (this._v2 = new THREE.Vector3()));
        const cp = Math.cos(a.pitch);
        L.position.copy(hp);
        L.target.position.set(hp.x - Math.sin(a.yaw) * cp * 10, hp.y + Math.sin(a.pitch) * 10, hp.z - Math.cos(a.yaw) * cp * 10);
        L.target.updateMatrixWorld();
        L.intensity = CONFIG.FLASHLIGHT.INTENSITY * 0.8;
      }
    }
    for (; lightIdx < this.remoteLights.length; lightIdx++) this.remoteLights[lightIdx].intensity = 0;
  }

  _monsterFoley(dt) {
    const hv = this.hv, w = this.world;
    if (hv.root.visible && hv.speed > 2.2 && hv.moved < 3) {
      hv.stepAcc += hv.moved;
      if (hv.stepAcc > 1.35) { hv.stepAcc = 0; this.audio.footstep({ creature: 'hv', surface: w.surfaceAt(hv.pos.x, hv.pos.z), water: 0, brush: w.gridAt(w.gBrush, hv.pos.x, hv.pos.z), loud: hv.speed >= CONFIG.HV.CHASE * 0.8 ? 1 : 0.35, speed: hv.speed }, { x: hv.pos.x, y: hv.pos.y + 0.1, z: hv.pos.z }); }
    }
    const sf = this.sf;
    if (sf.root.visible && sf.speed > 0.6) {
      sf._acc = (sf._acc || 0) + sf.speed * dt;
      if (sf._acc > 0.9) { sf._acc = 0; const b = w.gridAt(w.gBrush, sf.pos.x, sf.pos.z); this.audio.footstep({ creature: 'sf', surface: w.surfaceAt(sf.pos.x, sf.pos.z), water: 0, brush: Math.max(0.5, b), loud: 0.2, speed: 2 }, { x: sf.pos.x, y: sf.pos.y + 0.2, z: sf.pos.z }); }
    }
  }

  _terror(dt, hs) {
    const pl = this.player;
    let d = 1e9;
    if (hs && !(hs[7] & 8)) d = Math.hypot(hs[0] - pl.pos.x, hs[1] - pl.pos.y, hs[2] - pl.pos.z);
    this.hvDist = d;
    let target = terrorAtDistance(d);
    if (this.myState === 'dead' || this.ended) target = 0;
    this.terror = target > this.terror ? Math.min(target, this.terror + dt * T.SMOOTH_IN) : Math.max(target, this.terror - dt * T.SMOOTH_OUT);
    const tr = this.terror;
    const cues = horrorCues(tr);
    this.cold = cues.cold;                                       // outer ring: subtle cold before stronger cues
    this.temp = lerp(T.BASE_TEMP_C, T.MIN_TEMP_C, smoothstep(0, 0.9, tr));
    this.critical = 0;
    this.fear = 0;
    pl.tremor = 0;
    const stam = 1 - pl.stamina / CONFIG.PLAYER.STAMINA_MAX;
    this.exert = clamp(Math.max(stam * 1.1, pl.sprinting ? 0.6 : 0), 0, 1);
    G.uTerror.value = 0; G.uCold.value = this.cold;
  }

  // distance along the flashlight beam to the first thing it lights (terrain, trunks, thick brush, bodies)
  _beamDistance() {
    const fl = this.flashlight, w = this.world, p = fl.light.position, d = fl.dir;
    const tmp = this._qtmp || (this._qtmp = []);
    const bodies = this._bodies || (this._bodies = []); bodies.length = 0;
    if (this.hv.root.visible) bodies.push([this.hv.pos.x, this.hv.pos.y, this.hv.pos.z, this.hv.flags & 16 ? 0.7 : 0.4, this.hv.flags & 16 ? 0.95 : 1.95]);
    if (this.sf.root.visible) bodies.push([this.sf.pos.x, this.sf.pos.y, this.sf.pos.z, 0.55 * CONFIG.SF.MODEL_SCALE, CONFIG.SF.MODEL_SCALE]);
    for (const a of this.avatars.values()) if (a.root.visible) bodies.push([a.pos.x, a.pos.y, a.pos.z, 0.35, 1.8]);
    for (let k = 1; k < 48; k++) {
      const t = k * 0.3, x = p.x + d.x * t, y = p.y + d.y * t, z = p.z + d.z * t;
      const g = w.heightAt(x, z);
      if (y < g + 0.02) return t;
      for (const b of bodies) if (Math.hypot(x - b[0], z - b[2]) < b[3] && y > b[1] && y < b[1] + b[4]) return t;
      if (y - g < 1.5 && w.gridAt(w.gBrush, x, z) > 0.7) return t + 0.6;
      if (k % 2 === 0) for (const r of w.queryColliders(x, z, 0.2, tmp)) if (r < 100000) { const c = w.circles[r]; if (Math.hypot(x - c[0], z - c[1]) < c[2] + 0.05) return t; }
    }
    return 14.4;
  }

  _exhale(vol) {
    if (this.mode !== 'playing') return;
    const t = this.temp ?? T.BASE_TEMP_C;
    const k = clamp((7 - t) / 9, 0, 1) * (0.6 + 0.4 * clamp(vol * 2, 0, 1));
    const lit = this.flashlight.on ? 1 : 0.2;
    if (k > 0.04 && this.myState !== 'dead') this.breath.puff(this.camera, k, lit);
  }

  // ---------------------------------------------------------------- interaction
  _interact(dt, active) {
    const pl = this.player, inp = this.input, L = this.info.layout;
    this.useId = null; this.reviveId = null; this._stationNoisy = false;
    let best = null, bd = 1e9;
    if (active && this.myState === 'alive') {
      const f = this.camera.getWorldDirection(this._v5 || (this._v5 = new THREE.Vector3()));
      const eye = this.camera.position;
      const consider = (x, y, z, r, o) => {
        const dx = x - pl.pos.x, dz = z - pl.pos.z, dh = Math.hypot(dx, dz);
        if (dh > r || Math.abs(y - pl.pos.y) > 2.2) return;
        const to = new THREE.Vector3(x - eye.x, y - eye.y, z - eye.z).normalize();
        const facing = dh < 0.9 ? 1 : to.dot(f);
        if (facing < 0.35) return;
        const score = dh - facing;
        if (score < bd) { bd = score; best = o; }
      };
      for (const [id, it] of this.objViews.items) if (!it.held) consider(it.def.x, it.y + 0.1, it.def.z, it.def.wall ? 2.4 : 2.1, { type: 'pickup', id, it });
      for (const [id, s] of this.objViews.stations) if (!s.done) consider(s.def.x, s.def.y + 0.6, s.def.z, 2.5, { type: 'station', id, s });
      for (const a of this.avatars.values()) if (a.state === 1) consider(a.pos.x, a.pos.y + 0.3, a.pos.z, 2.2, { type: 'revive', id: a.id, a });
    }
    let prompt = null, prog = null;
    const key = this.settings.keyName(this.settings.bindings.interact);
    if (best) {
      if (best.type === 'pickup') {
        const it = best.it.def;
        prompt = `<b>${key}</b> ${it.kind === 'note' ? 'Read' : 'Pick up'} ${it.name.toLowerCase()}`;
        if (inp.hit('interact')) this.net.send({ t: 'act', a: 'pickup', id: best.id });
      } else if (best.type === 'station') {
        const s = best.s.def;
        const missing = this._missing(s);
        if (missing.length) prompt = `<span class="dim">${s.name} — ${missing.join(', ')}</span>`;
        else {
          prompt = `Hold <b>${key}</b> ${s.name.toLowerCase()}`;
          if (inp.down('interact')) { this.useId = best.id; this._stationNoisy = s.kind !== 'relay'; prog = best.s.prog || 0; this._workSound(dt, s); }
          else if (best.s.prog > 0) prog = best.s.prog;
        }
      } else if (best.type === 'revive') {
        const row = this.plBufs.get(best.id) && this.plBufs.get(best.id).latest();
        prompt = `Hold <b>${key}</b> to revive ${this._name(best.id)}`;
        if (inp.down('interact')) { this.reviveId = best.id; prog = row ? row[9] : 0; }
      }
    }
    if (this.myState === 'downed' && this.me) { prompt = `<span class="warn">Bleeding out — ${Math.ceil(this.me[10])}s</span>`; prog = this.me[9] > 0 ? this.me[9] : null; }
    this.ui.prompt(prompt); this.ui.progress(prog);
  }

  _missing(s) {
    const out = [];
    for (const n of s.needs) {
      if (n === 'fuel' && !this.team.fuel) out.push('needs the gas can');
      else if (n === 'fuse' && !this.team.fuse) out.push('needs the fuse kit');
      else if ((n === 'gen' || n === 'relay') && !(this.objViews.stations.get(n) || {}).done) out.push(n === 'gen' ? 'no power (generator)' : 'relay box is dead');
    }
    return [...new Set(out)];
  }

  _workSound(dt, s) {
    this._workT = (this._workT || 0) - dt;
    if (this._workT > 0) return;
    this._workT = s.kind === 'generator' ? 1.6 : s.kind === 'relay' ? 0.9 : 1.3;
    this.audio.at('work_' + (s.kind === 'generator' ? 'gen' : s.kind === 'relay' ? 'relay' : 'mast'), { x: s.x, y: s.y + 0.6, z: s.z }, { gain: 0.9, ref: 3 });
  }

  // ---------------------------------------------------------------- HUD
  _objectiveLines() {
    const L = this.info.layout, out = [];
    if (!this.notesRead.includes('memo')) out.push({ text: 'Read the maintenance memo on the trailhead kiosk', done: false });
    for (const s of L.stations) {
      const v = this.objViews.stations.get(s.id), done = v && v.done;
      let sub = s.where;
      if (!done && s.id === 'gen') sub += this.team.fuel ? ' · gas can ✓' : ' · find the gas can';
      if (!done && s.id === 'relay') sub += this.team.fuse ? ' · fuse kit ✓' : ' · find the fuse kit';
      out.push({ text: s.name, sub, done });
    }
    if (this.extractOpen) out.push({ text: 'Get to the highway bridge — a county unit is waiting', done: false, urgent: true });
    return out;
  }

  _inventoryData() {
    return {
      objectives: this._objectiveLines(),
      team: this.team, battery: this.flashlight.battery, temp: this.temp ?? T.BASE_TEMP_C,
      notes: this.notesRead.map((id) => NOTES.find((n) => n.id === id)).filter(Boolean),
      time: this.sessionT,
    };
  }

  _hud(dt) {
    const pl = this.player;
    if (this._objectivesDirty) { this._objectivesDirty = false; this.ui.objectives(this._objectiveLines()); }
    this.ui.meters(pl.stamina / CONFIG.PLAYER.STAMINA_MAX, this.flashlight.battery, this.flashlight.on);
    this._teamT = (this._teamT || 0) - dt;
    if (this._teamT <= 0) {
      this._teamT = 0.25;
      const list = [];
      if (this.net && this.net.networked) {
        list.push({ id: this.myId, name: this._name(this.myId), state: this.myState, me: true, talking: this.voice.transmitting, color: this._colorOf(this.myId) });
        for (const a of this.avatars.values()) list.push({ id: a.id, name: a.name, state: PST[a.state], talking: this.voice.isSpeaking(a.id) || !!(a.flags & 16), color: this._colorOf(a.id) });
      }
      this.ui.team(list);
      if (this.ui.debugOn) {
        const hs = this.hvBuf.latest(), ss = this.sfBuf.latest(), r = this.renderer.gl.info.render;
        this.ui.debug([
          `${this.fps.toFixed(0)} fps · ${this.frameMs.toFixed(1)} ms · scale ${this.renderer.dynScale.toFixed(2)} · calls ${r.calls} · tris ${(r.triangles / 1e6).toFixed(2)}M`,
          `pos ${pl.pos.x.toFixed(1)}, ${pl.pos.z.toFixed(1)} · trail ${this.world.trailAlongAt(pl.pos.x, pl.pos.z).toFixed(0)} m · surf ${pl.surface} · brush ${pl.inBrush.toFixed(2)}${pl.hidden ? ' · HIDDEN' : ''}`,
          `HV ${hs ? HV_STATES[hs[10]] : '-'} ${this.hvDist < 1e8 ? this.hvDist.toFixed(0) + ' m' : ''} · SF6 ${ss ? SF_STATES[ss[8]] : '-'} · phase ${this.phase || '-'}`,
          `terror ${this.terror.toFixed(2)} · fear ${this.fear.toFixed(2)} · ${this.temp?.toFixed(1)}°C · gas ${this.gasFx.toFixed(2)} · voice ${this.voice.voiceLevel.toFixed(2)} · phrases ${this.voice.phrases.length}`,
        ].join('<br>'));
      }
    }
  }

  _fade(dt) {
    if (this.sessionT < 0.2) this.fade = 1;
    this.fade = lerp(this.fade, this.fadeTarget ?? 0, 1 - Math.exp(-dt * (this.ended ? 0.8 : 0.9)));
  }

  // ---------------------------------------------------------------- render
  _render(dt) {
    const env = this.env, fl = this.flashlight, ml = env.moonLight;
    const gas = this._gasU || [];
    this.renderer.exposure = this.mode === 'playing' || this.mode === 'ended' ? this.exposure : 1;
    this.renderer.render(this.scene, this.camera, (u) => {
      u.tFrost.value = this.bank.tex.frost;
      const sm = ml.shadow && ml.shadow.map;
      u.tMoonShadow.value = sm ? sm.depthTexture : null;
      u.uShadowOn.value = sm && sm.depthTexture ? 1 : 0;
      if (sm) u.uShadowMatrix.value.copy(ml.shadow.matrix);
      u.uFlashPos.value.copy(fl.light.position);
      u.uFlashDir.value.copy(fl.dir);
      u.uFlashCos.value.set(Math.cos(fl.light.angle), Math.cos(fl.light.angle * (1 - fl.light.penumbra)));
      u.uFlashI.value = fl.light.intensity / CONFIG.FLASHLIGHT.INTENSITY;
      u.uFlashRange.value = fl.light.distance;
      const playing = this.mode === 'playing' || this.mode === 'ended';
      u.uExposure.value = playing ? this.exposure : 1;
      u.uTerrorFx.value = 0; u.uCold.value = this.cold; u.uFear.value = 0;
      u.uHeart.value = 0;
      u.uDamage.value = this.damage; u.uDowned.value = playing ? this.player.downed : 0;
      u.uGasFx.value = this.gasFx;
      u.uFade.value = playing ? clamp(this.fade, 0, 1) : 0;
      u.uGrain.value = this.settings.filmGrain;
      u.uAberration.value = this.critical * 0.9 * this.settings.cameraShake + this.damage * 0.5;
      u.uAnomaly.value = this.critical * this.settings.cameraShake;
      u.uGasCount.value = Math.min(4, gas.length);
      for (let i = 0; i < 4; i++) {
        const g = gas[i];
        if (g) u.uGas.value[i].set(g[0], g[1] + 0.6, g[2], g[3] * (0.55 + 0.45 * g[4]));
        else u.uGas.value[i].set(0, -999, 0, 0);
      }
    });
  }

  _perf(ms, dt) {
    this.fpsAcc += dt; this.fpsN++;
    this.frameMs = lerp(this.frameMs, ms, 0.05);
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      if (this.settings.showFps && !this.ui.debugOn) this.ui.debug(`${this.fps.toFixed(0)} fps`);
      if (this.settings.adaptiveRes && !this.opts.manual && this.mode === 'playing') {
        const r = this.renderer;
        let s = r.dynScale;
        if (this.fps < 40) s = Math.max(0.55, s - 0.1); else if (this.fps > 57 && s < 1) s = Math.min(1, s + 0.05);
        if (Math.abs(s - r.dynScale) > 0.01) { r.dynScale = s; r.resize(); }
      }
    }
  }

  // ---------------------------------------------------------------- test helpers
  teleport(along, side = 0, faceAlong = true) {
    const w = this.world, p = pointAtDistance(w.trail, w.trailCum, along);
    const x = p.x + Math.cos(p.dir) * side, z = p.z - Math.sin(p.dir) * side;
    this.player.spawn(x, z, faceAlong ? Math.atan2(-Math.sin(p.dir), -Math.cos(p.dir)) : this.player.yaw);
    this.flashlight.snap(this.camera);
  }
  look(yaw, pitch) { this.player.yaw = yaw; this.player.pitch = pitch; this.player._camera(0, 0); this.flashlight.snap(this.camera); }
  // place the player at x,z facing a point (also moves the in-browser sim's copy, which rejects >12 m jumps)
  tp(x, z, lookX, lookZ, pitch = -0.1) {
    const yaw = lookX === undefined ? this.player.yaw : Math.atan2(-(lookX - x), -(lookZ - z));
    this.player.spawn(x, z, yaw); this.player.pitch = pitch; this.player._camera(0, 0); this.flashlight.snap(this.camera);
    const sp = this.sim && this.sim.players.get(this.myId);
    if (sp) { sp.x = x; sp.z = z; sp.y = this.player.pos.y; sp.lastX = x; sp.lastZ = z; }
  }
  get sim() { return this.net && this.net.sim; }
}
