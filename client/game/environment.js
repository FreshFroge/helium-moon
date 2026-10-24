// Assembles the refuge scene: sky, moonlight with following shadow cascade,
// terrain, forest, undergrowth, water and props; keeps per-frame systems updated.
import * as THREE from 'three';
import { Sky } from '../render/sky.js';
import { Terrain } from '../render/terrain.js';
import { TreeSystem } from '../render/trees.js';
import { Foliage } from '../render/foliage.js';
import { Water } from '../render/water.js';
import { Props } from '../render/props.js';
import { G } from '../render/shaderlib.js';

export class Environment {
  constructor(world, bank, renderer, preset, progress = () => {}) {
    this.world = world; this.bank = bank; this.renderer = renderer; this.preset = preset;
    const scene = this.scene = new THREE.Scene();
    this.sky = new Sky(bank);
    scene.add(this.sky.mesh);
    const moon = this.moonLight = new THREE.DirectionalLight(0x9fb4e0, 1.1);
    moon.castShadow = true;
    moon.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
    const sd = preset.shadowDist;
    Object.assign(moon.shadow.camera, { left: -sd, right: sd, top: sd, bottom: -sd, near: 1, far: 420 });
    scene.add(moon); scene.add(moon.target);
    this.hemi = new THREE.HemisphereLight(0x2a3a58, 0x0d0c0a, 0.22);
    scene.add(this.hemi);
    progress('Planting trees');
    this.terrain = new Terrain(world, bank, preset.label.toLowerCase());
    scene.add(this.terrain.group);
    this.trees = new TreeSystem(world, bank, preset);
    scene.add(this.trees.group);
    progress('Growing undergrowth');
    this.foliage = new Foliage(world, bank, preset, this.trees);
    scene.add(this.foliage.group);
    this.water = new Water(world, bank);
    scene.add(this.water.group);
    this.props = new Props(world, bank);
    scene.add(this.props.group);
    this.pmrem = new THREE.PMREMGenerator(renderer.gl);
    this.skyScene = new THREE.Scene();
    this.skyEnvMesh = new THREE.Mesh(this.sky.mesh.geometry, this.sky.material);
    this.skyScene.add(this.skyEnvMesh);
    this.envTimer = 0;
    this.updateEnvMap();
    this.moonVis = 1;
    this._fwd = new THREE.Vector3(); this._lightRot = new THREE.Matrix4(); this._inv = new THREE.Matrix4();
  }

  updateEnvMap() {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 5000);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  update(dt, camera, terror = 0) {
    const cp = camera.position;
    this.moonVis = this.sky.update(dt, cp, terror);
    const sd = this.preset.shadowDist;
    const md = this.sky.moonDir;
    const fwd = this._fwd; camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const center = cp.clone().addScaledVector(fwd, sd * 0.45);
    const texel = (sd * 2) / this.preset.shadowMap;
    const lightRot = this._lightRot.lookAt(new THREE.Vector3(), md.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = this._inv.copy(lightRot).invert();
    const lc = center.clone().applyMatrix4(inv);
    lc.x = Math.round(lc.x / texel) * texel; lc.y = Math.round(lc.y / texel) * texel;
    center.copy(lc.applyMatrix4(lightRot));
    this.moonLight.position.copy(center).addScaledVector(md, 200);
    this.moonLight.target.position.copy(center);
    this.moonLight.target.updateMatrixWorld();
    this.moonLight.intensity = 1.1 * this.moonVis;
    this.hemi.intensity = 0.16 + 0.08 * this.moonVis;
    this.terrain.update(cp);
    this.trees.update(camera);
    this.foliage.update(camera);
    this.props.update(dt, G.uTime.value);
    this.envTimer += dt;
    if (this.envTimer > 25) { this.envTimer = 0; this.updateEnvMap(); }
  }
}
