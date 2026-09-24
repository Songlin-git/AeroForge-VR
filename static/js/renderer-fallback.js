/* CPU depth-buffered compatibility renderer. Uses the same geometry, camera,
   field and slice texture as the WebGL renderer; not an image carousel. */
(function(){
'use strict';
class SoftwareRenderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('Canvas unavailable');this.texture=null;this.textureStamp=null;}
  render({asset,mode,yaw,pitch,distance,sliceAxis,sliceIndex,showContext,textureCanvas}){
    const c=this.canvas,aspect=c.clientWidth/Math.max(1,c.clientHeight),w=Math.max(1,Math.round(Math.min(780,c.clientWidth*(devicePixelRatio||1)))),h=Math.max(1,Math.round(w/aspect));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;this.image=this.ctx.createImageData(w,h);this.depth=new Float32Array(w*h);}
    if(!this.image){this.image=this.ctx.createImageData(w,h);this.depth=new Float32Array(w*h);}
    const pix=this.image.data,depth=this.depth;depth.fill(Infinity);
    for(let i=0;i<pix.length;i+=4){pix[i]=243;pix[i+1]=246;pix[i+2]=248;pix[i+3]=255;}
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),f=1/Math.tan(.733/2),near=.04,far=50,A=(far+near)/(near-far),B=2*far*near/(near-far);
    const rotate=(x,y,z)=>{const yy=cx*y-sx*z,zz=sx*y+cx*z;return [cy*x+sy*zz,yy,-sy*x+cy*zz];};
    const project=(x,y,z,l=1,u=0,v=0)=>{const r=rotate(x,y,z),iw=1/(distance-r[2]);return [(f/aspect*r[0]*iw+1)*w/2,(1-f*r[1]*iw)*h/2,(A*(r[2]-distance)+B)*iw,iw,l,u,v];};
    const raster=(p0,p1,p2,color,texture=null,depthOnly=false)=>{
      if(p0[3]<=0||p1[3]<=0||p2[3]<=0)return;
      let minX=Math.max(0,Math.floor(Math.min(p0[0],p1[0],p2[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(p0[0],p1[0],p2[0]))),minY=Math.max(0,Math.floor(Math.min(p0[1],p1[1],p2[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(p0[1],p1[1],p2[1])));
      if(minX>maxX||minY>maxY)return;
      const den=(p1[1]-p2[1])*(p0[0]-p2[0])+(p2[0]-p1[0])*(p0[1]-p2[1]);if(Math.abs(den)<1e-9)return;
      const ax=(p1[1]-p2[1])/den,ay=(p2[0]-p1[0])/den,bx=(p2[1]-p0[1])/den,by=(p0[0]-p2[0])/den;
      let rowA=ax*(minX+.5-p2[0])+ay*(minY+.5-p2[1]),rowB=bx*(minX+.5-p2[0])+by*(minY+.5-p2[1]);
      for(let y=minY;y<=maxY;y++,rowA+=ay,rowB+=by){let a=rowA,b=rowB;for(let x=minX;x<=maxX;x++,a+=ax,b+=bx){const cc=1-a-b;if(a<-.00001||b<-.00001||cc<-.00001)continue;const z=a*p0[2]+b*p1[2]+cc*p2[2],k=y*w+x;if(z>=depth[k])continue;depth[k]=z;if(depthOnly)continue;const j=k*4;
        if(texture){const iw=a*p0[3]+b*p1[3]+cc*p2[3],u=(a*p0[5]*p0[3]+b*p1[5]*p1[3]+cc*p2[5]*p2[3])/iw,v=(a*p0[6]*p0[3]+b*p1[6]*p1[3]+cc*p2[6]*p2[3])/iw;const tx=Math.min(texture.width-1,Math.max(0,Math.round(u*(texture.width-1)))),ty=Math.min(texture.height-1,Math.max(0,Math.round((1-v)*(texture.height-1)))),q=(ty*texture.width+tx)*4;pix[j]=texture.data[q];pix[j+1]=texture.data[q+1];pix[j+2]=texture.data[q+2];}
        else{const l=Math.max(.25,Math.min(1,a*p0[4]+b*p1[4]+cc*p2[4]));pix[j]=color[0]*l;pix[j+1]=color[1]*l;pix[j+2]=color[2]*l;}
      }}
    };
    const line=(a,b,color,occlude=true)=>{const steps=Math.ceil(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])));for(let s=0;s<=steps;s++){const t=steps?s/steps:0,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);if(x<0||y<0||x>=w||y>=h)continue;const z=a[2]+(b[2]-a[2])*t,k=y*w+x;if(occlude&&z>depth[k]+.0003)continue;const j=k*4;pix[j]=color[0];pix[j+1]=color[1];pix[j+2]=color[2];}};
    const mesh=(g,clip=false,wire=false)=>{
      const n=g.p.length/3,projected=new Array(n),light=new Float32Array(n),color=(mode==='sdf'||mode==='iso')?[163,191,196]:[181,194,201];
      for(let k=0;k<n;k++){const nx=g.n[k*3],ny=g.n[k*3+1],nz=g.n[k*3+2],r=rotate(nx,ny,nz),norm=Math.hypot(...r)||1;light[k]=.42+.44*Math.abs((r[0]*.4+r[1]*.8+r[2]*.7)/(norm*Math.sqrt(1.29)))+.14*Math.abs((r[0]*-.8+r[1]*.2+r[2]*.3)/(norm*Math.sqrt(.77)));projected[k]=project(g.p[k*3],g.p[k*3+1],g.p[k*3+2],light[k]);}
      const pos=asset.sdf.lo+sliceIndex*asset.sdf.step;
      for(let k=0;k<g.i.length;k+=3){const ids=[g.i[k],g.i[k+1],g.i[k+2]];
        if(clip){let poly=ids.map(j=>[g.p[j*3],g.p[j*3+1],g.p[j*3+2],light[j]]),out=[];for(let t=0;t<poly.length;t++){const a=poly[t],b=poly[(t+1)%poly.length],ina=a[sliceAxis]<=pos,inb=b[sliceAxis]<=pos;if(ina)out.push(a);if(ina!==inb){const u=(pos-a[sliceAxis])/(b[sliceAxis]-a[sliceAxis]);out.push(a.map((v,d)=>v+(b[d]-v)*u));}}if(out.length<3)continue;const pp=out.map(v=>project(v[0],v[1],v[2],v[3]));for(let j=1;j<pp.length-1;j++)raster(pp[0],pp[j],pp[j+1],color);}
        else raster(projected[ids[0]],projected[ids[1]],projected[ids[2]],color,null,wire);
      }
      if(wire)for(let k=0;k<g.i.length;k+=3){const a=projected[g.i[k]],b=projected[g.i[k+1]],d=projected[g.i[k+2]];line(a,b,[71,97,110]);line(b,d,[71,97,110]);line(d,a,[71,97,110]);}
    };
    if(mode==='surface')mesh(asset.surface);if(mode==='wire')mesh(asset.surface,false,true);if(mode==='iso')mesh(asset.iso);
    if(mode==='sdf'){
      if(showContext)mesh(asset.iso,true);
      const s=asset.sdf,other=[0,1,2].filter(x=>x!==sliceAxis),point=(u,v)=>{const p=[0,0,0];p[sliceAxis]=s.lo+sliceIndex*s.step;p[other[0]]=s.lo+u*(s.n-1)*s.step;p[other[1]]=s.lo+v*(s.n-1)*s.step;return project(p[0],p[1],p[2],1,u,v);};
      const tex=textureCanvas.getContext('2d').getImageData(0,0,textureCanvas.width,textureCanvas.height);
      const a=point(0,0),b=point(1,0),d=point(1,1),e=point(0,1);raster(a,b,d,null,tex);raster(a,d,e,null,tex);
      const corners=[];for(let i=0;i<8;i++)corners.push(project((i&1)?1.15:-1.15,(i&2)?1.15:-1.15,(i&4)?1.15:-1.15));for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2)if(!(i&bit))line(corners[i],corners[i|bit],[148,171,181]);
    }
    this.ctx.putImageData(this.image,0,0);
  }
}
window.AeroForgeSoftwareRenderer=SoftwareRenderer;
})();
