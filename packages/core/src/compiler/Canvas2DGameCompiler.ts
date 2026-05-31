/**
 * @holoscript/core/compiler — Canvas2D Game Compiler Target
 *
 * Compiles a HoloScript composition into a self-contained, offline, retro
 * pixel-canvas GAME (HTML5 canvas, fixed-timestep loop, physics/collision,
 * WebAudio SFX, particle juice, score + localStorage, START/WIN/LOSE).
 *
 * UNLIKE Native2DCompiler (which emits DOM/UI: div/button/form), this target
 * emits an actual 2D game runtime. The gameplay is DERIVED FROM TRAITS, not
 * hand-written:
 *
 *   @controllable          → the player (keyboard-driven)
 *   @grabbable             → a collectible (score++)
 *   @collidable (only)     → a hazard (costs a heart)
 *   @dialogue              → the goal NPC (reach it to win)
 *   @ai_agent (non-goal)   → a friendly/decorative NPC
 *   environment.gravity.y  → the physics gravity constant
 *   spatial_group.origin.y → ascending tier platforms (the climb)
 *
 * The classification is GENERIC: any composition carrying these traits compiles
 * to a playable game. It is NOT a 1:1 hardcode of one scene (see the second-
 * composition test). Gate 1 is a PURE function — no RBAC/CompilerBase wiring yet
 * (that is a later gate); this keeps the trait→behavior codegen testable in
 * isolation.
 */

// ── Parsed-scene shapes (structural; tolerant of the parser's AST) ───────────
export interface CG2DTrait {
  name: string;
  config?: Record<string, unknown>;
}
export interface CG2DObject {
  name: string;
  template?: string;
  position?: number[];
  scale?: number[];
  color?: string;
  geometry?: string;
  state?: Record<string, unknown>;
  traits?: CG2DTrait[];
}
export interface CG2DGroup {
  name: string;
  origin?: number[];
  objects?: CG2DObject[];
}
export interface CG2DTemplate {
  name: string;
  geometry?: string;
  scale?: number[];
  traits?: CG2DTrait[];
  properties?: Array<{ key: string; value: unknown }>;
}
export interface CG2DComposition {
  name?: string;
  templates?: CG2DTemplate[];
  spatialGroups?: CG2DGroup[];
  environment?: { gravity?: number[]; [k: string]: unknown };
}

export interface Canvas2DGameOptions {
  /** Seconds on the vault timer (default 70). */
  timeLimit?: number;
  /** Page <title> + banner. Defaults to the composition name. */
  title?: string;
}

// ── Roles a trait-set classifies an entity into (the native mapping) ─────────
export type EntityRole = 'player' | 'collectible' | 'goal' | 'npc' | 'hazard' | 'decor';

/**
 * Classify one entity into a game role from its effective trait names.
 * Order matters: controllable > dialogue(goal) > grabbable(collectible) >
 * ai_agent(npc) > collidable(hazard) > decor. This generic precedence is what
 * keeps the compiler from hardcoding any specific scene.
 */
export function classifyRole(traitNames: Set<string>): EntityRole {
  if (traitNames.has('controllable')) return 'player';
  if (traitNames.has('dialogue')) return 'goal';
  if (traitNames.has('grabbable')) return 'collectible';
  if (traitNames.has('ai_agent')) return 'npc';
  if (traitNames.has('collidable')) return 'hazard';
  return 'decor';
}

// ── Projection: side-elevation (shared with the static 2D modality) ──────────
const W = 320,
  H = 288;
const SX = 34,
  SY = 15,
  CX = W / 2,
  GY = H - 26;
const wsx = (p: number[]) => CX + (p[0] || 0) * SX - (p[2] || 0) * 2;
const wsy = (p: number[]) => GY - (p[1] || 0) * SY;
const bandY = (originY: number) => GY - originY * SY + 8;

interface GameSpec {
  title: string;
  gravity: number;
  timeLimit: number;
  hearts: number;
  audio: { muteDefault: boolean; musicVolume: number; sfxVolume: number; musicTempo: number };
  player: { x: number; y: number; jumpHeight: number; moveSpeed: number };
  collectibles: Array<{ X: number; Y: number; c: string; points: number }>;
  hazards: Array<{ X: number; Y: number; c: string; damage: number; patrolSpeed: number }>;
  npcs: Array<{ X: number; Y: number; c: string; ai: boolean }>;
  goal: { X: number; Y: number } | null;
  tiers: Array<{ name: string; y: number; color: string }>;
}

/** Read a numeric trait/environment config value, falling back to a default. */
function numCfg(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

const TIER_COLOR: Record<string, string> = {
  bronze: '#cd7f32',
  gold: '#d4af37',
  diamond: '#b9f2ff',
};
function tierColorFor(name: string): string {
  const n = name.toLowerCase();
  for (const k of Object.keys(TIER_COLOR)) if (n.includes(k)) return TIER_COLOR[k];
  return '#caa472';
}

/**
 * Walk the composition, resolve each object's effective traits (template ∪ own),
 * classify roles, and project to a GameSpec. This is the trait→game step.
 */
export function deriveGameSpec(
  composition: CG2DComposition,
  options: Canvas2DGameOptions = {}
): GameSpec {
  const templates: Record<string, CG2DTemplate> = Object.fromEntries(
    (composition.templates || []).map((t) => [t.name, t])
  );
  const prop = (t: CG2DTemplate | undefined, key: string, dflt: unknown) =>
    (t?.properties || []).find((p) => p.key === key)?.value ?? dflt;

  const player = { x: CX - 50, y: bandY(0), jumpHeight: 7.4, moveSpeed: 1.8 };
  const collectibles: GameSpec['collectibles'] = [];
  const hazards: GameSpec['hazards'] = [];
  const npcs: GameSpec['npcs'] = [];
  let goal: GameSpec['goal'] = null;

  const groups = composition.spatialGroups || [];
  const tiers = [...groups]
    .map((g) => ({
      name: g.name,
      y: bandY((g.origin || [0, 0, 0])[1] || 0),
      color: tierColorFor(g.name),
    }))
    .sort((a, b) => b.y - a.y); // top (diamond) first → bottom (bronze) last

  const topTierY = tiers.length ? Math.min(...tiers.map((t) => t.y)) : bandY(0);
  const bottomTierY = tiers.length ? Math.max(...tiers.map((t) => t.y)) : bandY(0);

  for (const g of groups) {
    const origin = g.origin || [0, 0, 0];
    for (const o of g.objects || []) {
      const tpl = templates[o.template || ''];
      // Effective traits = template ∪ object (object overrides on duplicate name).
      const effTraits = [...(tpl?.traits || []), ...(o.traits || [])];
      const traitNames = new Set<string>(effTraits.map((t) => t.name));
      const cfg = (name: string): Record<string, unknown> => {
        const t = [...effTraits].reverse().find((tt) => tt.name === name);
        return (t?.config as Record<string, unknown>) || {};
      };
      const role = classifyRole(traitNames);
      const pos = [
        (origin[0] || 0) + ((o.position || [0, 0, 0])[0] || 0),
        (origin[1] || 0) + ((o.position || [0, 0, 0])[1] || 0),
        (origin[2] || 0) + ((o.position || [0, 0, 0])[2] || 0),
      ];
      const X = wsx(pos);
      const Y = wsy(pos);
      const color = o.color || '#cccccc';
      // unused geometry default kept for parity with the scene walk
      void prop(tpl, 'geometry', 'box');
      if (role === 'player') {
        player.x = X;
        player.y = bottomTierY;
        player.jumpHeight = numCfg(cfg('controllable').jumpHeight, 7.4);
        player.moveSpeed = numCfg(cfg('controllable').moveSpeed, 1.8);
      } else if (role === 'collectible') {
        collectibles.push({ X, Y, c: color, points: numCfg(cfg('grabbable').points, 100) });
      } else if (role === 'goal') {
        goal = { X, Y: topTierY };
      } else if (role === 'npc') {
        npcs.push({ X, Y: bandY((origin[1] || 0)) , c: color, ai: true });
      } else if (role === 'hazard') {
        hazards.push({
          X,
          Y: bandY((origin[1] || 0)),
          c: color,
          damage: numCfg(cfg('collidable').damage, 1),
          patrolSpeed: numCfg(cfg('collidable').patrolSpeed, 0.6),
        });
      }
    }
  }

  const gravityY = Math.abs((composition.environment?.gravity || [0, -9.81, 0])[1] || 9.81);
  // Map world gravity (m/s²) onto the canvas feel: ~9.81 → 0.5 px/step².
  const gravity = Math.max(0.25, Math.min(0.9, (gravityY / 9.81) * 0.5));

  const env = (composition.environment || {}) as Record<string, unknown>;
  return {
    title: options.title || composition.name || 'HoloScript 2D Game',
    gravity,
    timeLimit: options.timeLimit ?? numCfg(env.timeLimit, 70),
    hearts: Math.max(1, Math.round(numCfg(env.startingHearts, 3))),
    audio: {
      muteDefault: typeof env.muteDefault === 'boolean' ? env.muteDefault : false,
      musicVolume: numCfg(env.musicVolume, 0.025),
      sfxVolume: numCfg(env.sfxVolume, 0.05),
      musicTempo: numCfg(env.musicTempo, 480),
    },
    player,
    collectibles,
    hazards,
    npcs,
    goal,
    tiers,
  };
}

/**
 * Compile a composition to a self-contained HTML game string.
 * `sceneJson` (if provided) is embedded verbatim as `const SCENE = ...` so the
 * one-source-two-modalities digest contract and `SCENE =` consumers still hold;
 * defaults to the derived spec when omitted.
 */
export function compileCanvas2DGame(
  composition: CG2DComposition,
  options: Canvas2DGameOptions = {},
  sceneJson?: string
): string {
  const game = deriveGameSpec(composition, options);
  const gameJson = JSON.stringify(game);
  const sceneEmbed = sceneJson ?? gameJson;
  const title = game.title;
  return RUNTIME_TEMPLATE.replace('"__GAME__"', gameJson)
    .replace('"__SCENE__"', sceneEmbed)
    .replace(/__TITLE__/g, escapeHtml(title));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME ENGINE TEMPLATE (generic; consumes the injected GAME spec).
// Token "__GAME__" → derived GameSpec; "__SCENE__" → embedded source scene.
// Keeps the tokens modality-verify + gate-15 require: `SCENE =`,
// `image-rendering:pixelated`, `keydown`, and NO `WebGLRenderer`.
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_TEMPLATE = `<!doctype html><html><head><meta charset="utf-8">
<title>__TITLE__ &mdash; HoloScript 2D</title>
<style>
  html,body{margin:0;height:100%;background:#06060c;overflow:hidden;
    image-rendering:pixelated;image-rendering:crisp-edges;}
  #c{position:absolute;inset:0;margin:auto;image-rendering:pixelated;
    width:100vmin;height:90vmin;background:#06060c;}
  #t{position:absolute;top:6px;width:100%;text-align:center;color:#ffe9a0;
    font:bold 13px/1.2 monospace;letter-spacing:2px;text-shadow:2px 2px 0 #000;}
</style></head><body>
<div id="t">__TITLE__ &nbsp;(native HoloScript 2D)</div>
<canvas id="c" width="320" height="288"></canvas>
<script>
// Compiled from a HoloScript composition by Canvas2DGameCompiler.
// GAME is derived from traits (@controllable/@grabbable/@collidable/@dialogue);
// SCENE is the embedded source scene (kept for the modality digest contract).
const GAME = "__GAME__";
const SCENE = "__SCENE__";
const cv=document.getElementById('c'), x=cv.getContext('2d');
x.imageSmoothingEnabled=false;
const W=cv.width, H=cv.height;
const snap=(c)=>c;
const px=(a,b,w,h,c)=>{x.fillStyle=c;x.fillRect(a|0,b|0,w,h);};
const tx=(s,a,b,c,f)=>{x.fillStyle=c;x.font='bold '+(f||6)+'px monospace';x.fillText(s,a|0,b|0);};
const ctxt=(s,b,c,f)=>{x.font='bold '+(f||8)+'px monospace';x.fillStyle=c;x.textAlign='center';x.fillText(s,W>>1,b|0);x.textAlign='left';};

// platforms: each tier floor (full width) + auto stepping stones between tiers.
const TIERS=GAME.tiers.slice().sort((a,b)=>b.y-a.y);
const PLAT=[];
for(let i=0;i<TIERS.length;i++){PLAT.push({x0:0,x1:W,y:TIERS[i].y,band:TIERS[i].name,color:TIERS[i].color});
  if(i<TIERS.length-1){const a=TIERS[i].y,b=TIERS[i+1].y,gap=a-b;const n=Math.max(1,Math.round(gap/30)-1);
    for(let s=1;s<=n;s++){const y=a-(gap*s)/(n+1);const cx=W/2+((s%2)?-30:30);PLAT.push({x0:cx-30,x1:cx+30,y:y});}}}
const BOTTOM=TIERS.length?Math.max.apply(null,TIERS.map(t=>t.y)):H-26;

const GEMS=GAME.collectibles.map(g=>({X:g.X,Y:g.Y,got:false,c:g.c,points:g.points}));
const HZ=GAME.hazards.map(h=>({X:h.X,Y:h.Y,base:h.X,dir:1,c:h.c,dmg:h.damage,spd:h.patrolSpeed}));
const NPCS=GAME.npcs.map(n=>({X:n.X,Y:n.Y,c:n.c,ai:n.ai}));
const ARC=GAME.goal;

function drawGem(g,t){const X=g.X,Y=g.Y+Math.sin(t/300+X)*2;
  px(X-4,Y,8,2,g.c);px(X-2,Y-3,4,3,g.c);px(X-2,Y+2,4,3,g.c);px(X-3,Y+5,6,1,g.c);px(X-1,Y-2,2,1,'#ffffff');}
function drawMonster(X,Y,c){px(X-5,Y-4,10,4,c);px(X-3,Y-8,6,4,c);px(X-1,Y-12,2,4,c);px(X-3,Y-3,2,2,'#ffe9a0');px(X+1,Y-3,2,2,'#ffe9a0');}
function drawCurator(X,Y,c,ai){px(X-3,Y-15,6,5,'#f0c890');px(X-4,Y-10,8,8,c);px(X-4,Y-2,3,2,c);px(X+1,Y-2,3,2,c);if(ai)tx('AI',X-5,Y-17,'#a55a3a',6);}
function drawGoal(X,Y){px(X-3,Y-16,6,5,'#d8c8e8');px(X-5,Y-11,10,11,'#7a5a8a');px(X-1,Y-14,2,2,'#000');tx('GOAL',X-9,Y+8,'#b9f2ff',6);}

const PW=5, PH=16;
const P={x:GAME.player.x,y:GAME.player.y,vx:0,vy:0,onGround:true,sq:0,inv:0};
const MS=GAME.player.moveSpeed;
function drawPlayer(t){if(P.inv>0&&((t/60|0)&1))return;const h=PH*(1-P.sq*0.4),w=PW*(1+P.sq*0.5);
  px(P.x-3,P.y-h-5,6,5,'#f0c890');px(P.x-w,P.y-h,w*2,h,'#3a6ea5');
  px(P.x-w,P.y-3,2,3,'#3a6ea5');px(P.x+w-2,P.y-3,2,3,'#3a6ea5');tx('YOU',P.x-7,P.y-h-7,'#5e7496',6);}

let AC=null, muted=!!GAME.audio.muteDefault;
const SFX=GAME.audio.sfxVolume;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){AC=null;}}if(AC&&AC.state==='suspended')AC.resume();return AC;}
function tone(f,d,ty,v,slide,when){const c=ac();if(!c||muted)return;const o=c.createOscillator(),g=c.createGain(),T0=c.currentTime+(when||0);
  o.type=ty||'square';o.frequency.setValueAtTime(f,T0);if(slide)o.frequency.linearRampToValueAtTime(slide,T0+d);
  g.gain.setValueAtTime(v||0.05,T0);g.gain.exponentialRampToValueAtTime(0.0001,T0+d);o.connect(g);g.connect(c.destination);o.start(T0);o.stop(T0+d);}
function arp(ns,st,ty,v){ns.forEach((n,i)=>tone(n,st*1.4,ty||'square',v||0.05,null,i*st));}
const sfxJump=()=>tone(300,0.12,'square',SFX,560);
const sfxCollect=()=>{tone(660,0.06,'square',SFX);tone(988,0.09,'square',SFX,null,0.06);};
const sfxHit=()=>{tone(140,0.2,'sawtooth',SFX*1.8,60);shake=10;};
const sfxTier=()=>arp([523,659,784],0.07,'triangle',SFX);
const sfxWin=()=>arp([523,659,784,1047,1319,1568],0.11,'triangle',SFX*1.2);
const sfxLose=()=>arp([392,330,262,196,131],0.16,'sawtooth',SFX*1.2);
let beat=0, beatAcc=0; const BASS=[131,131,98,110];
function ambient(dt){if(state!=='PLAY'||muted)return;beatAcc+=dt;if(beatAcc>=GAME.audio.musicTempo){beatAcc-=GAME.audio.musicTempo;tone(BASS[beat%BASS.length],0.22,'triangle',GAME.audio.musicVolume);if(beat%4===0)tone(BASS[0]*2,0.1,'square',GAME.audio.musicVolume*0.6,null,0.24);beat++;}}

let shake=0, parts=[], floats=[];
function burst(X,Y,n,cols){for(let i=0;i<n;i++){const a=Math.random()*6.283,s=0.5+Math.random()*1.8;parts.push({x:X,y:Y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-0.6,life:18+(Math.random()*14|0),c:cols[Math.random()*cols.length|0],sz:1+(Math.random()*2|0)});}}
function dust(X,Y){for(let i=0;i<5;i++)parts.push({x:X+(Math.random()*8-4),y:Y,vx:Math.random()*1.4-0.7,vy:-Math.random()*0.8,life:10+(Math.random()*8|0),c:'#caa472',sz:1});}
function floatTxt(X,Y,s,c){floats.push({x:X,y:Y,s:s,c:c,life:36});}
function stepFx(){for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.14;if(--p.life<=0)parts.splice(i,1);}for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.y-=0.4;if(--f.life<=0)floats.splice(i,1);}if(shake>0)shake-=0.6;}

const NEED=GEMS.length;
const TOTALPTS=GEMS.reduce((s,g)=>s+g.points,0);
let state='START', score=0, gems=0, hearts=GAME.hearts, timeLeft=GAME.timeLimit, allHint=false;
let loseReason='', winTb=0, winHb=0, newHigh=false;
let hi=0; try{hi=parseInt(localStorage.getItem('holo2dHi')||'0')||0;}catch(e){}
function saveHi(){newHigh=false;if(score>hi){hi=score;newHigh=true;try{localStorage.setItem('holo2dHi',String(hi));}catch(e){}}}
function reset(){score=0;gems=0;hearts=GAME.hearts;timeLeft=GAME.timeLimit;allHint=false;P.x=GAME.player.x;P.y=GAME.player.y;P.vx=0;P.vy=0;P.onGround=true;P.inv=0;P.sq=0;GEMS.forEach(g=>g.got=false);parts=[];floats=[];shake=0;beat=0;beatAcc=0;HZ.forEach(h=>{h.X=h.base;h.dir=1;});}
function startGame(){reset();state='PLAY';ac();sfxTier();}
function jump(){if(state==='PLAY'&&P.onGround){P.vy=-GAME.player.jumpHeight;P.onGround=false;P.sq=-0.3;sfxJump();dust(P.x,P.y);}}
const keys={};

function physics(dt){const f=dt/16;
  let ax=0;if(keys.left)ax-=0.55;if(keys.right)ax+=0.55;P.vx+=ax*f;P.vx*=Math.pow(0.82,f);
  if(Math.abs(P.vx)>MS)P.vx=MS*Math.sign(P.vx);if(Math.abs(P.vx)<0.02)P.vx=0;
  P.x+=P.vx*f;if(P.x<PW){P.x=PW;P.vx=0;}if(P.x>W-PW){P.x=W-PW;P.vx=0;}
  const prevFeet=P.y;P.vy+=GAME.gravity*f;if(P.vy>7)P.vy=7;P.y+=P.vy*f;P.onGround=false;
  for(const pl of PLAT){if(P.vy>=0&&prevFeet<=pl.y+1&&P.y>=pl.y&&P.y-pl.y<14&&P.x+PW>pl.x0&&P.x-PW<pl.x1){P.y=pl.y;const land=P.vy;P.vy=0;P.onGround=true;if(land>2.4){P.sq=0.6;dust(P.x,P.y);}}}
  if(P.sq!==0)P.sq*=Math.pow(0.7,f);
  if(P.inv>0)P.inv-=dt;
  for(const h of HZ){h.X+=h.dir*h.spd*f;if(h.X>W-40)h.dir=-1;if(h.X<40)h.dir=1;
    if(P.inv<=0&&Math.abs(P.x-h.X)<8&&Math.abs(P.y-h.Y)<14){hearts-=h.dmg;P.inv=1100;P.vy=-4;P.vx=(P.x<h.X?-1:1)*2.2;sfxHit();burst(P.x,P.y-8,10,['#8a2a2a','#a55a3a','#ffe9a0']);floatTxt(P.x,P.y-18,'-1','#ff6a6a');if(hearts<=0){state='LOSE';loseReason='A HAZARD CAUGHT YOU';sfxLose();saveHi();}}}
  for(const g of GEMS){if(!g.got&&Math.abs(P.x-g.X)<9&&Math.abs((P.y-8)-g.Y)<12){g.got=true;gems++;score+=g.points;sfxCollect();burst(g.X,g.Y,12,['#d4af37','#ffe9a0','#ffffff']);floatTxt(g.X,g.Y-6,'+'+g.points,'#ffe9a0');if(gems===NEED){allHint=true;sfxTier();}}}
  if(ARC&&(NEED===0||gems===NEED)&&Math.abs(P.x-ARC.X)<12&&Math.abs(P.y-ARC.Y)<16){winTb=Math.floor(timeLeft)*10;winHb=hearts*150;score+=winTb+winHb;state='WIN';sfxWin();burst(ARC.X,ARC.Y-8,28,['#b9f2ff','#d4af37','#ffe9a0','#ffffff']);saveHi();}
  if(!ARC&&NEED>0&&gems===NEED){winTb=Math.floor(timeLeft)*10;winHb=hearts*150;score+=winTb+winHb;state='WIN';sfxWin();saveHi();}
  timeLeft-=dt/1000;if(timeLeft<=0&&state==='PLAY'){timeLeft=0;state='LOSE';loseReason='THE TIMER EXPIRED';sfxLose();saveHi();}}
function step(dt){if(state==='PLAY'){physics(dt);ambient(dt);}stepFx();}

function hud(){px(0,0,W,12,'rgba(6,6,12,0.72)');
  tx('SCORE '+score,3,9,'#ffe9a0',7);tx('HI '+hi,92,9,'#caa472',6);
  for(let i=0;i<NEED;i++){const X=W-7-i*9;px(X-3,3,6,5,i<gems?'#d4af37':'#3a2e38');}
  tx('TIME '+Math.ceil(timeLeft),W/2-20,9,timeLeft<15?'#ff6a6a':'#b9f2ff',7);
  for(let i=0;i<GAME.hearts&&i<8;i++)px(3+i*8,H-8,5,5,i<hearts?'#ff6a6a':'#3a2e38');
  if(!allHint)tx('A/D move   SPACE jump   grab all',44,H-3,'#9aa0b0',6);
  else tx(ARC?'ALL GRABBED! REACH THE GOAL':'ALL GRABBED!',54,H-3,'#ffe9a0',6);
  if(muted)tx('MUTED',W-34,H-3,'#5e7496',6);}
function panel(){x.fillStyle='rgba(6,6,12,0.8)';x.fillRect(0,0,W,H);}
function screenStart(t){panel();
  ctxt(GAME.title.toUpperCase().slice(0,20),100,'#ffe9a0',14);
  ctxt('Grab all '+NEED+(ARC?' then reach the goal.':'.'),150,'#9aa0b0',7);
  ctxt('A/D or arrows move    SPACE/W jump',200,'#b9f2ff',7);ctxt('M mute    R restart',214,'#5e7496',6);
  if((t/400|0)&1)ctxt('PRESS  SPACE  TO  START',244,'#ffe9a0',9);
  if(hi>0)ctxt('BEST  '+hi,266,'#caa472',7);}
function screenWin(t){panel();
  ctxt('YOU WIN!',92,'#d4af37',16);
  ctxt('Grabbed  '+TOTALPTS,140,'#ffe9a0',7);ctxt('Time bonus  '+winTb,154,'#ffe9a0',7);ctxt('Hearts bonus  '+winHb,168,'#ffe9a0',7);
  ctxt('SCORE  '+score,194,'#ffffff',13);if(newHigh)ctxt('* NEW HIGH SCORE *',212,'#ffe9a0',8);
  if((t/400|0)&1)ctxt('PRESS  R  TO  PLAY  AGAIN',244,'#ffe9a0',8);}
function screenLose(t){panel();
  ctxt('GAME OVER',94,'#8a2a2a',15);ctxt(loseReason,120,'#ff6a6a',7);
  ctxt('Grabbed  '+gems+' / '+NEED,148,'#9aa0b0',7);ctxt('SCORE  '+score,176,'#ffffff',12);
  if(hi>0)ctxt('BEST  '+hi,196,'#caa472',7);if((t/400|0)&1)ctxt('PRESS  R  TO  TRY  AGAIN',230,'#ffe9a0',8);}
function render(t){const ox=shake>0?((Math.random()*shake-shake/2)|0):0,oy=shake>0?((Math.random()*shake-shake/2)|0):0;
  x.save();x.translate(ox,oy);
  px(-4,-4,W+8,H+8,'#06060c');const sky=['#1a1a2e','#3a2e38','#5e7496'];for(let i=0;i<3;i++)px(0,i*10,W,10,sky[2-i]);
  for(let i=0;i<16;i++){const X=(i*53+13)%W,Y=(i*29+7)%78;px(X,Y,1,1,'#9aa0b0');}
  for(const pl of PLAT){if(pl.band){px(0,pl.y,W,3,pl.color);px(0,pl.y+3,W,2,'#3a2e38');tx((pl.band+'').toUpperCase().slice(0,14),4,pl.y-2,pl.color,6);}else{px(pl.x0,pl.y,pl.x1-pl.x0,3,'#caa472');px(pl.x0,pl.y+3,pl.x1-pl.x0,1,'#3a2e38');}}
  for(const g of GEMS)if(!g.got)drawGem(g,t);
  for(const n of NPCS)drawCurator(n.X,n.Y,n.c,n.ai);
  if(ARC){drawGoal(ARC.X,ARC.Y);if((NEED===0||gems===NEED)&&((t/200|0)&1))tx('!',ARC.X-1,ARC.Y-20,'#ffe9a0',8);}
  for(const h of HZ)drawMonster(h.X,h.Y,h.c);
  for(const p of parts)px(p.x,p.y,p.sz,p.sz,p.c);
  for(const fl of floats)tx(fl.s,fl.x-6,fl.y,fl.c,6);
  if(state!=='START')drawPlayer(t);
  x.restore();
  x.fillStyle='rgba(0,0,0,0.16)';for(let y=0;y<H;y+=2)x.fillRect(0,y,W,1);
  if(state==='PLAY'||state==='WIN'||state==='LOSE')hud();
  if(state==='START')screenStart(t);else if(state==='WIN')screenWin(t);else if(state==='LOSE')screenLose(t);}

function keyTo(k){k=k.toLowerCase();if(k==='a'||k==='arrowleft')return 'left';if(k==='d'||k==='arrowright')return 'right';if(k==='w'||k==='arrowup'||k===' ')return 'jump';return null;}
addEventListener('keydown',function(e){const k=e.key,v=keyTo(k);
  if(v==='left')keys.left=true;if(v==='right')keys.right=true;
  if(v==='jump'){e.preventDefault();if(state==='PLAY')jump();else startGame();}
  if(k==='r'||k==='R'){if(state==='WIN'||state==='LOSE')startGame();}
  if(k==='m'||k==='M')muted=!muted;});
addEventListener('keyup',function(e){const v=keyTo(e.key);if(v==='left')keys.left=false;if(v==='right')keys.right=false;if(v==='jump'&&P.vy<0)P.vy*=0.45;});
function tFrac(cx){const r=cv.getBoundingClientRect();return (cx-r.left)/r.width;}
cv.addEventListener('touchstart',function(e){e.preventDefault();if(state!=='PLAY'){startGame();return;}const fr=tFrac(e.touches[0].clientX);if(fr<0.33)keys.left=true;else if(fr>0.66)keys.right=true;else jump();},{passive:false});
cv.addEventListener('touchend',function(e){e.preventDefault();keys.left=false;keys.right=false;},{passive:false});

let last=0, accum=0;
function frame(ts){if(!last)last=ts;let dt=ts-last;last=ts;if(dt>60)dt=60;accum+=dt;let guard=0;while(accum>=16&&guard++<6){step(16);accum-=16;}render(ts);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
</script></body></html>`;
