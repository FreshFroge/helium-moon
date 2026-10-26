// Server-owned ballistic pebbles. The client supplies aim, never an impact point.
// Sphere sweeps use the same solid trunk/log/structure colliders as character
// physics, including finite tops for logs and boxes, plus terrain/decks/water.
import {CONFIG} from './config.js';
import {clamp} from './math.js';
import {groundAt} from './physics.js';

const C=CONFIG.PEBBLE;
const round=v=>+v.toFixed(3);

function surfaceAt(world,x,z){
  return Math.max(groundAt(world,x,z),world.waterAt?.(x,z)??-Infinity);
}

function solidAt(world,p,refs){
  if(p.y<=surfaceAt(world,p.x,p.z)+C.RADIUS)return 'ground';
  if(!world.queryColliders)return null;
  for(const ref of world.queryColliders(p.x,p.z,C.RADIUS,refs)){
    if(ref<100000){
      const c=world.circles[ref];
      if(Math.hypot(p.x-c[0],p.z-c[1])<=c[2]+C.RADIUS)return 'solid';
    }else if(ref<200000){
      const s=world.segs[ref-100000];
      if(p.y-C.RADIUS>s[5])continue;
      const dx=s[2]-s[0],dz=s[3]-s[1],length2=dx*dx+dz*dz||1e-9;
      const t=clamp(((p.x-s[0])*dx+(p.z-s[1])*dz)/length2,0,1);
      if(Math.hypot(p.x-s[0]-dx*t,p.z-s[1]-dz*t)<=s[4]+C.RADIUS)return 'solid';
    }else{
      const b=world.boxes[ref-200000];
      if(p.y-C.RADIUS>b[5])continue;
      const c=Math.cos(b[4]),s=Math.sin(b[4]),dx=p.x-b[0],dz=p.z-b[1];
      if(Math.abs(dx*c-dz*s)<=b[2]+C.RADIUS&&Math.abs(dx*s+dz*c)<=b[3]+C.RADIUS)return 'solid';
    }
  }
  return null;
}

// Returns sampled flight and the first physical contact, or hit:false if the
// safety envelope expires in the air. No fabricated landing at a range limit.
export function tracePebble(world,origin,yaw,pitch){
  if(![origin.x,origin.y,origin.z,yaw,pitch].every(Number.isFinite))return null;
  pitch=clamp(pitch,-1.45,1.45);yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  const vx=-Math.sin(yaw)*Math.cos(pitch)*C.SPEED,vz=-Math.cos(yaw)*Math.cos(pitch)*C.SPEED;
  const vy=Math.sin(pitch)*C.SPEED+C.UP_BOOST;
  const at=t=>({x:origin.x+vx*t,y:origin.y+vy*t-C.GRAVITY*t*t*.5,z:origin.z+vz*t});
  const sample=(t,p)=>[round(t),round(p.x),round(p.y),round(p.z)];
  const refs=[],flight=[sample(0,origin)];
  let previous={...origin},previousT=0,lastSample=0;
  const initial=solidAt(world,origin,refs);
  if(initial)return{flight:[...flight,sample(.001,origin)],duration:.001,hit:true,kind:initial,impact:{...origin}};
  // The .04m substep is smaller than the pebble diameter, so even thin fence
  // colliders between the 60Hz ballistic samples are tested along the sweep.
  for(let frame=1;frame<=Math.ceil(C.MAX_FLIGHT*60);frame++){
    const time=Math.min(frame/60,C.MAX_FLIGHT),point=at(time);
    const steps=Math.max(1,Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y,point.z-previous.z)/.04));
    const frameStart=previousT;
    for(let step=1;step<=steps;step++){
      const t=frameStart+(time-frameStart)*step/steps,p=at(t);
      const distance=Math.hypot(p.x-origin.x,p.z-origin.z);
      if(distance>C.MAX_RANGE){
        const last=at(previousT);flight.push(sample(previousT,last));
        return{flight,duration:round(previousT),hit:false,kind:'range',impact:last};
      }
      const kind=solidAt(world,p,refs);
      if(kind){
        let lo=previousT,hi=t;
        for(let i=0;i<9;i++){const mid=(lo+hi)*.5;if(solidAt(world,at(mid),refs))hi=mid;else lo=mid;}
        const impact=at(hi);flight.push(sample(hi,impact));
        return{flight,duration:round(hi),hit:true,kind,impact:{x:round(impact.x),y:round(impact.y),z:round(impact.z)}};
      }
      previous=p;previousT=t;
    }
    if(time-lastSample>=.05-1e-8){flight.push(sample(time,point));lastSample=time;}
  }
  const last=at(C.MAX_FLIGHT);flight.push(sample(C.MAX_FLIGHT,last));
  return{flight,duration:C.MAX_FLIGHT,hit:false,kind:'time',impact:last};
}
