// Objectives, items and notes. Locations are randomised every session.
import { CONFIG } from '../config.js';
import { pointAtDistance } from '../math.js';

export const NOTES = [
  { id: 'memo', title: 'Maintenance memo (kiosk)', text: 'TO: Refuge staff\nRepeater at the old mast is on backup only. If the main line goes down:\n1. Start the backup generator (gas can in the truck or the shed).\n2. Swap the blown fuse in the trail relay box - spares are in the orange kit.\n3. Key the emergency channel from the cabinet at the base of the mast.\nThe county will send a unit to the highway bridge.\n- R. Okafor, Parks' },
  { id: 'ranger', title: 'Ranger log, Oct 14', text: 'Third report this month of a man in a red shirt standing out past the slough after closing. Same description every time. Yellow swim cap. Glasses. Green shoes. Didn\'t answer.\nWhen Dale put the light on him he just... stepped behind a sycamore.\nHe wasn\'t there when Dale walked over. The ground was frozen where he stood. In October.' },
  { id: 'birder', title: 'Torn page from a birding notebook', text: 'No owls tonight. No frogs. Insects stopped at 9:52 exactly.\nThe air went cold like opening a freezer.\nSomething on the far bank laughing in a voice like a kid sucking on a balloon.\nI am not going back for the scope.' },
  { id: 'camp', title: 'Note pinned to the tent', text: 'MASON - if you find this we went back to the cars.\nTyler says he heard you calling from the woods but it wasn\'t you.\nIt sounded like you but higher. It said what you said at dinner.\nDON\'T ANSWER IT.' },
  { id: 'hunter', title: 'Hunter\'s scrawl', text: 'Saw a skunk the size of a dog in the cattails by the south ponds.\nBlack and white but wrong. Too many eyes.\nSmelled like a struck match. When it stood up the air turned to soup and I couldn\'t tell which way the truck was.\nMy dog won\'t go near the water now.' },
  { id: 'grandpa', title: 'Scrap of paper', text: 'Helium Moon tonight.\nGrandpa said on those nights you don\'t talk in the woods.\nIt listens. It learns your voice.\nThen it uses it.' },
];

export class Objectives {
  constructor(sim) { this.sim = sim; this.world = sim.world; this.rng = sim.rng; }

  setup() {
    const w = this.world, rng = this.rng, P = w.poi;
    const stationAt = (poiKey, ox, oz) => {
      const s = w.structures.find((o) => o.type === poiKey) || P[poiKey];
      const rot = s.rot || 0, c = Math.cos(rot), sn = Math.sin(rot);
      const x = s.x + ox * c + oz * sn, z = s.z - ox * sn + oz * c;
      return { x, z, y: w.heightAt(x, z), rot };
    };
    const genPoi = rng.pick(['pumphouse', 'shed']);
    const relayPoi = rng.pick(['blind', 'bench', 'fishing', 'footbridge']);
    // The shed has solid building collision; place equipment outside its front
    // wall so it can be seen and worked on without interacting through timber.
    const genPos = genPoi === 'pumphouse' ? stationAt('pumphouse', 0.6, 2.6) : stationAt('shed', 1.2, 3.0);
    // The mapped overlook bench is in the river channel. Mount its relay on
    // the dry, trail-facing bank nearby rather than below the water surface.
    const relayPos = relayPoi === 'footbridge' ? stationAt('footbridge', 2.0, 7.5)
      : relayPoi === 'blind' ? stationAt('blind', 2.6, 0.5)
      : relayPoi === 'bench' ? stationAt('bench', -1.0, 12.0)
      : stationAt(relayPoi, 1.6, -0.4);
    const mastPos = stationAt('mast', 1.8, 1.2);
    this.stations = [
      { id: 'gen', kind: 'generator', name: 'Start the backup generator', where: genPoi === 'pumphouse' ? 'Old Pump House' : 'Ranger Maintenance Shed', needs: ['fuel'], hold: 10, noisy: true, ...genPos, done: false, prog: 0 },
      { id: 'relay', kind: 'relay', name: 'Replace the fuse in the trail relay box', where: { blind: 'Pond Wildlife Blind', bench: 'River Bend Overlook', fishing: 'Fishing Bank', footbridge: 'Slough Footbridge' }[relayPoi], needs: ['fuse'], hold: 7, noisy: false, ...relayPos, done: false, prog: 0 },
      { id: 'mast', kind: 'transmitter', name: 'Send the distress call from the repeater mast', where: 'Old Repeater Mast', needs: ['gen', 'relay'], hold: 12, noisy: true, ...mastPos, done: false, prog: 0 },
    ];
    const hw = P.highway;
    this.extract = { x: hw.x + 6, z: hw.z + 10, y: w.heightAt(hw.x + 6, hw.z + 10), r: CONFIG.SESSION.EXTRACT_RADIUS };
    this.extractOpen = false;
    // item spots near landmarks
    const spots = [];
    const near = (key, ox, oz, label) => { const s = w.structures.find((o) => o.type === key); if (s) { const p = stationAt(key, ox, oz); spots.push({ ...p, label }); } };
    near('camp', -0.4, 1.2, 'camp'); near('shed', -1.8, 3.0, 'shed'); near('pumphouse', -2.3, 0.6, 'pumphouse');
    near('blind', -1.0, 1.9, 'blind'); near('fishing', 0.8, 0.9, 'fishing'); near('bench', 1.4, 12.0, 'overlook');
    near('car', 1.4, 0, 'car'); near('kiosk', 0.8, 1.0, 'kiosk');
    for (let k = 0; k < 12; k++) {
      for (let t = 0; t < 20; t++) {
        const p = pointAtDistance(w.trail, w.trailCum, rng.range(60, w.trailLength - 60));
        const a = rng.range(0, Math.PI * 2), d = rng.range(3, 12);
        const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
        if (w.isPlayable(x, z) && w.navWalkable(x, z) && w.waterAt(x, z) === null) { spots.push({ x, z, y: w.heightAt(x, z), rot: rng() * 6.28, label: 'trail' }); break; }
      }
    }
    rng.shuffle(spots);
    const take = (pred) => { const i = spots.findIndex(pred); return i >= 0 ? spots.splice(i, 1)[0] : spots.shift(); };
    this.items = [];
    const fuelSpot = take((s) => s.label !== (genPoi === 'pumphouse' ? 'pumphouse' : 'shed') && s.label !== 'kiosk');
    this.items.push({ id: 'fuel', kind: 'fuel', name: 'Gas can', ...fuelSpot, holder: null });
    const fuseSpot = take((s) => s.label !== 'kiosk' && s.label !== 'car');
    this.items.push({ id: 'fuse', kind: 'fuse', name: 'Orange fuse kit', ...fuseSpot, holder: null });
    for (let k = 0; k < 5; k++) { const s = take((s) => s.label === 'trail') || take(() => true); if (s) this.items.push({ id: 'bat' + k, kind: 'battery', name: 'Batteries', ...s, holder: null }); }
    // notes: the maintenance memo always sits on the kiosk; three of the others are scattered
    const kiosk = w.structures.find((o) => o.type === 'kiosk');
    const kp = stationAt('kiosk', 0, 0.45);
    this.items.push({ id: 'note_memo', kind: 'note', note: 'memo', name: NOTES[0].title, x: kp.x, z: kp.z, y: kp.y + 1.2, rot: kiosk.rot, holder: null, wall: true });
    const others = rng.shuffle(NOTES.slice(1)).slice(0, 3);
    for (const n of others) { const s = (n.id === 'camp' && take((s) => s.label === 'camp')) || take(() => true); if (s) this.items.push({ id: 'note_' + n.id, kind: 'note', note: n.id, name: n.title, ...s, holder: null }); }
    this.team = { fuel: false, fuse: false };
    this.notesRead = [];
  }

  doneCount() { return this.stations.filter((s) => s.done).length; }

  canUse(s) {
    return s.needs.every((n) => (n === 'fuel' || n === 'fuse') ? this.team[n] : this.stations.find((x) => x.id === n)?.done);
  }

  missing(s) {
    const out = [];
    for (const n of s.needs) {
      if (n === 'fuel' && !this.team.fuel) out.push('Needs the gas can');
      else if (n === 'fuse' && !this.team.fuse) out.push('Needs the fuse kit');
      else if (n !== 'fuel' && n !== 'fuse' && !this.stations.find((x) => x.id === n)?.done) out.push('No power to the repeater yet');
    }
    return out;
  }

  // per-tick interaction processing; returns true while noisy work is happening
  update(dt) {
    const sim = this.sim;
    let noisy = false;
    for (const s of this.stations) {
      if (s.done) continue;
      let working = null;
      for (const p of sim.playerList) {
        if (p.state !== 'alive' || p.use !== s.id) continue;
        if (Math.hypot(p.x - s.x, p.z - s.z) > 2.8 || !this.canUse(s)) continue;
        working = p; break;
      }
      if (working) {
        s.prog = Math.min(1, s.prog + dt / s.hold);
        if (s.noisy) { working.interactNoise = true; noisy = true; }
        if (s.prog >= 1) {
          s.done = true;
          sim.emit({ type: 'objective', id: s.id, pid: working.id, name: s.name });
          if (s.id === 'mast') { this.extractOpen = true; sim.state = 'extract'; sim.emit({ type: 'extract_open' }); }
        }
      } else s.prog = Math.max(0, s.prog - dt * 0.02); // progress is mostly kept
    }
    return noisy;
  }

  pickup(p, id) {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.holder) return false;
    if (Math.hypot(p.x - it.x, p.z - it.z) > 2.6) return false;
    it.holder = p.id;
    if (it.kind === 'fuel' || it.kind === 'fuse') this.team[it.kind] = true;
    if (it.kind === 'note') this.notesRead.push(it.note);
    this.sim.emit({ type: 'pickup', id, kind: it.kind, pid: p.id, note: it.note || null });
    return true;
  }

  snapshot() {
    return {
      st: this.stations.map((s) => [s.id, s.done ? 1 : 0, +s.prog.toFixed(3)]),
      it: this.items.filter((i) => i.holder).map((i) => i.id),
      team: this.team, ex: this.extractOpen,
    };
  }

  // static layout sent once at session start
  layout() {
    return {
      stations: this.stations.map(({ id, kind, name, where, needs, hold, x, y, z, rot }) => ({ id, kind, name, where, needs, hold, x, y, z, rot })),
      items: this.items.map(({ id, kind, name, note, x, y, z, rot, wall }) => ({ id, kind, name, note, x, y, z, rot, wall })),
      extract: this.extract,
    };
  }
}
