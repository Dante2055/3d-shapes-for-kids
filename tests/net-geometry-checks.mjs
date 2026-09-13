// node tests/net-geometry-checks.mjs [optional HTML file]
// Uses the exact Three.js version pinned by the page; no extra project dependency.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = await readFile(process.argv[2] || new URL('../index.html', import.meta.url), 'utf8');
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const response = await fetch(imports.three);
assert(response.ok, 'Load the page’s pinned Three.js');
const THREE = await import('data:text/javascript;base64,' + Buffer.from(await response.text()).toString('base64'));
const context2d = new Proxy({}, {get: (target, key) => target[key] || (() => {})});
const sandbox = {THREE, document:{createElement:()=>({getContext:()=>context2d})}};
vm.runInNewContext(html.slice(html.indexOf('function createFaceTexture('),html.indexOf('NetFoldingManager.init(scene);')) + '\nglobalThis.manager = NetFoldingManager;',sandbox);
const manager = sandbox.manager;
const near = (a,b,message,tolerance=1e-5) => assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const keys=['cube','box','cylinder','cone','pyramid','prism','hexPrism','tetra'];
const methods=['Cube','Box','Cylinder','Cone','Pyramid','Prism','HexPrism','Tetra'];
const p=(mesh,i)=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
const semanticMeshes=()=>{
  const meshes=[];
  manager.group.traverse(node=>{if(node.isMesh && node.parent.children.find(c=>c.isMesh)===node)meshes.push(node)});
  return meshes;
};
const failures=[];
const passed=[];
for(let k=0;k<keys.length;k++) {
  try {
    const key=keys[k];
    manager.group.clear();
    const model=manager['build'+methods[k]+'Net']();
    model.update(0);manager.group.updateMatrixWorld(true);
    const meshes=semanticMeshes();
    const curved=key==='cone'||key==='cylinder';
    const side=curved?manager.group.children[0].children.find(c=>c.isMesh):null;
    const frontFaces=meshes.filter(m=>m.geometry.attributes.position.count<=(key==='hexPrism'?7:4));
    if(side) { side.geometry.computeBoundingBox(); side.geometry.computeBoundingSphere(); }
    const originalFaces=frontFaces.map(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>p(m,i)));
    for(let step=0;step<=20;step++) {
      const t=step/20;
      model.update(t);manager.group.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(manager.group).expandByScalar(1e-5);
      for(const mesh of meshes) for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
        const point=p(mesh,i);
        assert(bounds.containsPoint(point),`${key}: render bounds cover deformed paper at ${t}`);
        assert(point.toArray().every(Number.isFinite),`${key}: finite vertex at ${t}`);
        assert(point.y>=-1e-5,`${key}: paper below floor at ${t}`);
        if(t===0) near(point.y,0,`${key}: flat net`,.003);
      }
      frontFaces.forEach((m,f)=>originalFaces[f].forEach((v,i)=>originalFaces[f].forEach((w,j)=>{
        near(p(m,i).distanceTo(p(m,j)),v.distanceTo(w),`${key}: rigid face at ${t}`);
      })));
      if(side) for(let i=0;i<side.geometry.attributes.position.count;i++) {
        const local=new THREE.Vector3().fromBufferAttribute(side.geometry.attributes.position,i);
        assert(local.distanceTo(side.geometry.boundingSphere.center)<=side.geometry.boundingSphere.radius+1e-5,`${key}: culling sphere covers paper`);
      }
      if(key==='cone') {
        const R=.8,H=1.6,L=Math.hypot(R,H),U=48,V=12;
        for(let u=0;u<=U;u++) near(p(side,0).distanceTo(p(side,V*(U+1)+u)),L,`cone: mother line preserved at ${t}`);
        let arc=0;
        for(let u=0;u<U;u++)arc+=p(side,V*(U+1)+u).distanceTo(p(side,V*(U+1)+u+1));
        near(arc,2*Math.PI*R,`cone: rim arc preserved at ${t}`,.004);
        const cap=manager.group.children[0].children.find(c=>c.isGroup);
        const center=cap.position;
        const contact=p(side,V*(U+1)+U/2);
        near(contact.y,center.y,`cone: attached cap height at ${t}`,.003);
        near(Math.hypot(contact.x-center.x,contact.z-center.z),R,`cone: cap stays attached at ${t}`);
        if(t===1) {
          for(let u=0;u<=U;u++) {
            const rim=p(side,V*(U+1)+u);
            near(rim.y,0,'cone: closed rim plane');
            near(Math.hypot(rim.x,rim.z),R,'cone: closed rim circle');
          }
          near(p(side,0).y,H,'cone: closed height');
          near(p(side,0).x,0,'cone: centered apex X');near(p(side,0).z,0,'cone: centered apex Z');
        }
      }
      if(key==='cylinder') {
        const R=.8,H=1.6,U=64,V=16;
        const a=p(side,4*(U+1)+12), b=p(side,12*(U+1)+42);
        const c=p(side,4*(U+1)+42), d=p(side,12*(U+1)+12);
        near(a.distanceTo(b),c.distanceTo(d),`cylinder: no shear at ${t}`);
        for(let u=0;u<=U;u++) near(p(side,u).distanceTo(p(side,V*(U+1)+u)),H,`cylinder: constant height at ${t}`);
        if(t===1)for(let u=0;u<=U;u++) {
          near(Math.hypot(p(side,u).x,p(side,u).z),R,'cylinder: closed radius');
          near(p(side,u).y,H,'cylinder: top plane');near(p(side,V*(U+1)+u).y,0,'cylinder: bottom plane');
        }
      }
      if(key==='hexPrism' && t===1) {
        const capFaces=frontFaces.filter(m=>m.geometry.attributes.position.count===7);
        assert.equal(capFaces.length,2,'hexPrism: two hexagonal caps');
        const capCenters=capFaces.map(m=>new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
        assert(capCenters.some(c=>Math.abs(c.y)<.01),'hexPrism: bottom cap rests on floor');
        assert(capCenters.some(c=>Math.abs(c.y-1.6)<.01),'hexPrism: top cap reaches prism height');
      }
    }
    if(!curved) {
      const edges=new Map();
      const vertices=new Set();
      const signature=v=>v.toArray().map(x=>Math.round(x*1e4)).join(',');
      for(const face of frontFaces) {
        const geometry=new THREE.EdgesGeometry(face.geometry);
        const positions=geometry.attributes.position;
        for(let i=0;i<positions.count;i+=2) {
          const a=signature(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(face.matrixWorld));
          const b=signature(new THREE.Vector3().fromBufferAttribute(positions,i+1).applyMatrix4(face.matrixWorld));
          vertices.add(a);vertices.add(b);
          const edge=[a,b].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
        }
        geometry.dispose();
      }
      assert([...edges.values()].every(n=>n===2),`${key}: each closed edge must join exactly two faces`);
      assert.equal(vertices.size,{cube:8,box:8,pyramid:5,prism:6,hexPrism:12,tetra:4}[key],`${key}: closed vertex count`);
    }
    passed.push(key);
  }catch(error){failures.push(error.message)}
}
console.log(JSON.stringify({passed,failures},null,2));
assert.equal(failures.length,0,'All seven nets must retain paper dimensions and close correctly');
