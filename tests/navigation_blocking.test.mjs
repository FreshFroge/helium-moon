import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../shared/world.js';

function forestCell(trunk=.6,brush=.5){
  const n=25,w=Object.create(World.prototype);
  Object.assign(w,{gw:5,gh:5,minX:0,minZ:0,highway:{z:-100,halfW:1},
    gField:new Float32Array(n),gOutDist:new Float32Array(n),gBrush:new Float32Array(n),gTrunk:new Float32Array(n),
    waterAt:()=>null,deckAt:()=>null,heightAt:()=>0});
  w.gTrunk[12]=trunk;w.gBrush[12]=brush;w._navigation();return w;
}

test('brush around a solid large trunk never makes its cell traversable',()=>{
  for(const brush of [.01,.5,1]){
    const w=forestCell(.6,brush);
    assert.equal(w.navWalkable(4,4),false,`large trunk with brush ${brush}`);
  }
});

test('the real pathfinder routes around the blocked trunk cell',()=>{
  const w=forestCell();const route=w.findPath(0,4,8,4);
  assert.ok(route && route.length>2,'straight shortcut through the trunk is forbidden');
  for(let i=1;i<route.length;i++){
    const [ax,az]=route[i-1],[bx,bz]=route[i];
    for(let k=0;k<=20;k++)assert.ok(w.navWalkable(ax+(bx-ax)*k/20,az+(bz-az)*k/20));
  }
});

test('ordinary brush remains traversable with a movement cost',()=>{
  const w=forestCell(.2,1);
  assert.equal(w.navWalkable(4,4),true);
  assert.ok(w.navCost[12]>w.navCost[11],'brush still costs more than open ground');
});

test('shortcut checks reject exact blocked corners in both directions',()=>{
  const w=forestCell();
  assert.equal(w._straightWalkable([0,4],[6,2]),false);
  assert.equal(w._straightWalkable([6,2],[0,4]),false);
  assert.equal(w._straightWalkable([0,0],[8,0]),true);
  assert.equal(w._straightWalkable([0,4],[8,4]),false);
  assert.equal(w._straightWalkable([0,0],[0,0]),true);
  assert.equal(w._straightWalkable([4,4],[4,4]),false);
});

test('clear shortcuts stay traversable along their whole length and are symmetric',()=>{
  const w=forestCell(),points=[[0,0],[0,4],[0,8],[4,0],[4,8],[8,0],[8,4],[8,8],[2,2],[6,6]];
  for(const a of points)for(const b of points){
    const clear=w._straightWalkable(a,b);
    assert.equal(clear,w._straightWalkable(b,a));
    if(clear)for(let k=0;k<=100;k++)assert.ok(w.navWalkable(a[0]+(b[0]-a[0])*k/100,a[1]+(b[1]-a[1])*k/100));
  }
});
