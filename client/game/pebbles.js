// The server supplies the collision-tested flight; every client draws that same
// arc. No local landing prediction can invent a distraction through a tree.
import * as THREE from 'three';
import { patchMaterial } from '../render/shaderlib.js';
import { groundAt } from '../../shared/physics.js';

export class PebbleViews {
  constructor(scene,world) {
    this.scene=scene;this.world=world;this.active=new Map();this.pool=[];
    this.geometry=new THREE.IcosahedronGeometry(1,1);
    this.material=patchMaterial(new THREE.MeshStandardMaterial({color:0xaaa49a,roughness:1}),{key:'thrownPebble'});
    for(let i=0;i<18;i++){
      const mesh=new THREE.Mesh(this.geometry,this.material);
      mesh.scale.set(.038,.027,.032);mesh.visible=false;scene.add(mesh);
      this.pool.push({mesh,id:null,age:0,settled:0,flight:null});
    }
  }

  spawn(data,age=0) {
    if(!data?.flight?.length)return;
    let item=this.active.get(data.id);
    if(item){if(Math.abs(item.age-age)>.25)item.age=Math.max(0,age);return;}
    item=this.pool.find(p=>p.id===null)||this.pool.reduce((a,b)=>a.age>b.age?a:b);
    if(item.id!==null)this.active.delete(item.id);
    Object.assign(item,{id:data.id,age:Math.max(0,age),settled:0,flight:data.flight,duration:data.duration});
    item.mesh.visible=true;this.active.set(data.id,item);this._pose(item);
  }

  sync(list,time) {
    for(const p of list||[])if(!this.active.has(p.id))this.spawn(p,Math.max(0,time-p.startedAt));
  }

  impact(id,position,kind) {
    const p=this.active.get(id);if(!p)return;
    p.age=Math.max(p.age,p.duration);p.settled=0;
    p.mesh.position.set(position.x,position.y,position.z);p.mesh.visible=true;
    p.flight=null;
    const water=this.world.waterAt(position.x,position.z),ground=groundAt(this.world,position.x,position.z);
    if(water!==null&&water>ground+.02){p.mesh.visible=false;p.settled=9.9;}
    else if(kind==='solid'||position.y-ground>.12)p.settled=9.85;
  }

  _pose(p) {
    const f=p.flight;if(!f)return;
    let i=1;while(i<f.length-1&&f[i][0]<p.age)i++;
    const a=f[Math.max(0,i-1)],b=f[i]||a,t=Math.min(1,Math.max(0,(p.age-a[0])/(b[0]-a[0]||1)));
    p.mesh.position.set(a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t);
    p.mesh.rotation.set(p.age*12,p.age*7,p.age*5);
  }

  update(dt) {
    for(const p of this.active.values()){
      p.age+=dt;
      if(p.flight&&p.age<=p.duration)this._pose(p);
      else{
        // Only an authoritative impact can leave a stone on the ground. A
        // range-limited flight must not turn into a floating stationary pebble.
        if(p.flight){p.mesh.visible=false;p.flight=null;p.settled=9;}
        p.settled+=dt;
        if(p.settled>10){p.mesh.visible=false;this.active.delete(p.id);p.id=null;}
      }
    }
  }

  clear() {
    this.active.clear();for(const p of this.pool){p.mesh.visible=false;p.id=null;p.flight=null;}
  }
}
