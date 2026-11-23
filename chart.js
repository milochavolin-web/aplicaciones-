// Hand-drawn canvas charts. No libraries. devicePixelRatio aware.
const COLORS={green:'#00d35a',red:'#ff453a',blue:'#0a84ff',t2:'rgba(235,235,245,0.6)',t3:'rgba(235,235,245,0.3)'};
function hue(s){let h=0;for(const c of String(s||'?'))h=(h*31+c.charCodeAt(0))>>>0;return h%360}
function coinColor(s){return `hsl(${hue(s)},70%,62%)`}
function setup(canvas,h){const d=window.devicePixelRatio||1,w=canvas.clientWidth;canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);
  const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,w,h);return [c,w]}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
// points:[{t:ms,v}], marks:[{t,label,color,initial,seed}]
function drawBalance(canvas,points,start,marks){
  const H=250,[c,W]=setup(canvas,H);const top=70,bot=H-18,padX=16;
  const empty=points.length<2&&!marks.length;
  let pts=points.length?points:[{t:Date.now()-3600e3,v:start},{t:Date.now(),v:start}];
  if(pts.length===1)pts=[{t:pts[0].t-60e3,v:pts[0].v},pts[0]];
  const t0=pts[0].t,t1=Math.max(pts[pts.length-1].t,t0+1);
  const vs=pts.map(p=>p.v).concat([start]);let mn=Math.min(...vs),mx=Math.max(...vs);
  if(mx-mn<start*0.02){const m=(mx+mn)/2,s=start*0.01||1;mn=m-s;mx=m+s}
  const X=t=>padX+(t-t0)/(t1-t0)*(W-2*padX),Y=v=>bot-(v-mn)/(mx-mn)*(bot-top);
  // dashed start line
  c.setLineDash([3,5]);c.strokeStyle=COLORS.t3;c.lineWidth=1;c.beginPath();c.moveTo(0,Y(start));c.lineTo(W,Y(start));c.stroke();c.setLineDash([]);
  // fill + line
  const up=pts[pts.length-1].v>=start,col=up?COLORS.green:COLORS.red;
  const g=c.createLinearGradient(0,top,0,H);g.addColorStop(0,up?'rgba(0,211,90,0.28)':'rgba(255,69,58,0.28)');g.addColorStop(1,'rgba(0,0,0,0)');
  c.beginPath();pts.forEach((p,i)=>i?c.lineTo(X(p.t),Y(p.v)):c.moveTo(X(p.t),Y(p.v)));
  c.lineTo(X(pts[pts.length-1].t),H);c.lineTo(X(pts[0].t),H);c.closePath();c.fillStyle=g;c.fill();
  c.beginPath();pts.forEach((p,i)=>i?c.lineTo(X(p.t),Y(p.v)):c.moveTo(X(p.t),Y(p.v)));c.strokeStyle=col;c.lineWidth=2.2;c.lineJoin='round';c.stroke();
  // live dot
  const lp=pts[pts.length-1];c.fillStyle=col;c.beginPath();c.arc(X(lp.t),Y(lp.v),4.5,0,7);c.fill();
  c.fillStyle=up?'rgba(0,211,90,0.25)':'rgba(255,69,58,0.25)';c.beginPath();c.arc(X(lp.t),Y(lp.v),10,0,7);c.fill();
  // marks: dot on the line + pill above; later marks move up a row if they overlap
  const valAt=t=>{let v=pts[0].v;for(const p of pts){if(p.t<=t)v=p.v;else break}return v};
  const rows=[];c.font='600 12px -apple-system,"SF Pro Text",system-ui,sans-serif';
  marks.filter(m=>m.t>=t0&&m.t<=t1+60e3).forEach(m=>{
    const x=Math.min(Math.max(X(m.t),padX),W-padX),y=Y(valAt(m.t));
    const tw=c.measureText(m.label).width,w=tw+(m.initial?34:18),h=24;let bx=Math.min(Math.max(x-w/2,4),W-w-4);
    let row=0;while((rows[row]||[]).some(r=>bx<r[1]+6&&bx+w>r[0]-6))row++;(rows[row]=rows[row]||[]).push([bx,bx+w]);
    const by=Math.max(4,Math.min(y,top+10)-34-row*30);
    c.strokeStyle=m.color;c.globalAlpha=.5;c.lineWidth=1;c.beginPath();c.moveTo(x,by+h);c.lineTo(x,y);c.stroke();c.globalAlpha=1;
    rr(c,bx,by,w,h,12);c.fillStyle=m.color;c.fill();
    let tx=bx+9;if(m.initial){c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.arc(bx+13,by+12,8,0,7);c.fill();c.fillStyle='#fff';c.font='700 10px -apple-system,system-ui,sans-serif';c.textAlign='center';c.fillText(m.initial,bx+13,by+15.5);c.textAlign='left';tx=bx+26;c.font='600 12px -apple-system,"SF Pro Text",system-ui,sans-serif'}
    c.fillStyle=m.color===COLORS.green?'#000':'#fff';c.fillText(m.label,tx,by+16);
    c.fillStyle='#000';c.beginPath();c.arc(x,y,5.5,0,7);c.fill();c.fillStyle=m.color;c.beginPath();c.arc(x,y,4,0,7);c.fill();
  });
  return !empty;
}
function drawRing(canvas,score,passAt){const S=110,[c]=setup(canvas,S);const r=46,cx=S/2,cy=S/2;
  c.lineWidth=10;c.lineCap='round';c.strokeStyle='#2c2c2e';c.beginPath();c.arc(cx,cy,r,0,7);c.stroke();
  if(score!=null){c.strokeStyle=score>=passAt?COLORS.green:'#ffd60a';c.beginPath();c.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+2*Math.PI*score/100);c.stroke()}
  c.fillStyle='#fff';c.font='700 30px -apple-system,"SF Pro Display",system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(score==null?'—':score,cx,cy+1)}
