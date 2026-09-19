/*!
 * Refraction field adapted from dashersw/liquid-glass-js and
 * stormaref/LiquidGlassSkill. Copyright (c) 2025 Armagan Amcalar.
 * MIT: Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files, to deal in the
 * Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to
 * do so, subject to inclusion of this notice in all copies or substantial
 * portions. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
'use strict';
(()=>{
  const root=document.documentElement,ns='http://www.w3.org/2000/svg';
  const supported=/Chrome\//.test(navigator.userAgent)&&!/EdgiOS|CriOS/.test(navigator.userAgent);
  const contrast=matchMedia('(forced-colors: active)'),opaque=matchMedia('(prefers-reduced-transparency: reduce)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const selector='.space-switch,.global-search,.assistant .chat-input,.mobile-nav,.nav button.active';
  const entries=new Map(),cache=new Map();let defs,frame=0,timer=0,serial=0,active=false;
  const node=(name,attrs={})=>{const el=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));return el;};
  function bake(w,h,r){
    const ss=Math.min(2,1000/Math.max(w,h)),bw=Math.max(1,Math.round(w*ss)),bh=Math.max(1,Math.round(h*ss));
    const dx=new Float32Array(bw*bh),dy=new Float32Array(bw*bh);let max=0;
    for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
      const cx=(x+.5)/bw,cy=(y+.5)/bh,tx=Math.abs((x+.5)/ss-w/2)-(w/2-r),ty=Math.abs((y+.5)/ss-h/2)-(h/2-r);
      const d=Math.max(-(Math.hypot(Math.max(tx,0),Math.max(ty,0))+Math.min(Math.max(tx,ty),0)-r),0);
      const rim=Math.exp(-d*1.7),edge=Math.exp(-d*.5),corner=Math.exp(-Math.max(Math.min(cx,1-cx),Math.min(cy,1-cy))*Math.min(w,h)*.3)*.06;
      const length=Math.hypot(cx-.5,cy-.5)||1,nx=(cx-.5)/length,ny=(cy-.5)/length,total=edge*.015+rim*.028+corner;
      const ripple=Math.sin(d/Math.min(w,h)*25)*.26*rim,index=y*bw+x;
      dx[index]=(nx*total-ny*ripple)*innerWidth;dy[index]=(ny*total+nx*ripple)*innerHeight;
      max=Math.max(max,Math.abs(dx[index]),Math.abs(dy[index]));
    }
    const scale=Math.max(max*2,.0001),bias=scale*(128/255-.5),canvas=document.createElement('canvas');canvas.width=bw;canvas.height=bh;
    const ctx=canvas.getContext('2d'),map=ctx.createImageData(bw,bh);
    for(let i=0;i<dx.length;i++){map.data[i*4]=Math.round(255*(.5+(dx[i]-bias)/scale));map.data[i*4+1]=Math.round(255*(.5+(dy[i]-bias)/scale));map.data[i*4+2]=128;map.data[i*4+3]=255;}
    ctx.putImageData(map,0,0);return {url:canvas.toDataURL(),scale};
  }
  function acquire(key,w,h,r){
    let item=cache.get(key);if(item?.el.isConnected){item.refs++;return item;}
    if(!defs?.isConnected){defs=node('svg',{width:0,height:0,'aria-hidden':'true','data-liquid-defs':''});defs.append(node('defs'));document.body.append(defs);}
    const {url,scale}=bake(w,h,r),margin=scale/2+2.1,id=`liquid-${++serial}`;
    const el=node('filter',{id,x:`${-margin/w*100}%`,y:`${-margin/h*100}%`,width:`${100+margin/w*200}%`,height:`${100+margin/h*200}%`,'color-interpolation-filters':'sRGB'});
    el.append(node('feImage',{href:url,x:0,y:0,width:w,height:h,preserveAspectRatio:'none',result:'map'}),node('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale,xChannelSelector:'R',yChannelSelector:'G',result:'lens'}),node('feGaussianBlur',{in:'lens',stdDeviation:.7}));
    defs.firstChild.append(el);item={id,el,refs:1};cache.set(key,item);return item;
  }
  function release(el){resize.unobserve(el);const key=entries.get(el),item=cache.get(key);if(item&&--item.refs===0){item.el.remove();cache.delete(key);}entries.delete(el);el.style.removeProperty('backdrop-filter');el.style.removeProperty('--glass-light');el.removeAttribute('data-liquid-surface');}
  function refresh(){
    frame=0;if(!active)return;
    const surfaces=[...document.querySelectorAll(selector)].filter(el=>el.offsetWidth>1&&el.offsetHeight>1).slice(0,6);
    for(const el of entries.keys())if(!surfaces.includes(el))release(el);
    for(const el of surfaces){
      const w=Math.round(el.offsetWidth),h=Math.round(el.offsetHeight),computed=getComputedStyle(el).borderTopLeftRadius;
      const r=Math.min(parseFloat(computed)*(computed.endsWith('%')?Math.min(w,h)/100:1)||0,Math.min(w,h)/2),key=[w,h,r,innerWidth,innerHeight].join('|');
      if(entries.get(el)===key&&cache.get(key)?.el.isConnected)continue;
      if(entries.has(el))release(el);
      try{const item=acquire(key,w,h,r);entries.set(el,key);resize.observe(el);el.dataset.liquidSurface='';el.style.backdropFilter=`url(#${item.id})`;}catch{release(el);}
    }
    if(!cache.size){defs?.remove();defs=null;}
  }
  function schedule(){if(active&&!frame)frame=requestAnimationFrame(refresh);}
  const resize=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(schedule,180);});
  const tree=new MutationObserver(schedule);
  function viewport(){clearTimeout(timer);timer=setTimeout(schedule,180);}
  function pointer(event){
    if(root.dataset.motion==='reduce'||motion.matches||event.pointerType==='touch')return;
    const el=event.target.closest(selector);if(!entries.has(el))return;
    const box=el.getBoundingClientRect(),angle=110+(event.clientX-box.x)/box.width*60;
    el.style.setProperty('--glass-light',`${angle}deg`);
  }
  function sync(){
    const next=supported&&root.dataset.theme==='glass'&&!opaque.matches&&!contrast.matches;
    if(next===active)return;active=next;
    if(active){tree.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('resize',viewport,{passive:true});document.addEventListener('pointermove',pointer,{passive:true});schedule();}
    else{tree.disconnect();resize.disconnect();window.removeEventListener('resize',viewport);document.removeEventListener('pointermove',pointer);clearTimeout(timer);cancelAnimationFrame(frame);frame=0;for(const el of entries.keys())release(el);defs?.remove();defs=null;cache.clear();}
  }
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-theme']});
  opaque.addEventListener('change',sync);contrast.addEventListener('change',sync);sync();
})();
