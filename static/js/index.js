/* AeroForge final (V13). Classic scripts and local assets: no modules, fetch, or CDN. */
(function () {
  'use strict';
  const data = window.AEROFORGE_DATA;
  if (!data || !Array.isArray(data.models)) return;
  const byId = new Map(data.models.map(x => [x.id, x]));
  const $ = id => document.getElementById(id);
  const number = n => Number(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentId = data.defaultModel, mode = 'surface', currentAsset = null;
  let meshSplit = 'all', meshQuery = '', yaw = -.65, pitch = .43, distance = 4.3;
  let wireSpin = false, pointer = null, previousTouches = new Map(), pinchDistance = null;
  let sliceAxis = 1, sliceIndex = 32, colorLimit = .15;
  let frameRequest = 0, lastTime = 0, onscreen = true;
  const cache = new Map(), waiting = new Map();

  // Per-model JavaScript containers work under both file:// and HTTP(S).
  window.AeroForgeAssets = {
    receive(id, asset) {
      try {
        const binary = atob(asset.sdf.values);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const dv = new DataView(bytes.buffer), field = new Float32Array(binary.length / 2);
        for (let i = 0; i < field.length; i++) field[i] = dv.getInt16(i * 2, true) * asset.sdf.scale;
        if (field.length !== asset.sdf.n ** 3) throw new Error('Unexpected field dimensions.');
        asset.sdf.field = field;
        delete asset.sdf.values;
        cache.set(id, asset);
        if (waiting.has(id)) { waiting.get(id).resolve(asset); waiting.delete(id); }
        while (cache.size > 4) {
          const oldest = cache.keys().next().value;
          if (oldest === currentId) { const v = cache.get(oldest); cache.delete(oldest); cache.set(oldest, v); }
          else cache.delete(oldest);
        }
      } catch (error) {
        if (waiting.has(id)) { waiting.get(id).reject(error); waiting.delete(id); }
      }
    }
  };
  function assetFor(id) {
    if (cache.has(id)) { const a = cache.get(id); cache.delete(id); cache.set(id, a); return Promise.resolve(a); }
    if (waiting.has(id)) return waiting.get(id).promise;
    let resolve, reject;
    const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
    waiting.set(id, {promise, resolve, reject});
    const tag = document.createElement('script');
    tag.src = byId.get(id).asset;
    tag.onerror = () => { if (waiting.has(id)) { waiting.get(id).reject(new Error('The model asset is missing. Extract the entire ZIP, including static/assets.')); waiting.delete(id); } tag.remove(); };
    tag.onload = () => { if (waiting.has(id)) { waiting.get(id).reject(new Error('The asset loaded but could not be initialized.')); waiting.delete(id); } tag.remove(); };
    document.head.appendChild(tag);
    return promise;
  }

  // Column-major matrices, WebGL 1-compatible, with 16-bit per-mesh indices.
  function identity() { return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
  function mul(a,b) { const c = new Float32Array(16); for (let j=0;j<4;j++) for (let i=0;i<4;i++) for(let k=0;k<4;k++) c[j*4+i]+=a[k*4+i]*b[j*4+k]; return c; }
  function rx(a) { const m=identity(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m; }
  function ry(a) { const m=identity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m; }
  function perspective(fov,aspect,near,far) { const m=new Float32Array(16),f=1/Math.tan(fov/2);m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m; }
  const canvas=$('modelCanvas');
  let gl=null, solidProgram=null, textureProgram=null, solidLoc={}, textureLoc={}, gpu=null, boxBuffer=null, planeBuffer=null, uvBuffer=null, planeTexture=null;
  let glError = '';
  function compile(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));return s;
  }
  function link(v,f) {
    const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,v),fs=compile(gl.FRAGMENT_SHADER,f);
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(vs);gl.deleteShader(fs);return p;
  }
  function buf(target,array) {const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,array,gl.STATIC_DRAW);return b;}
  try {
    gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
    if(!gl) throw new Error('WebGL is unavailable. The SDF cross-section and metadata table can still be used.');
    solidProgram=link(
      'attribute vec3 aP; attribute vec3 aN; uniform mat4 uM,uVP; varying vec3 vN; varying vec3 vP; void main(){vN=mat3(uM)*aN;vP=aP;gl_Position=uVP*uM*vec4(aP,1.0);}',
      'precision mediump float; varying vec3 vN; varying vec3 vP; uniform vec3 uColor; uniform float uClipAxis,uClipPosition,uUnlit; void main(){if(uClipAxis>-.5){float q=uClipAxis<.5?vP.x:(uClipAxis<1.5?vP.y:vP.z);if(q>uClipPosition+.00001)discard;}vec3 n=normalize(vN);float l=.42+.44*abs(dot(n,normalize(vec3(.4,.8,.7))))+.14*abs(dot(n,normalize(vec3(-.8,.2,.3))));gl_FragColor=vec4(uColor*mix(l,1.,uUnlit),1.);}'
    );
    ['aP','aN'].forEach(k=>solidLoc[k]=gl.getAttribLocation(solidProgram,k));
    ['uM','uVP','uColor','uClipAxis','uClipPosition','uUnlit'].forEach(k=>solidLoc[k]=gl.getUniformLocation(solidProgram,k));
    textureProgram=link(
      'attribute vec3 aP;attribute vec2 aUV;uniform mat4 uM,uVP;varying vec2 vUV;void main(){vUV=aUV;gl_Position=uVP*uM*vec4(aP,1.);}',
      'precision mediump float;uniform sampler2D uTexture;varying vec2 vUV;void main(){gl_FragColor=texture2D(uTexture,vUV);}'
    );
    ['aP','aUV'].forEach(k=>textureLoc[k]=gl.getAttribLocation(textureProgram,k));
    ['uM','uVP','uTexture'].forEach(k=>textureLoc[k]=gl.getUniformLocation(textureProgram,k));
    planeBuffer=buf(gl.ARRAY_BUFFER,new Float32Array(18));
    uvBuffer=buf(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]));
    planeTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,planeTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const corners=[];for(let i=0;i<8;i++) corners.push([(i&1)?1.15:-1.15,(i&2)?1.15:-1.15,(i&4)?1.15:-1.15]);
    const edges=[];for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2)if(!(i&bit))edges.push(...corners[i],...corners[i|bit]);
    boxBuffer=buf(gl.ARRAY_BUFFER,new Float32Array(edges));
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  } catch(error) {glError=error.message;gl=null;console.warn(glError);}

  let software=null;
  if(!gl&&window.AeroForgeSoftwareRenderer){try{software=new window.AeroForgeSoftwareRenderer(canvas);}catch(_){} }

  function makeGPU(g) {
    const index=new Uint16Array(g.i), lines=new Uint16Array(index.length*2);
    for(let k=0,j=0;k<index.length;k+=3){const a=index[k],b=index[k+1],c=index[k+2];lines[j++]=a;lines[j++]=b;lines[j++]=b;lines[j++]=c;lines[j++]=c;lines[j++]=a;}
    return {p:buf(gl.ARRAY_BUFFER,new Float32Array(g.p)),n:buf(gl.ARRAY_BUFFER,new Float32Array(g.n)),i:buf(gl.ELEMENT_ARRAY_BUFFER,index),lines:buf(gl.ELEMENT_ARRAY_BUFFER,lines),count:index.length,lineCount:lines.length};
  }
  function clearGPU() {if(!gl||!gpu)return;for(const g of Object.values(gpu)) for(const k of ['p','n','i','lines'])gl.deleteBuffer(g[k]);gpu=null;}
  function attrib(location,buffer,size) {gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
  function radius() {
    if(mode==='sdf')return Math.sqrt(3)*1.15;
    if(!currentAsset)return 1.3;
    const p=(mode==='iso'?currentAsset.iso:currentAsset.surface).p;let r=0;
    for(let i=0;i<p.length;i+=3)r=Math.max(r,p[i]*p[i]+p[i+1]*p[i+1]+p[i+2]*p[i+2]);return Math.sqrt(r);
  }
  function fitDistance() {const a=Math.max(.3,canvas.clientWidth/Math.max(canvas.clientHeight,1)),half=Math.min(.3665,Math.atan(Math.tan(.3665)*a));return radius()/Math.sin(half)*1.1;}
  function resetView() {yaw=-.65;pitch=.43;distance=fitDistance();invalidate();}
  function invalidate() {if(!frameRequest)frameRequest=requestAnimationFrame(draw);}
  function draw(time) {
    frameRequest=0;
    if(!gl||!solidProgram){
      if(software&&currentAsset){if(wireSpin&&onscreen&&!document.hidden&&!pointer)yaw+=Math.min((time-lastTime)/1000,.04)*.23;lastTime=time;software.render({asset:currentAsset,mode,yaw,pitch,distance,sliceAxis,sliceIndex,showContext:$('showContext').checked,textureCanvas:sliceCanvas});if(wireSpin&&onscreen&&!document.hidden)invalidate();}
      return;
    }
    const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.clearColor(.951,.965,.97,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(wireSpin&&onscreen&&!document.hidden&&!pointer) yaw+=Math.min((time-lastTime)/1000,.04)*.23;
    lastTime=time;
    if(gpu&&currentAsset){
      const m=mul(ry(yaw),rx(pitch)),view=identity();view[14]=-distance;const vp=mul(perspective(.733,w/h,.04,50),view);
      const solid=(g,isWire,clip=-1)=>{
        gl.useProgram(solidProgram);gl.uniformMatrix4fv(solidLoc.uM,false,m);gl.uniformMatrix4fv(solidLoc.uVP,false,vp);gl.uniform1f(solidLoc.uClipAxis,clip);gl.uniform1f(solidLoc.uClipPosition,currentAsset.sdf.lo+sliceIndex*currentAsset.sdf.step);gl.uniform1f(solidLoc.uUnlit,isWire?1:0);
        gl.uniform3fv(solidLoc.uColor,isWire?[.28,.38,.43]:(mode==='iso'||mode==='sdf'?[.64,.75,.77]:[.71,.76,.79]));
        attrib(solidLoc.aP,g.p,3);attrib(solidLoc.aN,g.n,3);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,isWire?g.lines:g.i);gl.drawElements(isWire?gl.LINES:gl.TRIANGLES,isWire?g.lineCount:g.count,gl.UNSIGNED_SHORT,0);
      };
      if(mode==='surface')solid(gpu.surface,false);
      if(mode==='wire')solid(gpu.surface,true);
      if(mode==='iso')solid(gpu.iso,false);
      if(mode==='sdf'){
        if($('showContext').checked) solid(gpu.iso,false,sliceAxis);
        gl.useProgram(textureProgram);gl.uniformMatrix4fv(textureLoc.uM,false,m);gl.uniformMatrix4fv(textureLoc.uVP,false,vp);
        attrib(textureLoc.aP,planeBuffer,3);attrib(textureLoc.aUV,uvBuffer,2);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,planeTexture);gl.uniform1i(textureLoc.uTexture,0);gl.drawArrays(gl.TRIANGLES,0,6);
        gl.useProgram(solidProgram);gl.uniformMatrix4fv(solidLoc.uM,false,m);gl.uniformMatrix4fv(solidLoc.uVP,false,vp);gl.uniform1f(solidLoc.uClipAxis,-1);gl.uniform1f(solidLoc.uUnlit,1);gl.uniform3f(solidLoc.uColor,.58,.67,.71);
        attrib(solidLoc.aP,boxBuffer,3);gl.disableVertexAttribArray(solidLoc.aN);gl.vertexAttrib3f(solidLoc.aN,0,1,0);gl.drawArrays(gl.LINES,0,24);
      }
    }
    if(wireSpin&&onscreen&&!document.hidden)invalidate();
  }
  if(window.ResizeObserver)new ResizeObserver(()=>invalidate()).observe(canvas);else window.addEventListener('resize',invalidate);
  if(window.IntersectionObserver)new IntersectionObserver(entries=>{onscreen=entries[0].isIntersecting;if(onscreen)invalidate();}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
  function stopPointer(e) {previousTouches.delete(e.pointerId);pinchDistance=null;pointer=null;canvas.classList.remove('dragging');try{canvas.releasePointerCapture(e.pointerId);}catch(_){} }
  canvas.addEventListener('pointerdown',e=>{if(e.button>0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};previousTouches.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{
    if(!previousTouches.has(e.pointerId))return;
    previousTouches.set(e.pointerId,[e.clientX,e.clientY]);
    if(previousTouches.size===2){const a=[...previousTouches.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinchDistance)distance=Math.max(1.3,Math.min(16,distance*pinchDistance/Math.max(d,1)));pinchDistance=d;invalidate();return;}
    if(pointer){yaw+=(e.clientX-pointer.x)*.008;pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch+(e.clientY-pointer.y)*.008));pointer.x=e.clientX;pointer.y=e.clientY;invalidate();}
  });
  canvas.addEventListener('pointerup',stopPointer);canvas.addEventListener('pointercancel',stopPointer);
  canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.3,Math.min(16,distance*Math.exp(Math.max(-250,Math.min(250,e.deltaY))*.001)));invalidate();},{passive:false});
  canvas.addEventListener('dblclick',resetView);
  canvas.addEventListener('keydown',e=>{const k=e.key;let used=true;if(k==='ArrowLeft')yaw-=.12;else if(k==='ArrowRight')yaw+=.12;else if(k==='ArrowUp')pitch-=.12;else if(k==='ArrowDown')pitch+=.12;else if(k==='+'||k==='=')distance*=.9;else if(k==='-')distance*=1.1;else if(k.toLowerCase()==='r')resetView();else used=false;if(used){e.preventDefault();invalidate();}});
  $('resetView').addEventListener('click',resetView);
  $('toggleSpin').addEventListener('click',e=>{wireSpin=!wireSpin;e.currentTarget.setAttribute('aria-pressed',String(wireSpin));e.currentTarget.textContent=wireSpin?'Pause rotation':'Auto-rotate';invalidate();});

  // Draw a genuinely sampled scalar field, with a common 2D/3D color texture.
  const sliceCanvas=$('sliceCanvas'), sliceCtx=sliceCanvas.getContext('2d');
  const lowCanvas=document.createElement('canvas'),lowCtx=lowCanvas.getContext('2d');
  function fieldAt(i,j,k){const s=currentAsset.sdf;return s.field[(i*s.n+j)*s.n+k];}
  function sample(i,j){const xyz=[0,0,0],other=[0,1,2].filter(a=>a!==sliceAxis);xyz[sliceAxis]=sliceIndex;xyz[other[0]]=i;xyz[other[1]]=j;return fieldAt(...xyz);}
  function color(d){const x=Math.min(1,Math.abs(d)/colorLimit),a=[246,247,245],b=d<0?[52,123,150]:[173,90,59];return a.map((v,i)=>Math.round(v+(b[i]-v)*x));}
  function chooseBestSlice(){
    if(!currentAsset)return;
    const s=currentAsset.sdf,n=s.n,counts=new Int32Array(n);
    for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++)if(s.field[(x*n+y)*n+z]<0)counts[sliceAxis===0?x:(sliceAxis===1?y:z)]++;
    let best=Math.floor(n/2);for(let i=0;i<n;i++)if(counts[i]>counts[best])best=i;
    sliceIndex=best;$('slicePosition').value=String(best);
  }
  function updateSlice(){
    if(!currentAsset)return;
    const s=currentAsset.sdf,n=s.n,other=[0,1,2].filter(a=>a!==sliceAxis),letters=['X','Y','Z'];
    lowCanvas.width=n;lowCanvas.height=n;const pixels=lowCtx.createImageData(n,n);let min=Infinity,max=-Infinity;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const d=sample(i,j),idx=((n-1-j)*n+i)*4;min=Math.min(min,d);max=Math.max(max,d);const c=color(d);pixels.data[idx]=c[0];pixels.data[idx+1]=c[1];pixels.data[idx+2]=c[2];pixels.data[idx+3]=255;}
    lowCtx.putImageData(pixels,0,0);sliceCtx.clearRect(0,0,sliceCanvas.width,sliceCanvas.height);sliceCtx.imageSmoothingEnabled=false;sliceCtx.drawImage(lowCanvas,0,0,sliceCanvas.width,sliceCanvas.height);
    if($('showContour').checked){
      sliceCtx.strokeStyle='#344f57';sliceCtx.lineWidth=1.45;sliceCtx.beginPath();
      // Marching squares; 4-edge ambiguities use a deterministic cell-centre test.
      const W=sliceCanvas.width,H=sliceCanvas.height;
      const pt=(i,j)=>[(i+.5)*W/n,H-(j+.5)*H/n];
      for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){
        const v=[sample(i,j),sample(i+1,j),sample(i+1,j+1),sample(i,j+1)],p=[pt(i,j),pt(i+1,j),pt(i+1,j+1),pt(i,j+1)],cross=[];
        for(let e=0;e<4;e++){const b=(e+1)%4;if((v[e]<0)!==(v[b]<0)){const t=v[e]/(v[e]-v[b]);cross.push([p[e][0]+t*(p[b][0]-p[e][0]),p[e][1]+t*(p[b][1]-p[e][1])]);}}
        if(cross.length===2){sliceCtx.moveTo(...cross[0]);sliceCtx.lineTo(...cross[1]);}
        if(cross.length===4){const c=(v[0]+v[1]+v[2]+v[3])/4;const pairs=((c<0)===(v[0]<0))?[[0,1],[2,3]]:[[0,3],[1,2]];for(const ab of pairs){sliceCtx.moveTo(...cross[ab[0]]);sliceCtx.lineTo(...cross[ab[1]]);}}
      }sliceCtx.stroke();
    }
    $('sliceTitle').textContent=letters[other[0]]+'–'+letters[other[1]]+' slice';
    $('sliceGridLabel').textContent=min<0&&max>0?'64 × 64 samples':'64 × 64 · outside-only slice';
    $('slicePositionValue').textContent=(sliceIndex+1)+' / '+n+'  ·  '+letters[sliceAxis]+' = '+(s.lo+sliceIndex*s.step).toFixed(3);
    $('colorRangeValue').textContent=colorLimit.toFixed(2);$('legendMin').textContent='−'+colorLimit.toFixed(2)+' inside';$('legendMax').textContent='+'+colorLimit.toFixed(2)+' outside';
    $('sliceReadout').textContent='Move over the slice to read d(x,y,z).';
    if(gl){
      const point=(u,v)=>{const p=[0,0,0];p[sliceAxis]=s.lo+sliceIndex*s.step;p[other[0]]=s.lo+u*(n-1)*s.step;p[other[1]]=s.lo+v*(n-1)*s.step;return p;};
      const p=new Float32Array([...point(0,0),...point(1,0),...point(1,1),...point(0,0),...point(1,1),...point(0,1)]);
      gl.bindBuffer(gl.ARRAY_BUFFER,planeBuffer);gl.bufferData(gl.ARRAY_BUFFER,p,gl.DYNAMIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,planeTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sliceCanvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    }
    invalidate();
  }
  sliceCanvas.addEventListener('pointermove',e=>{if(!currentAsset)return;const r=sliceCanvas.getBoundingClientRect(),s=currentAsset.sdf,n=s.n;const i=Math.max(0,Math.min(n-1,Math.floor((e.clientX-r.left)/r.width*n))),j=Math.max(0,Math.min(n-1,n-1-Math.floor((e.clientY-r.top)/r.height*n)));const xyz=[0,0,0],other=[0,1,2].filter(a=>a!==sliceAxis);xyz[sliceAxis]=sliceIndex;xyz[other[0]]=i;xyz[other[1]]=j;const d=fieldAt(...xyz);$('sliceReadout').textContent='grid ['+xyz.join(', ')+'] · d = '+(d>=0?'+':'')+d.toFixed(4)+' (normalized)';});
  $('sliceAxis').addEventListener('change',e=>{sliceAxis=Number(e.target.value);chooseBestSlice();updateSlice();});
  $('slicePosition').addEventListener('input',e=>{sliceIndex=Number(e.target.value);updateSlice();});
  $('colorRange').addEventListener('input',e=>{colorLimit=Number(e.target.value);updateSlice();});
  $('showContour').addEventListener('change',updateSlice);$('showContext').addEventListener('change',invalidate);
  const modeText={
    surface:'Shaded view of the source shape using a display mesh.',
    wire:'Triangle edges of the display mesh.',
    sdf:'Cross-sections of the computed distance field. Adjust the plane and position below.',
    iso:'Surface extracted at d = 0 from the preview field.'
  };
  const badgeText={surface:'Source surface',wire:'Display wireframe',sdf:'SDF slices · 64³',iso:'Zero isosurface · d = 0'};
  function setMode(m){mode=m;document.querySelectorAll('.mode-tab').forEach(b=>{b.classList.toggle('active',b.dataset.mode===m);b.setAttribute('aria-pressed',String(b.dataset.mode===m));});$('representationNote').textContent=modeText[m];$('viewBadge').textContent=badgeText[m];$('sdfControls').hidden=m!=='sdf';distance=fitDistance();if(m==='sdf')updateSlice();updateStats();invalidate();}
  document.querySelectorAll('.mode-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

  function filteredMeshes(){const q=meshQuery.trim().toLowerCase();return data.models.filter(x=>(meshSplit==='all'||x.split===meshSplit)&&(!q||x.filename.toLowerCase().includes(q)));}
  function renderMeshList(){const items=filteredMeshes();$('meshList').innerHTML=items.map(x=>'<button class="mesh-row'+(x.id===currentId?' active':'')+'" data-id="'+esc(x.id)+'" tabindex="'+(x.id===currentId?'0':'-1')+'" aria-pressed="'+(x.id===currentId)+'" type="button"><code translate="no">'+esc(x.id)+'</code><span translate="no">'+esc(x.split)+'</span></button>').join('')||'<p class="mesh-list-empty">No matching meshes. Try another ID or split.</p>';
    const index=items.findIndex(x=>x.id===currentId);$('meshCounter').textContent=items.length?(index>=0?(index+1)+' / '+items.length:items.length+' matches'):'0 matches';$('previousMesh').disabled=$('nextMesh').disabled=!items.length;
  }
  function revealActive(){const list=$('meshList'),row=list.querySelector('.active');if(!row)return;const a=row.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top)list.scrollTop-=b.top-a.top;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;}
  function updateStats(){const m=byId.get(currentId);if(!m)return;$('meshTitle').textContent=m.filename;$('meshSplit').textContent=m.split;$('meshVerts').textContent=number(m.vertices);$('meshFaces').textContent=number(m.faces);$('meshSize').textContent=(m.bytes/1024/1024).toFixed(2)+' MiB (OFF)';$('displayStats').textContent=(mode==='iso'||mode==='sdf')?'Zero-isosurface display: '+number(m.isosurface_vertices)+' vertices / '+number(m.isosurface_faces)+' triangles':'Surface display: '+number(m.render_vertices)+' vertices / '+number(m.render_faces)+' triangles';$('downloadField').href=m.volume;}
  async function chooseMesh(id,reset=true){
    if(!byId.has(id))return;currentId=id;currentAsset=null;clearGPU();updateStats();renderMeshList();revealActive();
    $('viewerStatus').hidden=false;$('viewerStatus').innerHTML='Loading <span translate="no">'+esc(id)+'</span>…';invalidate();
    try{const a=await assetFor(id);if(currentId!==id)return;currentAsset=a;chooseBestSlice();if(gl)gpu={surface:makeGPU(a.surface),iso:makeGPU(a.iso)};if(reset)resetView();updateSlice();$('viewerStatus').hidden=!!(gl||software);if(!gl&&!software)$('viewerStatus').textContent=glError;renderTable();invalidate();}
    catch(error){if(currentId===id){$('viewerStatus').hidden=false;$('viewerStatus').textContent=error.message;console.error(error);}}
  }
  $('meshList').addEventListener('click',e=>{const b=e.target.closest('.mesh-row');if(b)chooseMesh(b.dataset.id);});
  $('meshSearch').addEventListener('input',e=>{meshQuery=e.target.value;renderMeshList();});
  document.querySelectorAll('.mesh-split').forEach(b=>b.addEventListener('click',()=>{meshSplit=b.dataset.split;document.querySelectorAll('.mesh-split').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});const items=filteredMeshes();renderMeshList();if(items.length&&!items.some(x=>x.id===currentId))chooseMesh(items[0].id);}));
  function stepMesh(delta){const a=filteredMeshes();if(!a.length)return;const i=a.findIndex(x=>x.id===currentId);chooseMesh(a[(Math.max(i,0)+delta+a.length)%a.length].id);}
  $('previousMesh').addEventListener('click',()=>stepMesh(-1));$('nextMesh').addEventListener('click',()=>stepMesh(1));

  // Full 726-row index stays independent of the 46 geometry previews.
  let metaQuery='',metaSplit='all',previewOnly=false,page=1,rowsPerPage=15,sortKey='object_id',sortDirection=1;
  function filteredMetadata(){const q=metaQuery.trim().toLowerCase();return data.metadata.filter(r=>(metaSplit==='all'||r.split===metaSplit)&&(!previewOnly||byId.has(r.object_id))&&(!q||r.object_id.toLowerCase().includes(q)||r.object_path.toLowerCase().includes(q))).sort((a,b)=>String(a[sortKey]).localeCompare(String(b[sortKey]),'en',{numeric:true})*sortDirection);}
  function renderTable(){$('clearMetadata').hidden=!(metaQuery||metaSplit!=='all'||previewOnly);const all=filteredMetadata(),pages=Math.max(1,Math.ceil(all.length/rowsPerPage));page=Math.min(page,pages);const first=(page-1)*rowsPerPage,shown=all.slice(first,first+rowsPerPage);
    $('metadataBody').innerHTML=shown.map(r=>'<tr'+(r.object_id===currentId?' class="selected-row"':'')+'><td>'+(byId.has(r.object_id)?'<button class="object-preview" data-id="'+esc(r.object_id)+'" type="button" title="View this mesh and its SDF previews"><span>'+esc(r.object_id)+'</span><span class="preview-tag">3D</span></button>':esc(r.object_id))+'</td><td>'+esc(r.class)+'</td><td>'+esc(r.split)+'</td><td>'+esc(r.object_path)+'</td></tr>').join('')||'<tr><td colspan="4">No matching metadata records.</td></tr>';
    $('metadataCount').textContent=(all.length?(first+1)+'–'+(first+shown.length):'0')+' of '+number(all.length)+' records';$('pageInfo').textContent=page+' / '+pages;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages;$('exportFiltered').disabled=!all.length;
    document.querySelectorAll('.sort-button').forEach(b=>{const active=b.dataset.key===sortKey;b.parentElement.setAttribute('aria-sort',active?(sortDirection>0?'ascending':'descending'):'none');b.querySelector('span').textContent=active?(sortDirection>0?'↑':'↓'):'↕';});
  }

  $('clearMetadata').addEventListener('click',()=>{metaQuery='';metaSplit='all';previewOnly=false;page=1;$('metadataSearch').value='';$('metadataSplit').value='all';$('previewOnly').checked=false;renderTable();});
  $('meshList').addEventListener('keydown',e=>{
    const keys=['ArrowDown','ArrowUp','Home','End'];if(!keys.includes(e.key))return;
    const a=filteredMeshes();if(!a.length)return;e.preventDefault();
    const i=a.findIndex(x=>x.id===currentId);
    const next=e.key==='Home'?0:e.key==='End'?a.length-1:Math.max(0,Math.min(a.length-1,i+(e.key==='ArrowDown'?1:-1)));
    chooseMesh(a[next].id);$('meshList').querySelector('.active')?.focus({preventScroll:true});
  });

  $('metadataSearch').addEventListener('input',e=>{metaQuery=e.target.value;page=1;renderTable();});
  $('metadataSplit').addEventListener('change',e=>{metaSplit=e.target.value;page=1;renderTable();});
  $('previewOnly').addEventListener('change',e=>{previewOnly=e.target.checked;page=1;renderTable();});
  $('rowsPerPage').addEventListener('change',e=>{rowsPerPage=Number(e.target.value);page=1;renderTable();});
  $('prevPage').addEventListener('click',()=>{if(page>1)page--;renderTable();$('metadata').querySelector('.metadata-table-wrap').scrollTop=0;});
  $('nextPage').addEventListener('click',()=>{page++;renderTable();$('metadata').querySelector('.metadata-table-wrap').scrollTop=0;});
  document.querySelectorAll('.sort-button').forEach(b=>b.addEventListener('click',()=>{if(sortKey===b.dataset.key)sortDirection*=-1;else{sortKey=b.dataset.key;sortDirection=1;}page=1;renderTable();}));
  $('metadataBody').addEventListener('click',e=>{const b=e.target.closest('.object-preview');if(!b)return;meshQuery='';meshSplit='all';$('meshSearch').value='';document.querySelectorAll('.mesh-split').forEach(x=>{const on=x.dataset.split==='all';x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});chooseMesh(b.dataset.id);$('shapeExplorer').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
  $('exportFiltered').addEventListener('click',()=>{const cols=['object_id','class','split','object_path'];const encode=s=>'"'+String(s).replace(/"/g,'""')+'"';const text=cols.join(',')+'\r\n'+filteredMetadata().map(r=>cols.map(k=>encode(r[k])).join(',')).join('\r\n')+'\r\n';const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='metadata_airplane_filtered.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});

  $('copyBib').addEventListener('click',async()=>{const b=$('copyBib'),text=$('bibtex').textContent;let ok=false;try{if(navigator.clipboard){await navigator.clipboard.writeText(text);ok=true;}}catch(_){}if(!ok){const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;left:-9999px';document.body.appendChild(t);t.select();try{ok=document.execCommand('copy');}catch(_){}t.remove();}b.textContent=ok?'Copied':'Select and copy the text';$('copyStatus').textContent=ok?'BibTeX copied to clipboard.':'Please select and copy the citation text.';setTimeout(()=>b.textContent='Copy BibTeX',1800);});

  renderMeshList();renderTable();chooseMesh(currentId);
  // Compact diagnostic state used by the included browser verification script.
  window.AeroForgeDebug=()=>({id:currentId,mode,loaded:!!currentAsset,webgl:!!gl,renderer:gl?'WebGL':(software?'Canvas 3D':'none'),grid:currentAsset?.sdf.n,axis:sliceAxis,slice:sliceIndex,yaw,pitch,distance,filteredMeshes:filteredMeshes().length,filteredMetadata:filteredMetadata().length});
})();
