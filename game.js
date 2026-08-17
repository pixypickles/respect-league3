(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const clockEl = document.getElementById("clock");
const msgEl = document.getElementById("message");

const W = 1280, H = 720;
const COURT = { x: 205, y: 62, w: 870, h: 596 };
const GOAL_H = 210;
const PLAYER_R = 20;
const BALL_R = 9;
const MATCH_SECONDS = 180;

const BLUE = "#2563eb";
const RED = "#dc2626";
const SKIN = "#ffd2ad";
const DARK = "#1f2937";

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm = (x,y)=>{
  const m=Math.hypot(x,y)||1;
  return {x:x/m,y:y/m,m};
};
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);

let last = performance.now();
let elapsed = 0;
let matchLeft = MATCH_SECONDS;
let scoreBlue = 0, scoreRed = 0;
let goalPause = 0;
let messageTimer = 0;

const input = {
  sx: 0, sy: 0,
  stickActive: false,
  trap: false,
  dash: false,
  dashTimer: 0,
  dashCooldown: 0,
  passCallTimer: 0,
  shootDown: false,
  shootStarted: 0
};

const teams = { blue: [], red: [] };

function makePlayer(team, x,y, role="field", controlled=false) {
  return {
    team,x,y,vx:0,vy:0,dirX:team==="blue"?1:-1,dirY:0,
    speed: role==="gk"?145:185,
    role, controlled,
    kickAnim:0, slide:0, runPhase:Math.random()*6,
    aiTimer:rand(.05,.25),
    target:null,
    receiveIntent:false,
    cooldown:0,
    possessionTime:0
  };
}

function setupTeams() {
  teams.blue.length=0; teams.red.length=0;
  teams.blue.push(makePlayer("blue", 440, 360, "field", true));
  teams.blue.push(makePlayer("blue", 535, 210));
  teams.blue.push(makePlayer("blue", 535, 510));
  teams.blue.push(makePlayer("blue", 620, 360));
  teams.blue.push(makePlayer("blue", 238, 360, "gk"));

  teams.red.push(makePlayer("red", 840, 360));
  teams.red.push(makePlayer("red", 745, 210));
  teams.red.push(makePlayer("red", 745, 510));
  teams.red.push(makePlayer("red", 660, 280));
  teams.red.push(makePlayer("red", 1042, 360, "gk"));
}
setupTeams();

const controlled = ()=>teams.blue.find(p=>p.controlled);

function blueCpuOwner() {
  return ball.owner && ball.owner.team==="blue" && !ball.owner.controlled ? ball.owner : null;
}

function requestPassToControlled() {
  // Keep the request alive briefly so it still works during a loose touch,
  // immediately after a pass, or while a CPU teammate is trapping the ball.
  input.passCallTimer = .85;
  showMessage("CALL PASS", .35);

  const owner = blueCpuOwner();
  if(owner && owner.cooldown<=.12) {
    doPass(owner, controlled());
    input.passCallTimer = 0;
  }
}


const ball = {
  x: 472, y: 360, z:0,
  vx:0, vy:0, vz:0,
  owner:null,
  lastTouch:null,
  passTarget:null,
  passFrom:null,
  returnRequested:false,
  shot:false,
  power:0,
  touchGrace:0,
  protectedTeam:null
};

function resetKickoff(team="blue") {
  for (const p of [...teams.blue,...teams.red]) {
    p.vx=p.vy=0; p.slide=0; p.kickAnim=0; p.cooldown=.35; p.receiveIntent=false;
  }
  const b=teams.blue, r=teams.red;
  Object.assign(b[0],{x:440,y:360});
  Object.assign(b[1],{x:535,y:210});
  Object.assign(b[2],{x:535,y:510});
  Object.assign(b[3],{x:620,y:360});
  Object.assign(b[4],{x:238,y:360});
  Object.assign(r[0],{x:840,y:360});
  Object.assign(r[1],{x:745,y:210});
  Object.assign(r[2],{x:745,y:510});
  Object.assign(r[3],{x:660,y:300});
  Object.assign(r[4],{x:1042,y:360});
  const starter = team==="blue"?b[0]:r[0];
  input.passCallTimer=0;
  ball.returnRequested=false;
  ball.owner=starter;
  ball.x=starter.x+(team==="blue"?30:-30);
  ball.y=starter.y;
  ball.z=0; ball.vx=ball.vy=ball.vz=0; ball.shot=false; ball.passTarget=null;
  ball.touchGrace=.18; ball.protectedTeam=starter.team;
  starter.possessionTime=0;
}

function showMessage(text, sec=.7) {
  msgEl.textContent=text;
  msgEl.style.opacity="1";
  messageTimer=sec;
}

function teamPlayers(team){ return team==="blue"?teams.blue:teams.red; }
function opponents(team){ return team==="blue"?teams.red:teams.blue; }

function closestOpponent(p) {
  let best=null, bd=Infinity;
  for(const e of opponents(p.team)) {
    if(e.role==="gk") continue;
    const d=dist(p,e);
    if(d<bd){bd=d;best=e;}
  }
  return {p:best,d:bd};
}

function nearestTeammate(p, forwardBias=false) {
  let best=null, bestScore=Infinity;
  const attack = p.team==="blue"?1:-1;
  for(const q of teamPlayers(p.team)) {
    if(q===p || q.role==="gk") continue;
    let s=dist(p,q);
    if(forwardBias) s -= (q.x-p.x)*attack*.25;
    if(s<bestScore){bestScore=s;best=q;}
  }
  return best;
}

function bestPassTarget(p, inputDir=null) {
  const mates = teamPlayers(p.team).filter(q=>q!==p && q.role!=="gk");
  if(!mates.length) return null;
  if(inputDir && Math.hypot(inputDir.x,inputDir.y)>.2) {
    let best=null, bs=-999;
    for(const q of mates) {
      const d=norm(q.x-p.x,q.y-p.y);
      const align=d.x*inputDir.x+d.y*inputDir.y;
      const score=align*2-dist(p,q)/700;
      if(score>bs){bs=score;best=q;}
    }
    return best;
  }
  let best=null, bs=Infinity;
  for(const q of mates){
    const d=dist(p,q);
    if(d<bs){bs=d;best=q;}
  }
  return best;
}

function kickBall(p, dx,dy, speed, lift=0, shot=false, target=null) {
  const n=norm(dx,dy);
  ball.owner=null;
  ball.x=p.x+n.x*28;
  ball.y=p.y+n.y*28;
  ball.z=2;
  ball.vx=n.x*speed;
  ball.vy=n.y*speed;
  ball.vz=lift;
  ball.lastTouch=p;
  ball.passFrom=p;
  ball.passTarget=target;
  ball.shot=shot;
  ball.power=speed;
  ball.touchGrace=.12;
  ball.protectedTeam=p.team;
  p.kickAnim=.22;
  p.cooldown=.18;
}

function doPass(p, forcedTarget=null) {
  if(!p || ball.owner!==p) return;
  let target=forcedTarget;
  if(!target) {
    if(p.controlled && Math.hypot(input.sx,input.sy)>.2) {
      target=bestPassTarget(p,{x:input.sx,y:input.sy});
    } else target=bestPassTarget(p);
  }
  if(!target) return;
  target.receiveIntent=true;
  const lead = target.controlled ? 95 : 62;
  let tx=target.x + target.dirX*lead;
  let ty=target.y + target.dirY*lead;
  if(target.controlled && Math.hypot(input.sx,input.sy)>.15) {
    tx=target.x+input.sx*120; ty=target.y+input.sy*120;
  }
  kickBall(p,tx-p.x,ty-p.y,420,38,false,target);
}

function playerShoot(p, chargeSec) {
  if(ball.owner!==p) return;
  const stickMag=Math.hypot(input.sx,input.sy);
  let dx = stickMag>.18?input.sx:p.dirX;
  let dy = stickMag>.18?input.sy:p.dirY;
  if(Math.hypot(dx,dy)<.1){dx=p.team==="blue"?1:-1;dy=0;}

  let speed,lift,label;
  if(chargeSec < .095) {
    speed=365; lift=165; label="LOOP";
  } else if(chargeSec > .34) {
    const t=clamp((chargeSec-.34)/.45,0,1);
    speed=610+120*t; lift=42; label="POWER";
  } else {
    speed=505; lift=26; label="SHOT";
  }
  kickBall(p,dx,dy,speed,lift,true,null);
  showMessage(label,.35);
}

function trapWindowFor(p) {
  if(ball.owner) return false;
  const d=dist(p,ball);
  return d < 42 + Math.min(32, Math.hypot(ball.vx,ball.vy)*.045) && ball.z<28;
}

function attemptTrap(p, dt) {
  if(!trapWindowFor(p)) return false;

  // Immediately after a touch, the opposing CPU cannot instantly poke/trap it back.
  if(ball.touchGrace>0 && ball.protectedTeam && p.team!==ball.protectedTeam) {
    return false;
  }

  const speed=Math.hypot(ball.vx,ball.vy);
  const closing = speed>100;

  if(input.trap && p.controlled) {
    ball.owner=p;
    ball.vx=ball.vy=ball.vz=0;
    ball.z=0;
    ball.lastTouch=p;
    ball.touchGrace=.18;
    ball.protectedTeam=p.team;
    p.possessionTime=0;
    p.kickAnim=.16;
    showMessage(speed>500?"SUPER TRAP!":"TRAP!",.38);
    return true;
  }

  if(!p.controlled) {
    // Only one CPU from each team is allowed to contest a loose ball.
    const squad=teamPlayers(p.team).filter(q=>q.role!=="gk" && !q.controlled);
    const nearest=squad.slice().sort((a,b)=>dist(a,ball)-dist(b,ball))[0];

    // Intended receiver always has priority. Otherwise only nearest CPU may take it.
    const allowed = (ball.passTarget===p) || (nearest===p);
    if(!allowed) return false;

    // If an opponent is simultaneously very close, don't let both auto-trap every frame.
    const oppNear = opponents(p.team)
      .filter(q=>q.role!=="gk")
      .some(q=>dist(q,ball)<42);

    let success = Math.random() < (speed>550?.72:.94);
    if(oppNear && ball.passTarget!==p) success = Math.random()<.58;

    if(success) {
      ball.owner=p;
      ball.vx=ball.vy=ball.vz=0;
      ball.z=0;
      ball.lastTouch=p;
      ball.touchGrace=.20;
      ball.protectedTeam=p.team;
      p.possessionTime=0;
      p.receiveIntent=false;
      return true;
    }
  }

  if(closing && p.controlled && !input.trap) {
    const n=norm(ball.vx,ball.vy);
    ball.vx=n.x*speed*.42 + rand(-55,55);
    ball.vy=n.y*speed*.42 + rand(-55,55);
    ball.vz=Math.max(ball.vz,95);
    showMessage("BOUNCE",.38);
  }
  return false;
}
function defensivePoke(actor) {
  if(ball.owner && ball.owner.team!==actor.team && dist(actor,ball.owner)<58) {
    const e=ball.owner;
    const n=norm(e.x-actor.x,e.y-actor.y);
    ball.owner=null;
    ball.x=e.x-n.x*18; ball.y=e.y-n.y*18;
    ball.vx=n.x*180+actor.dirX*120; ball.vy=n.y*180+actor.dirY*120; ball.vz=25;
    ball.lastTouch=actor;
    ball.touchGrace=.20;
    ball.protectedTeam=actor.team;
    actor.kickAnim=.18;
    return true;
  }
  if(!ball.owner && dist(actor,ball)<55 && ball.z<22) {
    const n=norm(actor.dirX,actor.dirY);
    ball.vx=n.x*290; ball.vy=n.y*290; ball.vz=18; ball.lastTouch=actor; actor.kickAnim=.18;
    return true;
  }
  return false;
}

function slide(actor) {
  if(actor.role==="gk" || actor.slide>0 || actor.cooldown>0) return;
  actor.slide=.38;
  actor.cooldown=.7;
  const n=norm(actor.dirX,actor.dirY);
  actor.vx=n.x*410; actor.vy=n.y*410;
}

function checkSlideSteal(p) {
  if(p.slide<=0) return;
  if(ball.owner && ball.owner.team!==p.team && dist(p,ball.owner)<50) {
    const victim=ball.owner;
    ball.owner=null;
    const n=norm(victim.x-p.x,victim.y-p.y);
    ball.x=victim.x+n.x*22; ball.y=victim.y+n.y*22;
    ball.vx=n.x*250+p.dirX*100; ball.vy=n.y*250+p.dirY*100; ball.vz=45;
    ball.lastTouch=p;
    ball.touchGrace=.20;
    ball.protectedTeam=p.team;
  } else if(!ball.owner && dist(p,ball)<45 && ball.z<24) {
    ball.vx=p.dirX*300; ball.vy=p.dirY*300; ball.vz=35; ball.lastTouch=p;
  }
}

function offBallAction(team, type) {
  const owner=ball.owner;
  let candidates=teamPlayers(team).filter(p=>p.role!=="gk");
  if(owner && owner.team!==team) candidates.sort((a,b)=>dist(a,owner)-dist(b,owner));
  else candidates.sort((a,b)=>dist(a,ball)-dist(b,ball));
  const main=controlled();
  if(type==="poke") {
    if(defensivePoke(main)) return;
    for(const p of candidates) if(p!==main && ((owner&&dist(p,owner)<68)||(!owner&&dist(p,ball)<68))) {
      if(defensivePoke(p)) return;
    }
  } else if(type==="slide") {
    if(owner && owner.team!==team && dist(main,owner)<120){slide(main);return;}
    for(const p of candidates) if(p!==main && owner && owner.team!==team && dist(p,owner)<100){slide(p);return;}
  }
}

function updateControlled(p,dt) {
  let mag=Math.hypot(input.sx,input.sy);
  let dx=input.sx,dy=input.sy;
  if(mag>1){dx/=mag;dy/=mag;mag=1;}
  if(mag>.08){p.dirX=dx;p.dirY=dy;}

  if(p.slide>0) return;

  input.dashTimer=Math.max(0,input.dashTimer-dt);
  input.dashCooldown=Math.max(0,input.dashCooldown-dt);
  const bursting=input.dashTimer>0;
  const max=p.speed*(bursting?2.12:1);
  const response=bursting?18:10;
  p.vx=lerp(p.vx,dx*max,clamp(dt*response,0,1));
  p.vy=lerp(p.vy,dy*max,clamp(dt*response,0,1));

  if(ball.owner===p) {
    p.possessionTime+=dt;
    // Core mechanic: holding trap is required to keep dribbling.
    if(input.trap) {
      const n=norm(p.dirX,p.dirY);
      ball.x=p.x+n.x*31; ball.y=p.y+n.y*31; ball.z=0;
      ball.vx=p.vx; ball.vy=p.vy;
    } else if(p.possessionTime>.10) {
      const n=norm(p.dirX,p.dirY);
      ball.owner=null;
      ball.x=p.x+n.x*30; ball.y=p.y+n.y*30;
      ball.vx=p.vx*.78+n.x*70; ball.vy=p.vy*.78+n.y*70; ball.vz=10;
      showMessage("BALL LOOSE",.28);
    }
  }
}

function openSpaceScore(p,x,y) {
  let nearest=999;
  for(const e of opponents(p.team)) nearest=Math.min(nearest,Math.hypot(x-e.x,y-e.y));
  return nearest;
}

function aiMoveOffBall(p,dt) {
  const attack=p.team==="blue"?1:-1;
  const squad=teamPlayers(p.team).filter(q=>q.role!=="gk");
  const idx=squad.indexOf(p);
  let tx=p.x,ty=p.y;

  if(ball.owner && ball.owner.team===p.team) {
    const o=ball.owner;
    // Stable support lanes. CPU players spread around the ball instead of all chasing it.
    const lanes=[-175,175,-70,90];
    const depths=[95,95,215,-145];
    const lane=lanes[idx%lanes.length];
    const depth=depths[idx%depths.length];
    tx=clamp(o.x+attack*depth,COURT.x+105,COURT.x+COURT.w-105);
    ty=clamp(H/2+lane,COURT.y+70,COURT.y+COURT.h-70);

    // If this player is the intended receiver, attack the passing lane.
    if(ball.passTarget===p || p.receiveIntent) {
      tx=clamp(p.x+attack*75,COURT.x+90,COURT.x+COURT.w-90);
      ty=clamp(p.y+p.dirY*55,COURT.y+60,COURT.y+COURT.h-60);
    }
  } else if(ball.owner && ball.owner.team!==p.team) {
    const e=ball.owner;
    const field=squad.slice().sort((a,b)=>dist(a,e)-dist(b,e));
    const press=field[0]===p;
    if(press) {
      tx=e.x-attack*34; ty=e.y;
    } else {
      // Everyone else protects a different lane rather than collapsing onto the ball.
      const defendX=p.team==="blue"?360:920;
      const laneY=[190,360,530,285][idx%4];
      tx=lerp(defendX,e.x,.18);
      ty=lerp(laneY,e.y,.12);
    }
  } else {
    // Only one player per team attacks a loose ball. Others stay in support lanes.
    const nearest=squad.slice().sort((a,b)=>dist(a,ball)-dist(b,ball))[0];
    if(nearest===p){
      const enemyNearest=opponents(p.team)
        .filter(q=>q.role!=="gk")
        .sort((a,b)=>dist(a,ball)-dist(b,ball))[0];

      // Approach from own side instead of standing directly on top of the opponent.
      const ownSide=p.team==="blue"?-1:1;
      tx=ball.x + ownSide*18;
      ty=ball.y;
      if(enemyNearest && dist(enemyNearest,ball)<45){
        ty += Math.sign(p.y-enemyNearest.y || (idx%2?1:-1))*22;
      }
    } else {
      tx=p.team==="blue"?430:850;
      ty=[190,360,530,285][idx%4];
    }
  }

  const n=norm(tx-p.x,ty-p.y);
  if(n.m>8){p.dirX=n.x;p.dirY=n.y;}
  const desired=n.m<18?0:p.speed*.78;
  p.vx=lerp(p.vx,n.x*desired,clamp(dt*5,0,1));
  p.vy=lerp(p.vy,n.y*desired,clamp(dt*5,0,1));
}
function aiWithBall(p,dt) {
  p.possessionTime+=dt;
  p.aiTimer-=dt;

  // Player pass-call has top priority for a short window.
  if(p.team==="blue" && !p.controlled && input.passCallTimer>0 && p.cooldown<=.12) {
    doPass(p,controlled());
    input.passCallTimer=0;
    return;
  }
  const near=closestOpponent(p);
  const attack=p.team==="blue"?1:-1;
  const goalX=p.team==="blue"?COURT.x+COURT.w:COURT.x;
  const goalY=H/2;
  const goalDist=Math.hypot(goalX-p.x,goalY-p.y);

  // CPU prefers passing. Dribble only when clearly unpressured.
  if(p.aiTimer<=0) {
    p.aiTimer=rand(.22,.42);

    if(goalDist<260 && Math.abs(p.y-goalY)<180 && near.d>90) {
      const aimY=goalY+rand(-75,75);
      kickBall(p,goalX-p.x,aimY-p.y,rand(470,610),rand(18,48),true,null);
      return;
    }

    let target=bestPassTarget(p);
    if(target && (near.d<180 || Math.random()<.72)) {
      doPass(p,target);
      return;
    }
  }

  let dx=0,dy=0;
  if(near.d>230) {
    dx=attack;
    dy=clamp((goalY-p.y)/210,-.55,.55);
  } else {
    // shield / look for lane, very little "take-on" dribbling
    dx=attack*.18;
    dy=near.p ? Math.sign(p.y-near.p.y)*.9 : 0;
  }
  const n=norm(dx,dy);
  p.dirX=n.x;p.dirY=n.y;
  p.vx=lerp(p.vx,n.x*p.speed*.72,dt*4);
  p.vy=lerp(p.vy,n.y*p.speed*.72,dt*4);
  ball.x=p.x+n.x*31;ball.y=p.y+n.y*31;ball.z=0;ball.vx=p.vx;ball.vy=p.vy;
}

function updateAI(p,dt) {
  if(p.role==="gk") return;
  if(p.controlled){updateControlled(p,dt);return;}
  if(p.slide>0)return;
  if(ball.owner===p) aiWithBall(p,dt);
  else aiMoveOffBall(p,dt);

  // Only the closest defender actively challenges, preventing CPU pile-ups.
  if(ball.owner && ball.owner.team!==p.team && p.cooldown<=0 && ball.touchGrace<=0) {
    const e=ball.owner;
    const nearest=teamPlayers(p.team).filter(q=>q.role!=="gk").sort((a,b)=>dist(a,e)-dist(b,e))[0];
    if(nearest===p && dist(p,e)<50) {
      if(Math.random()<dt*1.25) defensivePoke(p);
      else if(Math.random()<dt*.22) slide(p);
    }
  }
}

function updateGK(p,dt) {
  const ownLeft=p.team==="blue";
  const gx=ownLeft?COURT.x+30:COURT.x+COURT.w-30;
  const gy=clamp(ball.y,H/2-GOAL_H/2+25,H/2+GOAL_H/2-25);
  const targetY=ball.owner && ball.owner.team===p.team ? H/2 : gy;
  p.x=lerp(p.x,gx,dt*6);
  p.y=lerp(p.y,targetY,dt*3.5);

  const danger = !ball.owner && ball.shot && ball.z<60 && dist(p,ball)<58;
  if(danger) {
    const centerFactor=1-clamp(Math.abs(ball.y-H/2)/(GOAL_H*.5),0,1);
    const strong=ball.power>590;
    let saveChance=strong ? (.18+.42*centerFactor) : (.68+.27*centerFactor);

    // Player-controlled blue keeper can catch any shot with perfectly timed trap.
    if(p.team==="blue" && input.trap && dist(p,ball)<52) {
      ball.owner=p;ball.vx=ball.vy=ball.vz=0;ball.z=0;ball.shot=false;
      showMessage("GK SUPER CATCH!",.7);
      return;
    }

    if(Math.random()<saveChance) {
      if(!strong && Math.random()<.68) {
        // normal shots often parried
        const n=norm(ball.x-p.x,ball.y-p.y);
        ball.vx=(ownLeft?1:-1)*280;
        ball.vy=n.y*300+rand(-80,80);
        ball.vz=80;
        ball.shot=false;
      } else {
        ball.owner=p;ball.vx=ball.vy=ball.vz=0;ball.z=0;ball.shot=false;
      }
    }
  }

  if(ball.owner===p) {
    p.aiTimer-=dt;
    if(p.aiTimer<=0) {
      p.aiTimer=.45;
      const target=bestPassTarget(p);
      if(target) doPass(p,target);
    }
  }
}

function updatePhysics(dt) {
  ball.touchGrace=Math.max(0,ball.touchGrace-dt);
  if(ball.touchGrace<=0) ball.protectedTeam=null;

  for(const p of [...teams.blue,...teams.red]) {
    p.cooldown=Math.max(0,p.cooldown-dt);
    p.kickAnim=Math.max(0,p.kickAnim-dt);
    p.slide=Math.max(0,p.slide-dt);

    if(p.slide<=0) {
      p.x+=p.vx*dt;p.y+=p.vy*dt;
    } else {
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.vx*=Math.pow(.07,dt);p.vy*=Math.pow(.07,dt);
    }

    p.x=clamp(p.x,COURT.x+25,COURT.x+COURT.w-25);
    p.y=clamp(p.y,COURT.y+25,COURT.y+COURT.h-25);
    const speed=Math.hypot(p.vx,p.vy);
    if(speed>12)p.runPhase+=dt*speed*.045;

    checkSlideSteal(p);
  }

  // Mild player separation
  const all=[...teams.blue,...teams.red];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j], d=dist(a,b);
    if(d<PLAYER_R*1.75 && d>0){
      const n=norm(a.x-b.x,a.y-b.y), push=(PLAYER_R*1.85-d)*.34;
      a.x+=n.x*push;b.x-=n.x*push;a.y+=n.y*push;b.y-=n.y*push;
    }
  }

  if(ball.owner) {
    const o=ball.owner;
    if(o.role==="gk") { ball.x=o.x+(o.team==="blue"?24:-24);ball.y=o.y; }
  } else {
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    ball.z+=ball.vz*dt;
    ball.vz-=430*dt;
    if(ball.z<0){ball.z=0;ball.vz=Math.abs(ball.vz)*.38;}
    const friction=ball.z===0?Math.pow(.25,dt):Math.pow(.82,dt);
    ball.vx*=friction;ball.vy*=friction;

    for(const p of all) {
      if(p.cooldown>.16) continue;
      if(attemptTrap(p,dt)) break;
    }
  }

  // Persistent pass call: if a CPU teammate gains control during the request window,
  // return/pass it to the controlled player immediately.
  input.passCallTimer=Math.max(0,input.passCallTimer-dt);
  if(input.passCallTimer>0 && ball.owner && ball.owner.team==="blue" && ball.owner!==controlled() && ball.owner.cooldown<=.12) {
    doPass(ball.owner,controlled());
    input.passCallTimer=0;
  }

  // Return pass: press pass while outgoing pass is still traveling to teammate.
  if(ball.returnRequested && ball.owner && ball.owner.team==="blue" && ball.owner!==controlled()) {
    const receiver=ball.owner;
    const c=controlled();
    const runMag=Math.hypot(input.sx,input.sy);
    let dx=runMag>.18?input.sx:c.dirX, dy=runMag>.18?input.sy:c.dirY;
    // Put the return ball well ahead of the player's running direction.
    // The short burst dash is intended to help the player catch up and fine-tune the run.
    const lead=255;
    const targetX=clamp(c.x+dx*lead,COURT.x+45,COURT.x+COURT.w-45);
    const targetY=clamp(c.y+dy*lead,COURT.y+45,COURT.y+COURT.h-45);
    receiver.receiveIntent=false;
    kickBall(receiver,targetX-receiver.x,targetY-receiver.y,465,26,false,c);
    ball.returnRequested=false;
    showMessage("RETURN!",.4);
  }

  handleWallsAndGoals();
}

function handleWallsAndGoals() {
  const goalTop=H/2-GOAL_H/2, goalBot=H/2+GOAL_H/2;

  if(ball.y<COURT.y+BALL_R){ball.y=COURT.y+BALL_R;ball.vy=Math.abs(ball.vy)*.72;}
  if(ball.y>COURT.y+COURT.h-BALL_R){ball.y=COURT.y+COURT.h-BALL_R;ball.vy=-Math.abs(ball.vy)*.72;}

  if(ball.x<COURT.x-BALL_R) {
    if(ball.y>goalTop&&ball.y<goalBot&&ball.z<95){scoreRed++;goal("RED");}
    else {ball.x=COURT.x+BALL_R;ball.vx=Math.abs(ball.vx)*.65;}
  }
  if(ball.x>COURT.x+COURT.w+BALL_R) {
    if(ball.y>goalTop&&ball.y<goalBot&&ball.z<95){scoreBlue++;goal("BLUE");}
    else {ball.x=COURT.x+COURT.w-BALL_R;ball.vx=-Math.abs(ball.vx)*.65;}
  }
}

function goal(who) {
  goalPause=1.1;
  showMessage(`${who} GOAL!`,1);
  scoreEl.textContent=`BLUE ${scoreBlue} - ${scoreRed} RED`;
  ball.owner=null;ball.vx=ball.vy=ball.vz=0;ball.shot=false;
}

function update(dt) {
  if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)msgEl.style.opacity="0";}
  if(goalPause>0) {
    goalPause-=dt;
    if(goalPause<=0) resetKickoff(scoreBlue<=scoreRed?"blue":"red");
    return;
  }

  matchLeft=Math.max(0,matchLeft-dt);
  const m=Math.floor(matchLeft/60),s=Math.floor(matchLeft%60).toString().padStart(2,"0");
  clockEl.textContent=`${m}:${s}`;
  if(matchLeft<=0){ showMessage("TIME UP",1); matchLeft=MATCH_SECONDS; scoreBlue=scoreRed=0; scoreEl.textContent="BLUE 0 - 0 RED"; resetKickoff("blue"); }

  for(const p of teams.blue) p.role==="gk"?updateGK(p,dt):updateAI(p,dt);
  for(const p of teams.red) p.role==="gk"?updateGK(p,dt):updateAI(p,dt);

  updatePhysics(dt);
}

function drawCourt() {
  ctx.fillStyle="#d59a62";ctx.fillRect(0,0,W,H);

  // wooden floor strips
  for(let y=0;y<H;y+=30){
    ctx.fillStyle = (Math.floor(y/30)%2===0) ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.025)";
    ctx.fillRect(0,y,W,30);
  }
  for(let x=0;x<W;x+=120){
    ctx.strokeStyle="rgba(90,45,20,.12)";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
  }

  ctx.strokeStyle="#f8fafc";ctx.lineWidth=5;
  ctx.strokeRect(COURT.x,COURT.y,COURT.w,COURT.h);
  ctx.beginPath();ctx.moveTo(W/2,COURT.y);ctx.lineTo(W/2,COURT.y+COURT.h);ctx.stroke();
  ctx.beginPath();ctx.arc(W/2,H/2,85,0,Math.PI*2);ctx.stroke();

  const goalTop=H/2-GOAL_H/2;
  ctx.strokeRect(COURT.x-38,goalTop,38,GOAL_H);
  ctx.strokeRect(COURT.x+COURT.w,goalTop,38,GOAL_H);

  // penalty arcs/areas
  ctx.strokeRect(COURT.x, H/2-150, 135, 300);
  ctx.strokeRect(COURT.x+COURT.w-135,H/2-150,135,300);
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x,p.y);
  // Character artwork stays upright on screen. Movement direction does not rotate the head/body.
  if(p.slide>0) {
    ctx.rotate(-.15);
    ctx.fillStyle=p.team==="blue"?BLUE:RED;
    ctx.fillRect(-23,-11,48,22);
    ctx.strokeStyle=DARK;ctx.lineWidth=6;
    ctx.beginPath();ctx.moveTo(12,7);ctx.lineTo(43,15);ctx.moveTo(9,-6);ctx.lineTo(39,-16);ctx.stroke();
    ctx.fillStyle=SKIN;ctx.beginPath();ctx.arc(-22,0,10,0,Math.PI*2);ctx.fill();
    ctx.restore();return;
  }

  const moving=Math.hypot(p.vx,p.vy)>25;
  const swing=moving?Math.sin(p.runPhase)*10:0;
  const kick=p.kickAnim>0 ? 24*Math.sin((p.kickAnim/.22)*Math.PI) : 0;

  // legs
  ctx.strokeStyle=DARK;ctx.lineWidth=7;ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-2,10);ctx.lineTo(-8-swing,30);
  ctx.moveTo(5,10);ctx.lineTo(11+swing+kick,30);
  ctx.stroke();

  // body
  ctx.fillStyle=p.team==="blue"?BLUE:RED;
  ctx.beginPath();ctx.roundRect(-13,-13,27,35,8);ctx.fill();

  // arms
  ctx.strokeStyle=SKIN;ctx.lineWidth=6;
  ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-19,8+swing*.35);ctx.moveTo(11,-7);ctx.lineTo(20,7-swing*.35);ctx.stroke();

  // head no hair, dot eyes
  ctx.fillStyle=SKIN;ctx.beginPath();ctx.arc(0,-26,13,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#111827";
  ctx.beginPath();
  ctx.arc(-4,-30,1.7,0,Math.PI*2);
  ctx.arc(4,-30,1.7,0,Math.PI*2);
  ctx.fill();

  if(p.controlled) {
    ctx.strokeStyle="#fde047";ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(0,4,29,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#fde047";
    ctx.beginPath();ctx.moveTo(0,-48);ctx.lineTo(-7,-60);ctx.lineTo(7,-60);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function drawBall() {
  const shadowScale=clamp(1-ball.z/220,.35,1);
  ctx.save();
  ctx.globalAlpha=.24;
  ctx.fillStyle="#000";
  ctx.beginPath();ctx.ellipse(ball.x,ball.y+7,BALL_R*1.2*shadowScale,BALL_R*.55*shadowScale,0,0,Math.PI*2);ctx.fill();
  ctx.restore();

  ctx.save();ctx.translate(ball.x,ball.y-ball.z);
  ctx.fillStyle="#f8fafc";ctx.beginPath();ctx.arc(0,0,BALL_R,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#111827";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#111827";
  ctx.beginPath();ctx.arc(2,-1,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0,0,W,H);
  drawCourt();

  // sort by y for a tiny bit of depth
  const all=[...teams.blue,...teams.red].sort((a,b)=>a.y-b.y);
  for(const p of all) drawPlayer(p);
  drawBall();

  // subtle trap timing indicator around controlled player when ball is arriving
  const c=controlled();
  if(!ball.owner && dist(c,ball)<105) {
    const closeness=clamp(1-dist(c,ball)/105,0,1);
    ctx.strokeStyle=`rgba(34,197,94,${.22+.65*closeness})`;
    ctx.lineWidth=6;
    ctx.beginPath();ctx.arc(c.x,c.y,35+8*(1-closeness),0,Math.PI*2);ctx.stroke();
  }
}

function frame(now) {
  const dt=Math.min(.033,(now-last)/1000);
  last=now;elapsed+=dt;
  update(dt);draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Touch / pointer stick ----------
const stickZone=document.getElementById("stickZone");
const stickBase=document.getElementById("stickBase");
const stickKnob=document.getElementById("stickKnob");
let stickPointer=null;

function updateStick(clientX,clientY) {
  const r=stickBase.getBoundingClientRect();
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=clientX-cx,dy=clientY-cy;
  const max=r.width*.37;
  const n=norm(dx,dy);
  const m=Math.min(max,Math.hypot(dx,dy));
  dx=n.x*m;dy=n.y*m;
  input.sx=dx/max;input.sy=dy/max;
  stickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
function releaseStick(){
  stickPointer=null;input.sx=input.sy=0;input.stickActive=false;
  stickKnob.style.transform="translate(0,0)";
}
stickZone.addEventListener("pointerdown",e=>{stickPointer=e.pointerId;input.stickActive=true;stickZone.setPointerCapture(e.pointerId);updateStick(e.clientX,e.clientY);});
stickZone.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)updateStick(e.clientX,e.clientY);});
stickZone.addEventListener("pointerup",e=>{if(e.pointerId===stickPointer)releaseStick();});
stickZone.addEventListener("pointercancel",releaseStick);

// ---------- Buttons ----------
const passBtn=document.getElementById("passBtn");
const trapBtn=document.getElementById("trapBtn");
const shootBtn=document.getElementById("shootBtn");
const dashBtn=document.getElementById("dashBtn");

function bindHold(btn, key) {
  let pid=null;
  btn.addEventListener("pointerdown",e=>{e.preventDefault();pid=e.pointerId;btn.setPointerCapture(pid);input[key]=true;btn.classList.add("active");});
  const up=e=>{if(pid!==null && (!e || e.pointerId===pid)){input[key]=false;btn.classList.remove("active");pid=null;}};
  btn.addEventListener("pointerup",up);btn.addEventListener("pointercancel",up);
}
bindHold(trapBtn,"trap");

// DASH is a quick burst, not a hold-to-sprint button.
dashBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  if(input.dashCooldown<=0){
    input.dashTimer=.19;
    input.dashCooldown=.34;
    dashBtn.classList.add("active");
    setTimeout(()=>dashBtn.classList.remove("active"),150);
  }
});

passBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  const c=controlled();

  if(ball.owner===c) {
    doPass(c);
    return;
  }

  // If our pass is still travelling to a teammate, this means one-two / return request.
  if(!ball.owner && ball.passFrom===c && ball.passTarget && ball.passTarget.team==="blue") {
    ball.returnRequested=true;
    showMessage("RETURN REQUEST",.35);
    return;
  }

  // Whenever our team has the ball, or the ball was most recently played by blue,
  // remember the request instead of requiring a perfect single-frame press.
  if((ball.owner && ball.owner.team==="blue") ||
     (!ball.owner && ball.lastTouch && ball.lastTouch.team==="blue")) {
    requestPassToControlled();
    return;
  }

  offBallAction("blue","poke");
});
passBtn.addEventListener("pointerup",()=>{});

shootBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  input.shootDown=true;
  input.shootStarted=performance.now();
  shootBtn.classList.add("active");
});
function releaseShoot() {
  if(!input.shootDown)return;
  input.shootDown=false;shootBtn.classList.remove("active");
  const held=(performance.now()-input.shootStarted)/1000;
  const c=controlled();
  if(ball.owner===c) playerShoot(c,held);
  else offBallAction("blue","slide");
}
shootBtn.addEventListener("pointerup",releaseShoot);
shootBtn.addEventListener("pointercancel",releaseShoot);

// Desktop testing
const keys=new Set();
addEventListener("keydown",e=>{
  keys.add(e.code);
  if(e.code==="KeyZ") input.trap=true;
  if(e.code==="KeyX"&&!e.repeat && input.dashCooldown<=0){input.dashTimer=.19;input.dashCooldown=.34;}
  if(e.code==="KeyA"&&!e.repeat) passBtn.dispatchEvent(new PointerEvent("pointerdown",{pointerId:99}));
  if(e.code==="KeyS"&&!e.repeat){input.shootDown=true;input.shootStarted=performance.now();}
});
addEventListener("keyup",e=>{
  keys.delete(e.code);
  if(e.code==="KeyZ")input.trap=false;
  if(e.code==="KeyS")releaseShoot();
});
setInterval(()=>{
  let x=0,y=0;
  if(keys.has("ArrowLeft"))x--;
  if(keys.has("ArrowRight"))x++;
  if(keys.has("ArrowUp"))y--;
  if(keys.has("ArrowDown"))y++;
  const n=norm(x,y);
  input.sx=x||y?n.x:0;input.sy=x||y?n.y:0;
},16);

resetKickoff("blue");
})();
