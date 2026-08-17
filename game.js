(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const clockEl = document.getElementById("clock");
const msgEl = document.getElementById("message");
const menuOverlayEl = document.getElementById("menuOverlay");
const teamScreenEl = document.getElementById("teamScreen");
const modeScreenEl = document.getElementById("modeScreen");
const opponentScreenEl = document.getElementById("opponentScreen");
const resultScreenEl = document.getElementById("resultScreen");
const teamGridEl = document.getElementById("teamGrid");
const soundOnBtnEl = document.getElementById("soundOnBtn");
const opponentGridEl = document.getElementById("opponentGrid");
const selectedTeamNameEl = document.getElementById("selectedTeamName");
const tournamentBtnEl = document.getElementById("tournamentBtn");
const freeMatchBtnEl = document.getElementById("freeMatchBtn");
const practiceBtnEl = document.getElementById("practiceBtn");
const practiceScreenEl = document.getElementById("practiceScreen");
const soloPracticeBtnEl = document.getElementById("soloPracticeBtn");
const partnerPracticeBtnEl = document.getElementById("partnerPracticeBtn");
const practiceBackBtnEl = document.getElementById("practiceBackBtn");
const tutorialHudEl = document.getElementById("tutorialHud");
const tutorialStepEl = document.getElementById("tutorialStep");
const tutorialTextEl = document.getElementById("tutorialText");
const tutorialExitBtnEl = document.getElementById("tutorialExitBtn");
const modeBackBtnEl = document.getElementById("modeBackBtn");
const opponentBackBtnEl = document.getElementById("opponentBackBtn");
const resultKickerEl = document.getElementById("resultKicker");
const resultTitleEl = document.getElementById("resultTitle");
const resultScoreEl = document.getElementById("resultScore");
const tournamentProgressEl = document.getElementById("tournamentProgress");
const resultActionsEl = document.getElementById("resultActions");

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

const TEAM_DEFS = [
  {id:"blizzard", name:"BLIZZARD FOX", kit:"blizzard", primary:"#f8fafc", secondary:"#2563eb"},
  {id:"salvida-a", name:"SALVIDA A", kit:"salvida-a", primary:"#7a1832", secondary:"#7a1832"},
  {id:"salvida-b", name:"SALVIDA B", kit:"salvida-b", primary:"#22c7c4", secondary:"#22c7c4"},
  {id:"takezo", name:"TAKE-ZO", kit:"takezo", primary:"#f05aa6", secondary:"#172554"},
  {id:"manchester-p", name:"漫チェスターP", kit:"manchester-p", primary:"#081a3a", secondary:"#081a3a"}
];

let selectedTeamId="blizzard";
let opponentTeamId="salvida-a";
let gameMode=null;
let gamePhase="menu";
let tournamentOpponents=[];
let tournamentRound=0;
let matchFinished=false;
let practiceType=null;
let tutorialIndex=0;
let tutorialTimer=0;
let tutorialFlags={};
let practicePartner=null;

function teamDef(id){
  return TEAM_DEFS.find(t=>t.id===id) || TEAM_DEFS[0];
}
function sideTeam(side){
  return side==="blue" ? teamDef(selectedTeamId) : teamDef(opponentTeamId);
}


const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm = (x,y)=>{
  const m=Math.hypot(x,y)||1;
  return {x:x/m,y:y/m,m};
};
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);

function setMenuScreen(which){
  for(const el of [teamScreenEl,modeScreenEl,opponentScreenEl,practiceScreenEl,resultScreenEl]){
    el.classList.add("hidden");
  }
  which.classList.remove("hidden");
  menuOverlayEl.classList.remove("hidden");
  document.body.classList.add("menu-open");
}

function hideMenu(){
  menuOverlayEl.classList.add("hidden");
  document.body.classList.remove("menu-open");
}

function kitClass(id){ return "kit-"+id; }

function makeTeamCard(t,onPick){
  const btn=document.createElement("button");
  btn.className="team-card";
  const kit=document.createElement("div");
  kit.className="kit-preview "+kitClass(t.id);
  const name=document.createElement("span");
  name.className="team-name";
  name.textContent=t.name;
  btn.appendChild(kit);
  btn.appendChild(name);
  btn.addEventListener("click",()=>onPick(t.id));
  return btn;
}

function renderTeamSelection(){
  teamGridEl.innerHTML="";
  for(const t of TEAM_DEFS){
    teamGridEl.appendChild(makeTeamCard(t,(id)=>{
      selectedTeamId=id;
      selectedTeamNameEl.textContent=teamDef(id).name;
      setMenuScreen(modeScreenEl);
    }));
  }
}

function renderOpponentSelection(){
  opponentGridEl.innerHTML="";
  for(const t of TEAM_DEFS){
    if(t.id===selectedTeamId) continue;
    opponentGridEl.appendChild(makeTeamCard(t,(id)=>{
      gameMode="free";
      startMatch(id);
    }));
  }
}

function updateScoreLabel(){
  scoreEl.textContent=`${teamDef(selectedTeamId).name} ${scoreBlue} - ${scoreRed} ${teamDef(opponentTeamId).name}`;
}

function prepareMatch(){
  scoreBlue=0;
  scoreRed=0;
  matchLeft=MATCH_SECONDS;
  goalPause=0;
  messageTimer=0;
  matchFinished=false;
  input.passCallTimer=0;
  input.shootDown=false;
  input.shootBallLock=false;
  if(input.pendingShotTimer!==null){
    clearTimeout(input.pendingShotTimer);
    input.pendingShotTimer=null;
  }
  updateScoreLabel();
  clockEl.textContent="3:00";
  resetKickoff("blue");
}

function startMatch(opponentId){
  opponentTeamId=opponentId;
  gamePhase="match";
  prepareMatch();
  hideMenu();
}

function addResultButton(text,primary,fn){
  const b=document.createElement("button");
  b.className="menu-button"+(primary?" primary":"");
  b.textContent=text;
  b.addEventListener("click",fn);
  resultActionsEl.appendChild(b);
}

function returnToMainMenu(){
  gameMode=null;
  gamePhase="menu";
  tournamentOpponents=[];
  tournamentRound=0;
  setMenuScreen(teamScreenEl);
}

function finishMatch(){
  if(matchFinished) return;
  matchFinished=true;
  gamePhase="result";
  ball.owner=null;
  ball.vx=ball.vy=ball.vz=0;
  resultActionsEl.innerHTML="";
  resultScoreEl.textContent=`${scoreBlue} - ${scoreRed}`;
  resultKickerEl.textContent=gameMode==="tournament" ? `TOURNAMENT ${tournamentRound+1}/4` : "FREE MATCH";
  tournamentProgressEl.textContent="";

  if(gameMode==="tournament"){
    if(scoreBlue>scoreRed){
      if(tournamentRound>=3){
        resultTitleEl.textContent="優勝！";
        tournamentProgressEl.textContent="4試合勝ち抜き達成";
        addResultButton("チーム選択へ",true,returnToMainMenu);
      } else {
        resultTitleEl.textContent="WIN";
        tournamentProgressEl.textContent=`${tournamentRound+1}勝 / 4勝`;
        addResultButton("次の試合へ",true,()=>{
          tournamentRound++;
          startMatch(tournamentOpponents[tournamentRound]);
        });
        addResultButton("終了",false,returnToMainMenu);
      }
    } else if(scoreBlue===scoreRed){
      resultTitleEl.textContent="DRAW";
      tournamentProgressEl.textContent="勝ち抜くには勝利が必要です";
      addResultButton("同じ相手と再戦",true,()=>startMatch(tournamentOpponents[tournamentRound]));
      addResultButton("終了",false,returnToMainMenu);
    } else {
      resultTitleEl.textContent="敗退";
      tournamentProgressEl.textContent=`${tournamentRound}勝で終了`;
      addResultButton("もう一度挑戦",true,()=>{
        tournamentRound=0;
        startMatch(tournamentOpponents[0]);
      });
      addResultButton("チーム選択へ",false,returnToMainMenu);
    }
  } else {
    resultTitleEl.textContent=scoreBlue>scoreRed?"WIN":(scoreBlue<scoreRed?"LOSE":"DRAW");
    addResultButton("再戦",true,()=>startMatch(opponentTeamId));
    addResultButton("相手を選び直す",false,()=>{
      gamePhase="menu";
      renderOpponentSelection();
      setMenuScreen(opponentScreenEl);
    });
    addResultButton("チーム選択へ",false,returnToMainMenu);
  }
  setMenuScreen(resultScreenEl);
}


const SOLO_TUTORIAL = [
  {step:"STEP 1", text:"左スティックを倒して移動してみよう。", done:()=>Math.hypot(input.sx,input.sy)>.55},
  {step:"STEP 2", text:"TRAPを押しながらボールを足元でキープしよう。", done:()=>ball.owner===controlled() && input.trap},
  {step:"STEP 3", text:"PASSを押して、近くの味方へパスしよう。", done:()=>tutorialFlags.passUsed},
  {step:"STEP 4", text:"SHOTを押して強シュートを撃ってみよう。上下入力でコースを狙える。", done:()=>tutorialFlags.shotUsed},
  {step:"STEP 5", text:"ボールが近い状態でDASH。少し浮かせて前へ出し、そのまま追いつこう。", done:()=>tutorialFlags.dashSkillUsed},
  {step:"STEP 6", text:"守備では PASS＝足を出す、SHOT＝ショルダー、TRAP＝短い足出し。操作を確認しよう。", done:()=>tutorialFlags.defenseUsed},
  {step:"COMPLETE", text:"基本操作は完了！自由に練習してOK。", done:()=>false}
];

const PARTNER_TUTORIAL = [
  {step:"STEP 1", text:"味方へPASSして、パス交換してみよう。", done:()=>tutorialFlags.passUsed},
  {step:"STEP 2", text:"パスを出したあと前へ走ろう。もう一度PASSを押すとリターン要求。", done:()=>tutorialFlags.returnUsed},
  {step:"STEP 3", text:"リターンパスを前のスペースで受けよう。必要ならDASHで追いつく。", done:()=>tutorialFlags.receiveReturn},
  {step:"STEP 4", text:"近くのルーズボールはTRAPせずPASS/SHOTでダイレクトに処理できる。", done:()=>tutorialFlags.directUsed},
  {step:"COMPLETE", text:"2人練習完了！パス→前へ抜ける動きを繰り返してみよう。", done:()=>false}
];

function currentTutorial(){
  const arr=practiceType==="partner"?PARTNER_TUTORIAL:SOLO_TUTORIAL;
  return arr[Math.min(tutorialIndex,arr.length-1)];
}

function refreshTutorialHud(){
  const t=currentTutorial();
  tutorialStepEl.textContent=t.step;
  tutorialTextEl.textContent=t.text;
}

function advanceTutorialIfNeeded(){
  if(gamePhase!=="practice") return;
  const t=currentTutorial();
  if(t.done && t.done()){
    const arr=practiceType==="partner"?PARTNER_TUTORIAL:SOLO_TUTORIAL;
    if(tutorialIndex<arr.length-1){
      tutorialIndex++;
      refreshTutorialHud();
      showMessage("OK!",.35);
    }
  }
}

function setupPracticePlayers(type){
  // Keep blue side only; red field players are moved out of active play.
  const b=teams.blue, r=teams.red;
  const c=controlled();

  Object.assign(c,{x:430,y:360,vx:0,vy:0});
  c.dirX=1;c.dirY=0;

  // one partner in partner mode; otherwise place teammates well away
  if(type==="partner"){
    practicePartner=b.find(p=>!p.controlled && p.role!=="gk");
    Object.assign(practicePartner,{x:650,y:360,vx:0,vy:0});
    for(const p of b){
      if(p!==c && p!==practicePartner){
        p.x=COURT.x+45;p.y=COURT.y+45;
      }
    }
  } else {
    practicePartner=b.find(p=>!p.controlled && p.role!=="gk");
    Object.assign(practicePartner,{x:650,y:360,vx:0,vy:0});
    for(const p of b){
      if(p!==c && p!==practicePartner){
        p.x=COURT.x+45;p.y=COURT.y+45;
      }
    }
  }

  for(const p of r){
    if(p.role==="gk"){
      p.x=COURT.x+COURT.w-30;p.y=H/2;
    }else{
      p.x=COURT.x+COURT.w-55;
      p.y=COURT.y+45;
    }
    p.vx=p.vy=0;
  }

  ball.owner=c;
  ball.x=c.x+22;
  ball.y=c.y+18;
  ball.z=0;
  ball.vx=ball.vy=ball.vz=0;
  ball.passTarget=null;
  ball.shot=false;
}

function startPractice(type){
  gameMode="practice";
  gamePhase="practice";
  practiceType=type;
  tutorialIndex=0;
  tutorialTimer=0;
  tutorialFlags={};
  scoreBlue=scoreRed=0;
  opponentTeamId=TEAM_DEFS.find(t=>t.id!==selectedTeamId).id;
  setupPracticePlayers(type);
  updateScoreLabel();
  scoreEl.textContent=type==="partner"
    ? `${teamDef(selectedTeamId).name}  2人練習`
    : `${teamDef(selectedTeamId).name}  ひとり練習`;
  tutorialHudEl.classList.remove("hidden");
  document.body.classList.add("practice-open");
  refreshTutorialHud();
  hideMenu();
}

function endPractice(){
  tutorialHudEl.classList.add("hidden");
  document.body.classList.remove("practice-open");
  practiceType=null;
  gamePhase="menu";
  setMenuScreen(modeScreenEl);
}
function startTournament(){
  gameMode="tournament";
  tournamentOpponents=TEAM_DEFS.filter(t=>t.id!==selectedTeamId).map(t=>t.id);
  tournamentRound=0;
  startMatch(tournamentOpponents[0]);
}


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
  actionPriorityTimer: 0,
  shootBallLock: false,
  postKickNoAutoTrap: 0,
  shootDown: false,
  shootStarted: 0,
  lastShotTapAt: -9999,
  pendingShotTimer: null,
  pendingShotPlayer: null
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
    possessionTime:0,
    pressureTime:0,
    receiveLock:0,
    autoControlTimer:0,
    afterPassRunTimer:0,
    afterPassX:x,
    afterPassY:y,
    shoulder:0,
    stagger:0,
    scanTimer:0,
    headLook:0
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
  protectedTeam:null,
  cpuPassProtect:0,
  dashProtectTimer:0,
  dashProtectTeam:null
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
  ball.dashProtectTimer=0; ball.dashProtectTeam=null;
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


function pointSegmentDistance(px,py,ax,ay,bx,by){
  const abx=bx-ax, aby=by-ay;
  const apx=px-ax, apy=py-ay;
  const ab2=abx*abx+aby*aby || 1;
  const t=clamp((apx*abx+apy*aby)/ab2,0,1);
  const cx=ax+abx*t, cy=ay+aby*t;
  return Math.hypot(px-cx,py-cy);
}

function passLaneBlocked(from,to){
  // Ignore defenders very close to receiver only if receiver has clearly more space.
  for(const e of opponents(from.team)){
    if(e.role==="gk") continue;
    const dLine=pointSegmentDistance(e.x,e.y,from.x,from.y,to.x,to.y);
    const along=dist(from,e);
    const total=dist(from,to);
    if(dLine<42 && along>38 && along<total-28) return true;
  }
  return false;
}

function safeCpuPassTarget(p){
  const attack=p.team==="blue"?1:-1;
  const candidates=teamPlayers(p.team)
    .filter(q=>q!==p && q.role!=="gk")
    .map(q=>{
      const d=dist(p,q);
      const nearestEnemy=Math.min(...opponents(p.team).filter(e=>e.role!=="gk").map(e=>dist(q,e)));
      const blocked=passLaneBlocked(p,q);
      const forward=(q.x-p.x)*attack;
      const score=(blocked?-1000:0) + nearestEnemy*2.2 + forward*.35 + d*.12;
      return {q,d,nearestEnemy,blocked,score};
    })
    // No tiny passes in a crowd.
    .filter(c=>c.d>(p.team==="red"?175:135) && !c.blocked && c.nearestEnemy>62)
    .sort((a,b)=>b.score-a.score);

  return candidates.length ? candidates[0].q : null;
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


function nearbyLooseBallFor(p, radius=84) {
  return !ball.owner && ball.z<34 && dist(p,ball)<=radius;
}

function looseBallPassTarget(p) {
  const stickMag = p.controlled ? Math.hypot(input.sx,input.sy) : 0;
  let target = null;

  if(p.controlled && stickMag>.18) {
    target = bestPassTarget(p,{x:input.sx,y:input.sy});
  } else if(!p.controlled) {
    target = safeCpuPassTarget(p);
  } else {
    target = bestPassTarget(p);
  }

  // Don't blindly clear forward when there is no teammate to receive.
  if(!target) return null;

  // For direct loose-ball passes, reject absurdly distant or tightly marked targets.
  const d=dist(p,target);
  if(d>520) return null;

  const enemyNear=Math.min(...opponents(p.team)
    .filter(e=>e.role!=="gk")
    .map(e=>dist(target,e)));
  if(enemyNear<45) return null;

  return target;
}

function kickNearbyLooseBall(p, kind="pass") {
  if(!nearbyLooseBallFor(p,82)) return false;

  const stickMag = p.controlled ? Math.hypot(input.sx,input.sy) : 0;
  let dx = stickMag>.18 ? input.sx : p.dirX;
  let dy = stickMag>.18 ? input.sy : p.dirY;
  if(Math.hypot(dx,dy)<.1){ dx=p.team==="blue"?1:-1; dy=0; }

  p.x = clamp(p.x,COURT.x+25,COURT.x+COURT.w-25);
  p.y = clamp(p.y,COURT.y+25,COURT.y+COURT.h-25);

  if(kind==="pass") {
    const target = looseBallPassTarget(p);

    // PASS is a pass, not a generic clearance. If nobody is available, do nothing.
    if(!target) {
      if(p.controlled) showMessage("NO PASS",.28);
      return false;
    }

    target.receiveIntent=true;
    const tx=target.x+target.dirX*42;
    const ty=target.y+target.dirY*42;
    const n=norm(tx-ball.x,ty-ball.y);

    ball.lastTouch=p;
    ball.passFrom=p;
    ball.passTarget=target;
    ball.owner=null;
    ball.touchGrace=.12;
    ball.protectedTeam=p.team;
    ball.vx=n.x*380;
    ball.vy=n.y*380;
    ball.vz=24;
    ball.shot=false;
    ball.power=380;

    if(p.controlled) input.postKickNoAutoTrap=.50;
    p.kickAnim=.18;
    p.cooldown=.16;

    if(!p.controlled){
      const attack=p.team==="blue"?1:-1;
      p.afterPassRunTimer=.95;
      p.afterPassX=clamp(p.x+attack*135,COURT.x+70,COURT.x+COURT.w-70);
      p.afterPassY=clamp(p.y+(Math.sign(p.y-H/2)||1)*65,COURT.y+60,COURT.y+COURT.h-60);
    }
    return true;
  }

  if(kind==="shot") {
    const n=norm(dx,dy);

    ball.lastTouch=p;
    ball.passFrom=p;
    ball.passTarget=null;
    ball.owner=null;
    ball.touchGrace=.12;
    ball.protectedTeam=p.team;
    ball.vx=n.x*520;
    ball.vy=n.y*520;
    ball.vz=28;
    ball.shot=true;
    ball.power=520;

    if(p.controlled) input.postKickNoAutoTrap=.50;
    p.kickAnim=.18;
    p.cooldown=.16;
    return true;
  }

  return false;
}


function kickBall(p, dx,dy, speed, lift=0, shot=false, target=null) {
  const n=norm(dx,dy);
  ball.owner=null;
  ball.dashProtectTimer=0;
  ball.dashProtectTeam=null;
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

  // After PASS / SHOT, auto trap is disabled for 0.5s.
  // Manual TRAP timing still works.
  if(p.controlled) input.postKickNoAutoTrap=.50;

  p.kickAnim=.22;
  p.cooldown=.18;
  if(!shot) sfx("pass");
}

function doPass(p, forcedTarget=null) {
  if(!p || ball.owner!==p) return;

  let target=forcedTarget;
  if(!target) {
    if(p.controlled && Math.hypot(input.sx,input.sy)>.2) {
      target=bestPassTarget(p,{x:input.sx,y:input.sy});
    } else if(!p.controlled) {
      target=safeCpuPassTarget(p) || bestPassTarget(p);
    } else {
      target=bestPassTarget(p);
    }
  }
  if(!target) return;

  target.receiveIntent=true;
  target.receiveLock=.18;

  const lead = target.controlled ? 95 : 48;
  let tx=target.x + target.dirX*lead;
  let ty=target.y + target.dirY*lead;

  if(target.controlled && Math.hypot(input.sx,input.sy)>.15) {
    tx=target.x+input.sx*120;
    ty=target.y+input.sy*120;
  }

  const d=dist(p,target);
  const cpuSpeed=!p.controlled ? clamp(375+d*.15,400,475) : 385;
  kickBall(p,tx-p.x,ty-p.y,cpuSpeed,26,false,target);

  // After passing, the passer tries to run into the next forward space.
  // Controlled player is still manually controlled, so this is mainly for CPU.
  if(!p.controlled){
    const attack=p.team==="blue"?1:-1;
    p.afterPassRunTimer=1.05;
    p.afterPassX=clamp(p.x+attack*150,COURT.x+70,COURT.x+COURT.w-70);
    const side = Math.sign(p.y-H/2) || (Math.random()<.5?-1:1);
    p.afterPassY=clamp(p.y+side*75,COURT.y+60,COURT.y+COURT.h-60);
  }

  if(!p.controlled){
    // A real pass should travel cleanly for a brief moment instead of being
    // instantly re-touched at the passer's feet.
    ball.cpuPassProtect=.24;
    ball.protectedTeam=p.team;
  }
}
function playerShoot(p, chargeSec, superShot=false) {
  // v21: all shots aim at goal. Double tap = SUPER SHOT.
  const canShootOwned = ball.owner===p;
  const canShootLoose = !ball.owner && ball.z<42 && dist(p,ball)<132;
  if(!canShootOwned && !canShootLoose) return false;

  const goalX = p.team==="blue" ? COURT.x+COURT.w+12 : COURT.x-12;
  const goalTop = H/2-GOAL_H/2;
  const goalBottom = H/2+GOAL_H/2;

  let targetY=H/2;
  if(input.sy < -.50) {
    targetY=goalTop+14;
  } else if(input.sy > .50) {
    targetY=goalBottom-14;
  }

  const fromX = canShootOwned ? p.x : ball.x;
  const fromY = canShootOwned ? p.y+16 : ball.y;
  const speed = superShot ? 790 : 650;
  const lift  = superShot ? 26 : 30;

  if(canShootOwned) {
    kickBall(p,goalX-fromX,targetY-fromY,speed,lift,true,null);
  } else {
    const n=norm(goalX-ball.x,targetY-ball.y);
    ball.owner=null;
    ball.passTarget=null;
    ball.lastTouch=p;
    ball.passFrom=p;
    ball.touchGrace=.12;
    ball.protectedTeam=p.team;
    ball.vx=n.x*speed;
    ball.vy=n.y*speed;
    ball.vz=lift;
    ball.shot=true;
    ball.power=speed;
    p.kickAnim=.22;
    p.cooldown=.18;
  }

  input.postKickNoAutoTrap=.50;
  sfx(superShot?"super":"shot");
  showMessage(superShot ? "SUPER SHOT!" : "POWER SHOT", superShot ? .48 : .35);
  return true;
}

function trapWindowFor(p) {
  if(ball.owner) return false;
  const d=dist(p,ball);
  return d < 42 + Math.min(32, Math.hypot(ball.vx,ball.vy)*.045) && ball.z<28;
}

function attemptTrap(p, dt) {
  // Protected chipped dash ball: only a perfectly close manual TRAP can cut it.
  if(dashBallProtectedAgainst(p)){
    if(manualTrapCutProtectedBall(p)) return true;
    return false;
  }

  if(!trapWindowFor(p)) return false;

  // CPU passes need a tiny clean-flight window. Without this, two nearby CPUs
  // can re-touch the same pass every few frames and appear to "fight" forever.
  if(ball.cpuPassProtect>0 && ball.protectedTeam && p.team!==ball.protectedTeam && !p.controlled) {
    return false;
  }

  if(ball.touchGrace>0 && ball.protectedTeam && p.team!==ball.protectedTeam) {
    return false;
  }

  const speed=Math.hypot(ball.vx,ball.vy);
  const closing = speed>100;

  if(p.controlled) {
    // Never immediately auto-trap the player's own shot right after release.
    if(input.postKickNoAutoTrap>0 && ball.lastTouch===p && !input.trap) return false;

    // Auto-control is only for genuinely slow, unclaimed loose balls.
    // It must never steal priority from PASS / SHOT input.
    const slowLoose = speed < 115 && ball.z < 14 && !ball.passTarget && p.autoControlTimer<=0;

    if(input.trap || (slowLoose && input.actionPriorityTimer<=0 && !input.shootDown && input.postKickNoAutoTrap<=0)) {
      ball.owner=p;
      ball.passTarget=null;
      ball.vx=ball.vy=ball.vz=0;
      ball.z=0;
      ball.lastTouch=p;
      ball.touchGrace=.18;
      ball.protectedTeam=p.team;
      p.possessionTime=0;
      p.kickAnim = input.trap ? .16 : 0;

      if(slowLoose && !input.trap){
        // Brief settle only. The player can immediately PASS or SHOT.
        p.autoControlTimer=.28;
        p.kickAnim=0;
        p.slide=0;
        p.shoulder=0;
        showMessage("AUTO TRAP",.22);
      } else {
        showMessage(speed>500?"SUPER TRAP!":"TRAP!",.38);
      }
      return true;
    }
  }

  if(!p.controlled) {
    // Only one CPU from each team is allowed to contest a loose ball.
    const squad=teamPlayers(p.team).filter(q=>q.role!=="gk" && !q.controlled);
    const nearest=squad.slice().sort((a,b)=>dist(a,ball)-dist(b,ball))[0];

    // Intended receiver gets priority. A non-target CPU only takes a truly loose,
    // slow and uncontested ball. This prevents both teams from auto-trapping at once.
    const oppNear = opponents(p.team)
      .filter(q=>q.role!=="gk")
      .some(q=>dist(q,ball)<58);

    const isTarget = ball.passTarget===p;
    const looseCollector = nearest===p && speed<120 && !oppNear && !ball.passTarget;
    if(!isTarget && !looseCollector) return false;

    let success = isTarget ? (Math.random() < (speed>550?.78:.97)) : true;

    if(success) {
      ball.owner=p;
      ball.vx=ball.vy=ball.vz=0;
      ball.z=0;
      ball.lastTouch=p;
      ball.touchGrace=.20;
      ball.protectedTeam=p.team;
      p.possessionTime=0;
      p.receiveIntent=false;
      p.receiveLock = p.team==="red" ? .88 : .38;
      p.aiTimer = p.team==="red" ? .95 : .48;
      p.scanTimer = p.team==="red" ? .62 : .42;
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

function shortTrapSteal(actor) {
  if(!actor || actor.role==="gk" || actor.cooldown>0 || actor.stagger>0) return false;

  if(dashBallProtectedAgainst(actor)){
    return manualTrapCutProtectedBall(actor);
  }

  const enemyOwner = ball.owner && ball.owner.team!==actor.team ? ball.owner : null;

  // Shorter reach than PASS poke / SHOULDER.
  if(enemyOwner && dist(actor,enemyOwner)<42) {
    const face=norm(actor.dirX,actor.dirY);
    const to=norm(enemyOwner.x-actor.x,enemyOwner.y-actor.y);
    const alignment=face.x*to.x+face.y*to.y;
    if(alignment<-.15) return false;

    ball.owner=null;
    ball.passTarget=null;
    ball.x=enemyOwner.x-face.x*10;
    ball.y=enemyOwner.y-face.y*10;
    ball.z=4;
    ball.vx=face.x*110;
    ball.vy=face.y*110;
    ball.vz=18;
    ball.lastTouch=actor;
    ball.touchGrace=.12;
    ball.protectedTeam=actor.team;

    actor.kickAnim=.14;
    actor.cooldown=.28;
    showMessage("STEAL!",.25);
    return true;
  }

  // Can also stab at a very nearby loose ball.
  if(!ball.owner && dist(actor,ball)<38 && ball.z<18){
    const face=norm(actor.dirX,actor.dirY);
    ball.vx=face.x*120;
    ball.vy=face.y*120;
    ball.vz=12;
    ball.lastTouch=actor;
    actor.kickAnim=.12;
    actor.cooldown=.24;
    return true;
  }

  return false;
}

function defensivePoke(actor) {
  if(dashBallProtectedAgainst(actor)) return false;

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


function shoulderCharge(actor) {
  if(!actor || actor.role==="gk" || actor.cooldown>0 || actor.shoulder>0 || actor.stagger>0) return false;

  const enemies=opponents(actor.team)
    .filter(e=>e.role!=="gk" && e.stagger<=0)
    .sort((a,b)=>dist(actor,a)-dist(actor,b));

  const target=enemies[0];
  if(!target || dist(actor,target)>78) return false;

  const face=norm(actor.dirX,actor.dirY);
  const to=norm(target.x-actor.x,target.y-actor.y);
  const alignment=face.x*to.x+face.y*to.y;

  // Charge only if the target is generally in front of the player.
  if(alignment<-.1) return false;

  actor.shoulder=.20;
  actor.cooldown=.42;

  const n=norm(target.x-actor.x,target.y-actor.y);
  actor.vx=n.x*310;
  actor.vy=n.y*310;

  target.stagger=.48;
  target.vx=n.x*210;
  target.vy=n.y*210;

  // If the target has the ball, force a loose touch.
  if(ball.owner===target) {
    ball.owner=null;
    ball.passTarget=null;
    ball.x=target.x+n.x*24;
    ball.y=target.y+n.y*24;
    ball.z=6;
    ball.vx=n.x*230+actor.dirX*70;
    ball.vy=n.y*230+actor.dirY*70;
    ball.vz=42;
    ball.lastTouch=actor;
    ball.touchGrace=.16;
    ball.protectedTeam=actor.team;
  }

  if(gamePhase==="practice") tutorialFlags.defenseUsed=true;
  sfx("poke");
  showMessage("SHOULDER!",.32);
  return true;
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
  } else if(type==="shoulder") {
    if(owner && owner.team!==team && dist(main,owner)<92){
      if(shoulderCharge(main)) return;
    }
    for(const p of candidates){
      if(p!==main && owner && owner.team!==team && dist(p,owner)<82){
        if(shoulderCharge(p)) return;
      }
    }
  }
}

function updateControlled(p,dt) {
  if(p.stagger>0){
    p.vx*=Math.pow(.18,dt);
    p.vy*=Math.pow(.18,dt);
    return;
  }

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

  // While SHOT is being held, a nearby loose ball can be picked up into the shot action.
  // This makes charging a shot much less frame-perfect.
  if(input.shootDown && !input.shootBallLock && !ball.owner && nearbyLooseBallFor(p,102)) {
    input.shootBallLock=true;
  }

  if(ball.owner===p) {
    p.possessionTime+=dt;
    // Core mechanic: holding trap is required to keep dribbling.
    if(input.trap || p.autoControlTimer>0 || (input.shootDown && input.shootBallLock)) {
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

  // Give-and-go movement: after passing, attack the forward space for about one second.
  if(p.afterPassRunTimer>0){
    tx=p.afterPassX;
    ty=p.afterPassY;
  }

  const keepAwayFromBall=(x,y,minR)=>{
    const dx=x-ball.x, dy=y-ball.y;
    const d=Math.hypot(dx,dy);
    if(d<minR){
      const n=norm(dx || (idx%2?1:-1), dy || (idx<2?-1:1));
      x=ball.x+n.x*minR;
      y=ball.y+n.y*minR;
    }
    return {
      x:clamp(x,COURT.x+55,COURT.x+COURT.w-55),
      y:clamp(y,COURT.y+55,COURT.y+COURT.h-55)
    };
  };

  if(p.afterPassRunTimer>0) {
    // Keep the run target chosen above.
  } else if(ball.owner && ball.owner.team===p.team) {
    const o=ball.owner;

    // Attack shape: most teammates should offer ahead of the ball,
    // but in different vertical lanes so they don't bunch together.
    const laneY=[185,535,300,430];
    const advance=[185,155,245,105];
    const supportBack=[-95,-120,-80,-150];

    const aheadCount = squad.filter(q=>q!==o && (q.x-o.x)*attack>35).length;
    const shouldGoAhead = idx<3 || aheadCount<2;

    if(shouldGoAhead) {
      tx=clamp(o.x+attack*advance[idx%4],COURT.x+85,COURT.x+COURT.w-85);
      ty=laneY[idx%4];
    } else {
      tx=clamp(o.x+attack*supportBack[idx%4],COURT.x+85,COURT.x+COURT.w-85);
      ty=laneY[idx%4];
    }

    if(ball.passTarget===p || p.receiveIntent) {
      tx=clamp(p.x+attack*105,COURT.x+80,COURT.x+COURT.w-80);
      ty=clamp(p.y+p.dirY*45,COURT.y+60,COURT.y+COURT.h-60);
    } else {
      const k=keepAwayFromBall(tx,ty,92);
      tx=k.x;ty=k.y;
    }

  } else if(ball.owner && ball.owner.team!==p.team) {
    const e=ball.owner;
    const defenders=squad.slice().sort((a,b)=>dist(a,e)-dist(b,e));
    const presser=defenders[0];

    if(presser===p) {
      // Presser stops just short instead of occupying the exact same point.
      const side=p.team==="blue"?-1:1;
      tx=e.x+side*48;
      ty=e.y;
    } else {
      // All other defenders remain in lanes and are explicitly kept away from the ball.
      const baseX=p.team==="blue"?390:890;
      const laneY=[190,360,530,285][idx%4];
      tx=lerp(baseX,e.x,.14);
      ty=lerp(laneY,e.y,.10);
      const k=keepAwayFromBall(tx,ty,125);
      tx=k.x;ty=k.y;
    }

  } else {
    // Loose ball: only one CPU per team may enter the contest radius.
    const nearest=squad.slice().sort((a,b)=>dist(a,ball)-dist(b,ball))[0];
    if(nearest===p) {
      const side=p.team==="blue"?-1:1;
      tx=ball.x+side*34;
      ty=ball.y;
    } else {
      tx=p.team==="blue"?430:850;
      ty=[190,360,530,285][idx%4];
      const k=keepAwayFromBall(tx,ty,95);
      tx=k.x;ty=k.y;
    }
  }

  const n=norm(tx-p.x,ty-p.y);
  if(n.m>8){p.dirX=n.x;p.dirY=n.y;}

  // Stop when close to tactical target instead of continuously drifting into teammates.
  const desired=n.m<24?0:p.speed*.72;
  p.vx=lerp(p.vx,n.x*desired,clamp(dt*5,0,1));
  p.vy=lerp(p.vy,n.y*desired,clamp(dt*5,0,1));
}
function aiWithBall(p,dt) {
  p.possessionTime+=dt;
  p.aiTimer-=dt;

  // CPU scans before releasing the ball. This reduces constant one-touch passing.
  if(p.scanTimer>0){
    p.scanTimer-=dt;
    p.headLook=Math.sin((1-p.scanTimer)*12);
  } else {
    p.headLook*=Math.pow(.06,dt);
  }

  // Player pass-call has top priority for a short window.
  if(p.team==="blue" && !p.controlled && input.passCallTimer>0 && p.cooldown<=.12 && p.possessionTime>.28) {
    doPass(p,controlled());
    input.passCallTimer=0;
    return;
  }
  const near=closestOpponent(p);
  const attack=p.team==="blue"?1:-1;

  // Under pressure, only play a pass if there is a genuinely safe lane.
  // Otherwise shield/step away briefly instead of machine-gunning tiny passes.
  if(near.d<92 && p.cooldown<=.08 && p.receiveLock<=0) {
    const target=safeCpuPassTarget(p);

    // Enemy CPU deliberately takes an extra touch before releasing under pressure.
    const canRelease = p.team==="red" ? p.possessionTime>.95 : p.possessionTime>.45;

    if(target && canRelease) {
      doPass(p,target);
      p.receiveLock = p.team==="red" ? .34 : .16;
      return;
    }
  }
  const goalX=p.team==="blue"?COURT.x+COURT.w:COURT.x;
  const goalY=H/2;
  const goalDist=Math.hypot(goalX-p.x,goalY-p.y);

  // CPU prefers passing. Dribble only when clearly unpressured.
  if(p.aiTimer<=0 && p.receiveLock<=0 && p.possessionTime>(p.team==="red"?.85:.42)) {
    p.aiTimer = p.team==="red" ? rand(.90,1.35) : rand(.48,.72);

    if(goalDist<260 && Math.abs(p.y-goalY)<180 && near.d>90) {
      const aimY=goalY+rand(-75,75);
      kickBall(p,goalX-p.x,aimY-p.y,rand(470,610),rand(18,48),true,null);
      return;
    }

    let target=safeCpuPassTarget(p);
    const passChance = p.team==="red" ? .34 : .72;
    const pressureRange = p.team==="red" ? 118 : 190;
    if(target && (near.d<pressureRange || Math.random()<passChance)) {
      doPass(p,target);
      return;
    }
  }

  let dx=0,dy=0;

  if(p.team==="red"){
    // Enemy CPU can now keep possession, scan, and occasionally carry the ball.
    if(near.d>250){
      // Plenty of room: dribble forward, but not at full speed.
      dx=attack*.72;
      dy=clamp((goalY-p.y)/260,-.42,.42);
    } else if(near.d>135){
      // Medium pressure: slow down and look around instead of instantly passing.
      const holdPhase=Math.sin(p.possessionTime*3.2);
      dx=attack*.18;
      dy=holdPhase*.38;
    } else {
      // Close pressure: shield sideways and buy time for a passing lane.
      dx=-attack*.05;
      dy=near.p ? Math.sign(p.y-near.p.y || 1)*.78 : .55;
    }
  } else {
    if(near.d>230) {
      dx=attack;
      dy=clamp((goalY-p.y)/210,-.55,.55);
    } else {
      dx=-attack*.08;
      dy=near.p ? Math.sign(p.y-near.p.y || 1) : 1;
    }
  }
  const n=norm(dx,dy);
  p.dirX=n.x;p.dirY=n.y;
  const carrySpeed = p.team==="red" ? .58 : .72;
  p.vx=lerp(p.vx,n.x*p.speed*carrySpeed,dt*4);
  p.vy=lerp(p.vy,n.y*p.speed*carrySpeed,dt*4);
  ball.x=p.x+n.x*31;ball.y=p.y+n.y*31;ball.z=0;ball.vx=p.vx;ball.vy=p.vy;
}

function updateAI(p,dt) {
  if(gamePhase==="practice"){
    if(p.team==="red") return;
    if(p.role==="gk") return;
    if(p.controlled){updateControlled(p,dt);return;}

    if(practiceType==="partner" && p===practicePartner){
      if(ball.owner===p){
        p.aiTimer-=dt;
        if(p.aiTimer<=0){
          p.aiTimer=.55;
          doPass(p,controlled());
        }
      }else{
        aiMoveOffBall(p,dt);
      }
    }
    return;
  }

  if(p.role==="gk") return;
  if(p.stagger>0){
    p.vx*=Math.pow(.18,dt);
    p.vy*=Math.pow(.18,dt);
    return;
  }
  if(p.controlled){updateControlled(p,dt);return;}
  if(p.slide>0)return;

  if(!ball.owner && nearbyLooseBallFor(p,74) && !dashBallProtectedAgainst(p)) {
    const squad=teamPlayers(p.team).filter(q=>q.role!=="gk" && !q.controlled);
    const nearest=squad.slice().sort((a,b)=>dist(a,ball)-dist(b,ball))[0];
    if(nearest===p && ball.touchGrace<=0) {
      const speed=Math.hypot(ball.vx,ball.vy);

      // Slow loose balls are controlled first instead of constantly played first-time.
      if(speed<150 && ball.z<18){
        ball.owner=p;
        ball.passTarget=null;
        ball.vx=ball.vy=ball.vz=0;
        ball.z=0;
        ball.lastTouch=p;
        p.possessionTime=0;
        p.receiveLock = p.team==="red" ? .88 : .40;
        p.aiTimer = p.team==="red" ? .95 : .52;
        p.scanTimer = p.team==="red" ? .62 : .42;
        return;
      }

      // Only occasionally play a genuine first-time pass on a faster loose ball.
      if(speed>=150 && Math.random()<dt*.55){
        const target=safeCpuPassTarget(p);
        if(target) {
          kickNearbyLooseBall(p,"pass");
          return;
        }
      }
    }
  }

  if(ball.owner===p) aiWithBall(p,dt);
  else aiMoveOffBall(p,dt);

  // One designated presser only. Challenge after staying close briefly;
  // no random CPU sliding in normal pressure.
  if(ball.owner && ball.owner.team!==p.team && ball.touchGrace<=0 && ball.cpuPassProtect<=0) {
    const e=ball.owner;
    const nearest=teamPlayers(p.team).filter(q=>q.role!=="gk").sort((a,b)=>dist(a,e)-dist(b,e))[0];
    if(nearest===p && dist(p,e)<54) {
      p.pressureTime+=dt;
      if(p.pressureTime>.28 && p.cooldown<=0) {
        defensivePoke(p);
        p.pressureTime=0;
        p.cooldown=.5;
      }
    } else {
      p.pressureTime=0;
    }
  } else {
    p.pressureTime=0;
  }
}

function updateGK(p,dt) {
  if(gamePhase==="practice" && p.team==="blue") return;
  const ownLeft=p.team==="blue";
  const gx=ownLeft?COURT.x+30:COURT.x+COURT.w-30;
  const gy=clamp(ball.y,H/2-GOAL_H/2+25,H/2+GOAL_H/2-25);
  const targetY=ball.owner && ball.owner.team===p.team ? H/2 : gy;

  p.x=lerp(p.x,gx,dt*6);
  p.y=lerp(p.y,targetY,dt*3.5);

  const danger = !ball.owner && ball.shot && ball.z<60 && dist(p,ball)<62;
  if(danger) {
    // Timed TRAP remains the strongest keeper action.
    if(p.team==="blue" && input.trap && dist(p,ball)<54) {
      ball.owner=p;
      ball.vx=ball.vy=ball.vz=0;
      ball.z=0;
      ball.shot=false;
      showMessage("GK SUPER CATCH!",.7);
      return;
    }

    const straightAtKeeper = Math.abs(ball.y-p.y) < 30;

    // A shot coming directly at the keeper is always stopped,
    // even if the keeper is standing still. It is parried, not caught.
    if(straightAtKeeper) {
      const awayX=ownLeft?1:-1;
      const side = Math.sign(ball.y-H/2) || (Math.random()<.5?-1:1);
      ball.owner=null;
      ball.vx=awayX*310;
      ball.vy=side*rand(110,210);
      ball.vz=75;
      ball.shot=false;
      ball.lastTouch=p;
      return;
    }

    // Shots toward the edges remain difficult for the keeper.
    const centerFactor=1-clamp(Math.abs(ball.y-H/2)/(GOAL_H*.5),0,1);
    const strong=ball.power>590;
    const saveChance=strong ? (.10+.28*centerFactor) : (.58+.28*centerFactor);

    if(Math.random()<saveChance) {
      // Normal automatic saves are mainly parries.
      const awayX=ownLeft?1:-1;
      const side=Math.sign(ball.y-p.y) || (Math.random()<.5?-1:1);
      ball.owner=null;
      ball.vx=awayX*285;
      ball.vy=side*rand(120,260);
      ball.vz=72;
      ball.shot=false;
      ball.lastTouch=p;
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
  input.actionPriorityTimer=Math.max(0,input.actionPriorityTimer-dt);
  input.postKickNoAutoTrap=Math.max(0,input.postKickNoAutoTrap-dt);
  ball.touchGrace=Math.max(0,ball.touchGrace-dt);
  ball.cpuPassProtect=Math.max(0,ball.cpuPassProtect-dt);
  ball.dashProtectTimer=Math.max(0,ball.dashProtectTimer-dt);
  if(ball.dashProtectTimer<=0) ball.dashProtectTeam=null;
  if(ball.touchGrace<=0) ball.protectedTeam=null;

  for(const p of [...teams.blue,...teams.red]) {
    p.cooldown=Math.max(0,p.cooldown-dt);
    p.receiveLock=Math.max(0,p.receiveLock-dt);
    p.autoControlTimer=Math.max(0,p.autoControlTimer-dt);
    p.afterPassRunTimer=Math.max(0,p.afterPassRunTimer-dt);
    p.shoulder=Math.max(0,p.shoulder-dt);
    p.stagger=Math.max(0,p.stagger-dt);
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

  // Strong player separation
  const all=[...teams.blue,...teams.red];

  // Keep uninvolved CPU players out of the immediate ball crowd.
  for(const p of all) {
    if(p.controlled || p.role==="gk" || ball.owner===p || ball.passTarget===p) continue;

    let allowedNear=false;
    if(ball.owner && ball.owner.team!==p.team) {
      const nearest=teamPlayers(p.team)
        .filter(q=>q.role!=="gk")
        .sort((a,b)=>dist(a,ball.owner)-dist(b,ball.owner))[0];
      allowedNear = nearest===p;
    } else if(!ball.owner) {
      const nearest=teamPlayers(p.team)
        .filter(q=>q.role!=="gk" && !q.controlled)
        .sort((a,b)=>dist(a,ball)-dist(b,ball))[0];
      allowedNear = nearest===p;
    }

    if(!allowedNear) {
      const d=dist(p,ball);
      const minD=80;
      if(d<minD && d>0) {
        const n=norm(p.x-ball.x,p.y-ball.y);
        const push=(minD-d)*.55;
        p.x+=n.x*push;
        p.y+=n.y*push;
      }
    }
  }
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j], d=dist(a,b);
    if(d<PLAYER_R*2.05 && d>0){
      const n=norm(a.x-b.x,a.y-b.y), push=(PLAYER_R*2.05-d)*.48;
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
    const lead=190;
    const targetX=clamp(c.x+dx*lead,COURT.x+45,COURT.x+COURT.w-45);
    const targetY=clamp(c.y+dy*lead,COURT.y+45,COURT.y+COURT.h-45);
    receiver.receiveIntent=false;
    kickBall(receiver,targetX-receiver.x,targetY-receiver.y,420,24,false,c);
    ball.returnRequested=false;
    if(gamePhase==="practice") tutorialFlags.receiveReturn=true;
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
  sfx("goal");
  showMessage(`${who==="BLUE"?teamDef(selectedTeamId).name:teamDef(opponentTeamId).name} GOAL!`,1);
  updateScoreLabel();
  ball.owner=null;ball.vx=ball.vy=ball.vz=0;ball.shot=false;
}

function update(dt) {
  if(gamePhase!=="match" && gamePhase!=="practice") return;
  if(gamePhase==="practice"){
    advanceTutorialIfNeeded();
  }
  if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)msgEl.style.opacity="0";}
  if(goalPause>0) {
    goalPause-=dt;
    if(goalPause<=0) resetKickoff(scoreBlue<=scoreRed?"blue":"red");
    return;
  }

  if(gamePhase==="match"){
    matchLeft=Math.max(0,matchLeft-dt);
    const m=Math.floor(matchLeft/60),s=Math.floor(matchLeft%60).toString().padStart(2,"0");
    clockEl.textContent=`${m}:${s}`;
    if(matchLeft<=0){
      clockEl.textContent="0:00";
      showMessage("TIME UP",1);
      finishMatch();
      return;
    }
  }

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


function drawKitTorso(p){
  const kit=sideTeam(p.team);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-13,-13,27,35,8);
  ctx.clip();

  if(kit.kit==="blizzard"){
    ctx.fillStyle="#f8fafc";
    ctx.fillRect(-14,-14,30,38);
    ctx.fillStyle="#2563eb";
    for(let x=-13;x<14;x+=10) ctx.fillRect(x,-14,5,38);
  } else if(kit.kit==="takezo"){
    ctx.fillStyle="#172554";
    ctx.fillRect(-14,-14,30,38);
    ctx.fillStyle="#f05aa6";
    ctx.fillRect(-14,-9,30,10);
    ctx.fillRect(-14,11,30,10);
  } else {
    ctx.fillStyle=kit.primary;
    ctx.fillRect(-14,-14,30,38);
  }
  ctx.restore();

  ctx.strokeStyle="rgba(255,255,255,.28)";
  ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.roundRect(-13,-13,27,35,8);
  ctx.stroke();
}

function drawSlideKit(p){
  const kit=sideTeam(p.team);
  if(kit.kit==="blizzard"){
    ctx.fillStyle="#f8fafc";ctx.fillRect(-23,-11,48,22);
    ctx.fillStyle="#2563eb";
    for(let x=-22;x<25;x+=12) ctx.fillRect(x,-11,6,22);
  } else if(kit.kit==="takezo"){
    ctx.fillStyle="#172554";ctx.fillRect(-23,-11,48,22);
    ctx.fillStyle="#f05aa6";ctx.fillRect(-23,-7,48,7);ctx.fillRect(-23,6,48,7);
  } else {
    ctx.fillStyle=kit.primary;ctx.fillRect(-23,-11,48,22);
  }
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x,p.y);
  // Character artwork stays upright on screen. Movement direction does not rotate the head/body.
  if(p.stagger>0) {
    ctx.rotate(Math.sin(elapsed*35)*.12);
    ctx.strokeStyle=DARK;ctx.lineWidth=7;ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(-4,10);ctx.lineTo(-15,30);
    ctx.moveTo(5,10);ctx.lineTo(14,28);
    ctx.stroke();

    drawKitTorso(p);

    ctx.strokeStyle=SKIN;ctx.lineWidth=6;
    ctx.beginPath();
    ctx.moveTo(-10,-6);ctx.lineTo(-23,2);
    ctx.moveTo(11,-6);ctx.lineTo(24,-2);
    ctx.stroke();

    ctx.fillStyle=SKIN;
    ctx.beginPath();ctx.arc(0,-26,13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#111827";
    ctx.beginPath();
    ctx.arc(-4,-30,1.7,0,Math.PI*2);
    ctx.arc(4,-30,1.7,0,Math.PI*2);
    ctx.fill();
    ctx.restore();return;
  }

  if(p.shoulder>0) {
    ctx.rotate(-.08);
  }

  if(p.slide>0) {
    ctx.rotate(-.15);
    drawSlideKit(p);
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
  drawKitTorso(p);

  // arms
  ctx.strokeStyle=SKIN;ctx.lineWidth=6;
  ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-19,8+swing*.35);ctx.moveTo(11,-7);ctx.lineTo(20,7-swing*.35);ctx.stroke();

  // Head stays upright, but CPU can glance left/right while scanning.
  const headShift = p.controlled ? 0 : p.headLook*4.5;
  ctx.fillStyle=SKIN;
  ctx.beginPath();
  ctx.arc(headShift,-26,13,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="#111827";
  ctx.beginPath();
  ctx.arc(headShift-4,-30,1.7,0,Math.PI*2);
  ctx.arc(headShift+4,-30,1.7,0,Math.PI*2);
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

// ---------- Touch / pointer stick (v37 sticky diagonal) ----------
const stickZone=document.getElementById("stickZone");
const stickBase=document.getElementById("stickBase");
const stickKnob=document.getElementById("stickKnob");
let stickPointer=null;

let stickyX=0;
let stickyY=0;
let stickyXUntil=0;
let stickyYUntil=0;

function updateStick(clientX,clientY) {
  const r=stickBase.getBoundingClientRect();
  const cx=r.left+r.width/2;
  const cy=r.top+r.height/2;

  let dx=clientX-cx;
  let dy=clientY-cy;
  const max=r.width*.37;

  const rawMag=Math.hypot(dx,dy);
  const n=norm(dx,dy);
  const m=Math.min(max,rawMag);

  dx=n.x*m;
  dy=n.y*m;

  const rawX=dx/max;
  const rawY=dy/max;

  // Independent wide axis zones make diagonals easier than the old analog vector.
  const threshold=.24;
  let x=Math.abs(rawX)>threshold ? Math.sign(rawX) : 0;
  let y=Math.abs(rawY)>threshold ? Math.sign(rawY) : 0;

  const now=performance.now();

  if(x!==0){
    stickyX=x;
    stickyXUntil=now+220;
  }
  if(y!==0){
    stickyY=y;
    stickyYUntil=now+220;
  }

  // Preserve the previous axis briefly while the finger slides.
  // DOWN -> slide RIGHT = DOWN+RIGHT.
  if(x===0 && now<stickyXUntil) x=stickyX;
  if(y===0 && now<stickyYUntil) y=stickyY;

  if(rawMag<max*.16){
    x=0;
    y=0;
  }

  if(x!==0 || y!==0){
    const dir=norm(x,y);
    input.sx=dir.x;
    input.sy=dir.y;
    input.stickActive=true;
  }else{
    input.sx=0;
    input.sy=0;
    input.stickActive=false;
  }

  stickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}

function releaseStick(){
  stickPointer=null;
  input.sx=0;
  input.sy=0;
  input.stickActive=false;
  stickyX=0;
  stickyY=0;
  stickyXUntil=0;
  stickyYUntil=0;
  stickKnob.style.transform="translate(0,0)";
}

stickZone.addEventListener("pointerdown",e=>{
  e.preventDefault();
  stickPointer=e.pointerId;
  input.stickActive=true;
  try{stickZone.setPointerCapture(e.pointerId);}catch(_){}
  updateStick(e.clientX,e.clientY);
});

stickZone.addEventListener("pointermove",e=>{
  if(e.pointerId===stickPointer){
    e.preventDefault();
    updateStick(e.clientX,e.clientY);
  }
});

stickZone.addEventListener("pointerup",e=>{
  if(e.pointerId===stickPointer) releaseStick();
});
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
let trapPointer=null;
trapBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  trapPointer=e.pointerId;
  trapBtn.setPointerCapture(trapPointer);
  input.trap=true;
  trapBtn.classList.add("active");

  const c=controlled();

  // On defense, TRAP is a short-range foot steal.
  if((ball.owner && ball.owner.team!=="blue") ||
     (!ball.owner && dist(c,ball)<42)){
    shortTrapSteal(c);
  }
});
function releaseTrap(e){
  if(trapPointer!==null && (!e || e.pointerId===trapPointer)){
    input.trap=false;
    trapBtn.classList.remove("active");
    trapPointer=null;
  }
}
trapBtn.addEventListener("pointerup",releaseTrap);
trapBtn.addEventListener("pointercancel",releaseTrap);

// DASH is a quick burst, not a hold-to-sprint button.
dashBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  const c=controlled();

  // After the player's pass, DASH doubles as a one-two return request.
  if(!ball.owner && ball.passFrom===c && ball.passTarget && ball.passTarget.team==="blue"){
    ball.returnRequested=true;
    showMessage("RETURN REQUEST",.35);

    if(input.dashCooldown<=0){
      input.dashTimer=.19;
      input.dashCooldown=.34;
    }

    dashBtn.classList.add("active");
    setTimeout(()=>dashBtn.classList.remove("active"),150);
    return;
  }

  if(input.dashCooldown<=0){
    if(!dashTouchSkill(c)){
      input.dashTimer=.19;
      input.dashCooldown=.34;
    }

    dashBtn.classList.add("active");
    setTimeout(()=>dashBtn.classList.remove("active"),150);
  }
});

passBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  if(gamePhase==="practice") tutorialFlags.passUsed=true;
  input.actionPriorityTimer=.16;
  const c=controlled();

  if(ball.owner===c) {
    doPass(c);
    return;
  }

  // Directly kick a nearby loose ball without needing TRAP first.
  if(nearbyLooseBallFor(c,82) && !dashBallProtectedAgainst(c)) {
    if(kickNearbyLooseBall(c,"pass")) {
      if(gamePhase==="practice") tutorialFlags.directUsed=true;
      showMessage("DIRECT PASS",.28);
    }
    return;
  }

  // If our pass is still travelling to a teammate, this means one-two / return request.
  if(!ball.owner && ball.passFrom===c && ball.passTarget && ball.passTarget.team==="blue") {
    ball.returnRequested=true;
    if(gamePhase==="practice") tutorialFlags.returnUsed=true;
    showMessage("RETURN REQUEST",.35);
    return;
  }

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
  const c=controlled();
  input.actionPriorityTimer=.18;
  input.shootDown=true;
  input.shootStarted=performance.now();

  input.shootBallLock = (ball.owner===c || nearbyLooseBallFor(c,104));
  shootBtn.classList.add("active");
});

function canPlayerShootNow(c){
  if(dashBallProtectedAgainst(c)) return false;
  return ball.owner===c ||
         nearbyLooseBallFor(c,116) ||
         (input.shootBallLock && !ball.owner && dist(c,ball)<132 && ball.z<42);
}

function firePendingNormalShot(){
  const c=input.pendingShotPlayer;
  input.pendingShotTimer=null;
  input.pendingShotPlayer=null;

  if(c && canPlayerShootNow(c)){
    playerShoot(c,0,false);
  }
}

function releaseShoot() {
  if(!input.shootDown)return;
  if(gamePhase==="practice") tutorialFlags.shotUsed=true;

  input.shootDown=false;
  shootBtn.classList.remove("active");

  const c=controlled();
  const now=performance.now();
  const shootable=canPlayerShootNow(c);

  if(!shootable){
    input.shootBallLock=false;
    offBallAction("blue","shoulder");
    return;
  }

  const isDoubleTap = (now-input.lastShotTapAt) <= 230 && input.pendingShotTimer!==null;

  if(isDoubleTap){
    clearTimeout(input.pendingShotTimer);
    input.pendingShotTimer=null;
    input.pendingShotPlayer=null;
    input.lastShotTapAt=-9999;

    playerShoot(c,0,true);
  } else {
    input.lastShotTapAt=now;
    input.pendingShotPlayer=c;

    // Small wait gives the player a chance to make a deliberate quick double tap.
    // A single tap still fires automatically after this short window.
    if(input.pendingShotTimer!==null) clearTimeout(input.pendingShotTimer);
    input.pendingShotTimer=setTimeout(firePendingNormalShot,210);
  }

  input.shootBallLock=false;
}

shootBtn.addEventListener("pointerup",releaseShoot);
shootBtn.addEventListener("pointercancel",releaseShoot);

// Desktop testing
const keys=new Set();
addEventListener("keydown",e=>{
  keys.add(e.code);
  if(e.code==="KeyZ") input.trap=true;
  if(e.code==="KeyX"&&!e.repeat && input.dashCooldown<=0){
    const c=controlled();
    if(!dashTouchSkill(c)){input.dashTimer=.19;input.dashCooldown=.34;}
  }
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


tournamentBtnEl.addEventListener("click",startTournament);
let practiceMenuTapLock=false;
function openPracticeMenu(e){
  if(e && e.preventDefault) e.preventDefault();
  if(practiceMenuTapLock) return;
  practiceMenuTapLock=true;
  setMenuScreen(practiceScreenEl);
  setTimeout(()=>{practiceMenuTapLock=false;},180);
}
practiceBtnEl.addEventListener("click",openPracticeMenu);
practiceBtnEl.addEventListener("pointerup",openPracticeMenu);
function bindMenuTap(el,fn){
  let locked=false;
  const run=(e)=>{
    if(e && e.preventDefault) e.preventDefault();
    if(locked) return;
    locked=true;
    fn();
    setTimeout(()=>{locked=false;},180);
  };
  el.addEventListener("click",run);
  el.addEventListener("pointerup",run);
}
bindMenuTap(soloPracticeBtnEl,()=>startPractice("solo"));
bindMenuTap(partnerPracticeBtnEl,()=>startPractice("partner"));
bindMenuTap(practiceBackBtnEl,()=>setMenuScreen(modeScreenEl));
tutorialExitBtnEl.addEventListener("click",endPractice);

freeMatchBtnEl.addEventListener("click",()=>{
  renderOpponentSelection();
  setMenuScreen(opponentScreenEl);
});
modeBackBtnEl.addEventListener("click",()=>setMenuScreen(teamScreenEl));
opponentBackBtnEl.addEventListener("click",()=>setMenuScreen(modeScreenEl));

renderTeamSelection();
selectedTeamNameEl.textContent=teamDef(selectedTeamId).name;
resetKickoff("blue");
updateScoreLabel();
setMenuScreen(teamScreenEl);

})();
