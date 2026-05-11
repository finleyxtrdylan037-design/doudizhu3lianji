/* ============================================================
   DOUDIZHU UI - game-ui.js
   Rendering, menu, lobby, sounds, animations, stats, PeerJS net
   Depends on DDZ (game-core.js) and Peer (PeerJS CDN, lazy loaded)
   iOS-safe: var only, no arrow funcs, no .includes(), unicode escapes
   ============================================================ */
(function(global){
'use strict';

var DDZ=global.DDZ;
if(!DDZ){console.error('DDZ core not loaded');return;}

/* ============================================================
   1. AUDIO (1:1 from prior version)
   ============================================================ */
var audioCtx=null,audioEnabled=true;
function ensureAudio(){
  if(audioCtx) return;
  try{
    var AC=window.AudioContext||window.webkitAudioContext;
    if(AC) audioCtx=new AC();
  }catch(e){audioCtx=null;}
}
function playTone(freq,dur,type,gain){
  if(!audioEnabled||!audioCtx) return;
  try{
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type||'sine';o.frequency.value=freq;
    g.gain.value=gain||0.08;
    o.connect(g);g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+dur);
    o.stop(audioCtx.currentTime+dur+0.05);
  }catch(e){}
}
function playSound(name){
  ensureAudio();if(!audioCtx)return;
  switch(name){
    case'play':playTone(440,0.1,'triangle',0.06);break;
    case'pass':playTone(200,0.15,'sine',0.05);break;
    case'bomb':playTone(120,0.4,'sawtooth',0.12);setTimeout(function(){playTone(80,0.3,'sawtooth',0.10);},100);break;
    case'rocket':playTone(200,0.2,'square',0.10);setTimeout(function(){playTone(400,0.2,'square',0.10);},150);setTimeout(function(){playTone(800,0.3,'square',0.10);},300);break;
    case'win':playTone(523,0.15,'sine',0.10);setTimeout(function(){playTone(659,0.15,'sine',0.10);},150);setTimeout(function(){playTone(784,0.3,'sine',0.10);},300);break;
    case'lose':playTone(330,0.2,'sine',0.08);setTimeout(function(){playTone(247,0.4,'sine',0.08);},200);break;
    case'select':playTone(660,0.04,'sine',0.04);break;
    case'bid':playTone(550,0.12,'triangle',0.07);break;
  }
}

/* ============================================================
   2. APP STATE
   ============================================================ */
var App={
  mode:'menu',
  gameMode:null,         // 'single' | 'host' | 'guest'
  engine:null,
  net:null,
  mySeat:0,
  myName:'\u73A9\u5BB6',
  humanAdapter:null,
  remoteState:null,
  selectedCardIds:{},
  hintList:[],hintIdx:-1,
  cheat:false,
  cumulativeScores:[0,0,0],
  stats:null
};

/* ============================================================
   3. CARD RENDERING (1:1 from prior version)
   ============================================================ */
function cardHTML(c,sel){
  var cls='card '+(DDZ.SC[c.suit]||'');
  if(c.isJoker==='big')cls+=' bj';
  if(c.isJoker==='small')cls+=' sj';
  if(sel)cls+=' selected';
  return '<div class="'+cls+'" data-cid="'+c.id+'"><div class="card-tl"><div>'+c.rank+'</div><div>'+c.suit+'</div></div><div class="card-c">'+c.suit+'</div><div class="card-br"><div>'+c.rank+'</div><div>'+c.suit+'</div></div></div>';
}
function cardBackHTML(){return '<div class="card back"></div>';}

/* ============================================================
   4. VIEW SWITCHING
   ============================================================ */
function showView(name){
  App.mode=name;
  var ids=['viewMenu','viewLobby','viewGame'];
  var map={menu:'viewMenu',lobby:'viewLobby',game:'viewGame'};
  for(var i=0;i<ids.length;i++){
    var el=document.getElementById(ids[i]);
    if(el) el.style.display=(ids[i]===map[name])?'flex':'none';
  }
}

/* ============================================================
   5. SEAT POSITION MAPPING
   bottom=mySeat, right=(mySeat+1)%3, left=(mySeat+2)%3
   ============================================================ */
function posFromSeat(seat){
  var ms=App.mySeat;
  if(seat===ms) return'bottom';
  if(seat===(ms+1)%3) return'right';
  return'left';
}
function seatFromPos(pos){
  var ms=App.mySeat;
  if(pos==='bottom') return ms;
  if(pos==='right') return(ms+1)%3;
  return(ms+2)%3;
}

/* ============================================================
   6. STATE ACCESSOR + RENDER
   ============================================================ */
function getDisplayState(){
  if(App.gameMode==='guest') return App.remoteState;
  if(App.engine) return App.engine.snapshot();
  return null;
}
function render(){
  var st=getDisplayState();
  if(!st)return;
  var positions=['bottom','right','left'];
  for(var pi=0;pi<positions.length;pi++){
    var pos=positions[pi];
    var seat=seatFromPos(pos);
    var nameEl=document.getElementById('name_'+pos);
    var cntEl=document.getElementById('cnt_'+pos);
    var roleEl=document.getElementById('role_'+pos);
    var handEl=document.getElementById('hand_'+pos);
    var scoreEl=document.getElementById('score_'+pos);
    if(nameEl) nameEl.textContent=(st.playerNames&&st.playerNames[seat])||('\u73A9\u5BB6'+(seat+1));
    if(cntEl) cntEl.textContent=(st.handLengths?st.handLengths[seat]:0)+'\u5F20';
    if(roleEl){
      if(seat===st.landlordIdx){roleEl.textContent='\u5730\u4E3B';roleEl.className='role landlord';}
      else if(st.landlordIdx>=0){roleEl.textContent='\u519C\u6C11';roleEl.className='role farmer';}
      else {roleEl.textContent='';roleEl.className='role';}
    }
    if(scoreEl) scoreEl.textContent=(st.cumulativeScores?st.cumulativeScores[seat]:0);
    if(handEl){
      if(pos==='bottom'){
        var myHand=(st.hands&&st.hands[App.mySeat])?st.hands[App.mySeat]:[];
        var html='';
        for(var i=0;i<myHand.length;i++) html+=cardHTML(myHand[i],!!App.selectedCardIds[myHand[i].id]);
        handEl.innerHTML=html;
      } else {
        var len=st.handLengths?st.handLengths[seat]:0;
        if(App.cheat&&st.hands&&st.hands[seat]&&st.hands[seat].length){
          var html='';
          for(var i=0;i<st.hands[seat].length;i++) html+=cardHTML(st.hands[seat][i],false);
          handEl.innerHTML=html;
        } else {
          var html='';
          for(var i=0;i<len;i++) html+=cardBackHTML();
          handEl.innerHTML=html;
        }
      }
    }
  }
  for(var pi=0;pi<positions.length;pi++){
    var el=document.getElementById('seat_'+positions[pi]);
    if(el){
      if(seatFromPos(positions[pi])===st.currentPlayer) el.classList.add('active');
      else el.classList.remove('active');
    }
  }
  var phaseEl=document.getElementById('phaseInfo');
  if(phaseEl){
    if(st.phase==='bid') phaseEl.textContent='\u53EB\u5206\u9636\u6BB5 \u00B7 \u5F53\u524D\u6700\u9AD8 '+(st.bidValue||0)+'\u5206';
    else if(st.phase==='play') phaseEl.textContent='\u51FA\u724C \u00B7 \u500D\u6570 '+((App.engine&&App.engine.calcMult)?App.engine.calcMult():1)+'x';
    else phaseEl.textContent='';
  }
}

/* ============================================================
   7. PLAYED-CARDS DISPLAY
   ============================================================ */
function showPlayed(seat,cards,isBomb){
  var pos=posFromSeat(seat);
  var el=document.getElementById('played_'+pos);
  if(!el)return;
  var html='';
  for(var i=0;i<cards.length;i++) html+=cardHTML(cards[i],false);
  el.innerHTML='<div class="played-cards'+(isBomb?' bomb':'')+'">'+html+'</div>';
}
function showPass(seat){
  var pos=posFromSeat(seat);
  var el=document.getElementById('played_'+pos);
  if(el) el.innerHTML='<div class="pass-tag">\u4E0D\u8981</div>';
}
function showBid(seat,value){
  var pos=posFromSeat(seat);
  var el=document.getElementById('played_'+pos);
  if(el) el.innerHTML='<div class="bid-tag">'+(value===0?'\u4E0D\u53EB':(value+'\u5206'))+'</div>';
}
function clearAllPlayed(){
  var ps=['bottom','right','left'];
  for(var i=0;i<ps.length;i++){
    var el=document.getElementById('played_'+ps[i]);
    if(el) el.innerHTML='';
  }
}

/* ============================================================
   8. SELECTION / BUTTON BAR
   ============================================================ */
function toggleSelect(cid){
  if(App.selectedCardIds[cid]) delete App.selectedCardIds[cid];
  else App.selectedCardIds[cid]=true;
  playSound('select');
  render();
}
function clearSelection(){
  App.selectedCardIds={};
  App.hintList=[];App.hintIdx=-1;
}
function getSelectedCards(){
  var st=getDisplayState();
  if(!st||!st.hands)return[];
  var hand=st.hands[App.mySeat]||[];
  var r=[];
  for(var i=0;i<hand.length;i++) if(App.selectedCardIds[hand[i].id]) r.push(hand[i]);
  return r;
}
function showBidButtons(currentBid){
  var bar=document.getElementById('actionBar');
  if(!bar)return;
  var html='';
  html+='<button class="abtn" data-bid="0">\u4E0D\u53EB</button>';
  for(var v=Math.max(1,currentBid+1);v<=3;v++){
    html+='<button class="abtn primary" data-bid="'+v+'">'+v+'\u5206</button>';
  }
  bar.innerHTML=html;
  var btns=bar.querySelectorAll('.abtn');
  for(var i=0;i<btns.length;i++){
    (function(b){
      b.addEventListener('click',function(){
        var v=parseInt(b.getAttribute('data-bid'),10);
        submitBid(v);
      });
    })(btns[i]);
  }
}
function showPlayButtons(canPass){
  var bar=document.getElementById('actionBar');
  if(!bar)return;
  var html='';
  if(canPass) html+='<button class="abtn" id="btnPass">\u4E0D\u8981</button>';
  html+='<button class="abtn" id="btnHint">\u63D0\u793A</button>';
  html+='<button class="abtn primary" id="btnPlay">\u51FA\u724C</button>';
  bar.innerHTML=html;
  var bp=document.getElementById('btnPass');
  if(bp) bp.addEventListener('click',function(){submitPlay(null);});
  var bh=document.getElementById('btnHint');
  if(bh) bh.addEventListener('click',doHint);
  var bpl=document.getElementById('btnPlay');
  if(bpl) bpl.addEventListener('click',function(){
    var sel=getSelectedCards();
    if(!sel.length){toast('\u8BF7\u9009\u62E9\u8981\u51FA\u7684\u724C');return;}
    submitPlay(sel);
  });
}
function clearActionBar(){
  var bar=document.getElementById('actionBar');
  if(bar) bar.innerHTML='';
}

/* ============================================================
   9. HINT
   ============================================================ */
function doHint(){
  var st=getDisplayState();
  if(!st)return;
  var hand=st.hands[App.mySeat]||[];
  var lp=null;
  if(st.lastPlay){lp={type:st.lastPlay.type,rank:st.lastPlay.rank,len:st.lastPlay.len,planeLen:st.lastPlay.planeLen};}
  if(!App.hintList.length){
    App.hintList=DDZ.generateHints(hand,lp,st.lastPlayPlayer,App.mySeat);
    App.hintIdx=-1;
  }
  if(!App.hintList.length){toast('\u65E0\u724C\u53EF\u51FA');return;}
  App.hintIdx=(App.hintIdx+1)%App.hintList.length;
  var pick=App.hintList[App.hintIdx];
  App.selectedCardIds={};
  for(var i=0;i<pick.length;i++) App.selectedCardIds[pick[i].id]=true;
  playSound('select');
  render();
}

/* ============================================================
  10. SUBMITTING
  ============================================================ */
function submitBid(v){
  clearActionBar();
  showBid(App.mySeat,v);
  if(App.gameMode==='guest'){
    if(App.net) App.net.sendBid(v);
  } else {
    if(App.humanAdapter&&App.humanAdapter.pendingType==='bid') App.humanAdapter.submit(v);
  }
}
function submitPlay(cards){
  var st=getDisplayState();
  var free=!st.lastPlay||st.lastPlayPlayer===App.mySeat;
  if(!cards){
    if(free){toast('\u4F60\u51FA\u724C\uFF0C\u4E0D\u80FD\u4E0D\u8981');return;}
    clearActionBar();clearSelection();
    if(App.gameMode==='guest'){if(App.net) App.net.sendPlay(null);}
    else if(App.humanAdapter&&App.humanAdapter.pendingType==='play') App.humanAdapter.submit(null);
    return;
  }
  var play=DDZ.analyzeCards(cards);
  if(!play){toast('\u724C\u578B\u4E0D\u5408\u6CD5');return;}
  if(!free){
    var lp={type:st.lastPlay.type,rank:st.lastPlay.rank,len:st.lastPlay.len,planeLen:st.lastPlay.planeLen};
    if(!DDZ.canBeat(play,lp)){toast('\u538B\u4E0D\u4F4F\u4E0A\u5BB6');return;}
  }
  clearActionBar();clearSelection();
  if(App.gameMode==='guest'){if(App.net) App.net.sendPlay(DDZ.cardsToIds(cards));}
  else if(App.humanAdapter&&App.humanAdapter.pendingType==='play') App.humanAdapter.submit(cards);
}

/* ============================================================
  11. TOAST + RESULT OVERLAY
  ============================================================ */
function toast(msg,dur){
  var t=document.getElementById('toast');
  if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._h);
  t._h=setTimeout(function(){t.classList.remove('show');},dur||1500);
}
function showResult(info){
  var ov=document.getElementById('resultOverlay');
  if(!ov)return;
  var winFarm=(info.winnerIdx!==info.landlordIdx);
  var mySide=(App.mySeat===info.landlordIdx)?'landlord':'farmer';
  var iWon=(mySide==='landlord'&&!winFarm)||(mySide==='farmer'&&winFarm);
  var title=iWon?'\u80DC\u5229':'\u5931\u8D25';
  var lines=[];
  lines.push('\u5730\u4E3B\uFF1A'+(info.playerNames?info.playerNames[info.landlordIdx]:'?'));
  lines.push('\u57FA\u672C\u5206\uFF1A'+info.baseBid+' \u00D7 \u500D\u6570 '+info.multiplier);
  if(info.spring) lines.push('\u6625\u5929\uFF01');
  if(info.antiSpring) lines.push('\u53CD\u6625\u5929\uFF01');
  lines.push('\u672C\u5C40\u5F97\u5206\uFF1A'+(info.deltas?info.deltas[App.mySeat]:0));
  lines.push('\u7D2F\u8BA1\u5F97\u5206\uFF1A'+info.cumulativeScores[App.mySeat]);
  var html='<div class="result-box '+(iWon?'win':'lose')+'">';
  html+='<div class="result-title">'+title+'</div>';
  for(var i=0;i<lines.length;i++) html+='<div class="result-line">'+lines[i]+'</div>';
  html+='<div class="result-buttons">';
  if(App.gameMode==='single'){
    html+='<button class="abtn primary" id="btnNextRound">\u4E0B\u4E00\u5C40</button>';
  } else if(App.gameMode==='host'){
    html+='<button class="abtn primary" id="btnNextRound">\u4E0B\u4E00\u5C40</button>';
  } else {
    html+='<div class="result-line dim">\u7B49\u5F85\u623F\u4E3B\u5F00\u59CB\u4E0B\u5C40\u2026</div>';
  }
  html+='<button class="abtn" id="btnExitGame">\u9000\u51FA</button>';
  html+='</div></div>';
  ov.innerHTML=html;
  ov.style.display='flex';
  playSound(iWon?'win':'lose');
  if(iWon) confetti();
  var bn=document.getElementById('btnNextRound');
  if(bn) bn.addEventListener('click',function(){
    ov.style.display='none';ov.innerHTML='';
    if(App.gameMode==='single') nextRoundSingle();
    else if(App.gameMode==='host') nextRoundHost();
  });
  var be=document.getElementById('btnExitGame');
  if(be) be.addEventListener('click',function(){
    ov.style.display='none';ov.innerHTML='';
    exitToMenu();
  });
  saveRoundToStats(info,iWon);
}
function confetti(){
  var c=document.getElementById('confetti');
  if(!c)return;
  c.innerHTML='';
  for(var i=0;i<60;i++){
    var p=document.createElement('div');
    p.className='confetti-piece';
    p.style.left=(Math.random()*100)+'%';
    p.style.background='hsl('+(Math.random()*360)+',80%,60%)';
    p.style.animationDelay=(Math.random()*1.5)+'s';
    p.style.animationDuration=(2+Math.random()*1.5)+'s';
    c.appendChild(p);
  }
  setTimeout(function(){c.innerHTML='';},4500);
}

/* ============================================================
  12. STATS
  ============================================================ */
var STATS_KEY='ddz_stats_v1';
var NAME_KEY='ddz_myname_v1';
function loadStats(){
  try{
    var s=localStorage.getItem(STATS_KEY);
    if(!s){App.stats={rounds:[],totalGames:0,wins:0,losses:0};return;}
    App.stats=JSON.parse(s);
    if(!App.stats.rounds)App.stats.rounds=[];
  }catch(e){App.stats={rounds:[],totalGames:0,wins:0,losses:0};}
}
function persistStats(){
  try{localStorage.setItem(STATS_KEY,JSON.stringify(App.stats));}catch(e){}
}
function saveRoundToStats(info,iWon){
  if(!App.stats)loadStats();
  App.stats.totalGames++;
  if(iWon)App.stats.wins++;else App.stats.losses++;
  App.stats.rounds.unshift({
    t:Date.now(),
    mySeat:App.mySeat,
    landlord:info.landlordIdx,
    winner:info.winnerIdx,
    baseBid:info.baseBid,
    multiplier:info.multiplier,
    delta:info.deltas[App.mySeat],
    cumulative:info.cumulativeScores[App.mySeat],
    spring:!!info.spring,
    antiSpring:!!info.antiSpring,
    mode:App.gameMode
  });
  if(App.stats.rounds.length>200) App.stats.rounds.length=200;
  persistStats();
}
function showStats(){
  var modal=document.getElementById('statsModal');
  if(!modal)return;
  if(!App.stats)loadStats();
  var s=App.stats;
  var winRate=s.totalGames>0?Math.round(s.wins/s.totalGames*100):0;
  var html='<div class="modal-content"><div class="modal-title">\u6218\u7EE9</div>';
  html+='<div class="stats-grid">';
  html+='<div class="stats-item"><div class="stats-label">\u603B\u573A\u6B21</div><div class="stats-val">'+s.totalGames+'</div></div>';
  html+='<div class="stats-item"><div class="stats-label">\u80DC\u5229</div><div class="stats-val">'+s.wins+'</div></div>';
  html+='<div class="stats-item"><div class="stats-label">\u5931\u8D25</div><div class="stats-val">'+s.losses+'</div></div>';
  html+='<div class="stats-item"><div class="stats-label">\u80DC\u7387</div><div class="stats-val">'+winRate+'%</div></div>';
  html+='</div>';
  html+='<div class="stats-list-title">\u6700\u8FD1\u5BF9\u5C40</div>';
  html+='<div class="stats-list">';
  if(!s.rounds.length) html+='<div class="empty">\u6682\u65E0\u8BB0\u5F55</div>';
  for(var i=0;i<Math.min(s.rounds.length,20);i++){
    var r=s.rounds[i];
    var role=(r.mySeat===r.landlord)?'\u5730\u4E3B':'\u519C\u6C11';
    var won=((r.mySeat===r.landlord)===(r.winner===r.landlord));
    var sign=r.delta>=0?'+':'';
    html+='<div class="stats-row '+(won?'win':'lose')+'">';
    html+='<span class="sr-role">'+role+'</span>';
    html+='<span class="sr-pts">'+sign+r.delta+'</span>';
    html+='<span class="sr-mult">'+r.baseBid+'\u00D7'+r.multiplier+(r.spring?' \u6625':'')+(r.antiSpring?' \u53CD\u6625':'')+'</span>';
    html+='<span class="sr-cum">\u7D2F\u8BA1 '+r.cumulative+'</span>';
    html+='</div>';
  }
  html+='</div>';
  html+='<div class="modal-actions">';
  html+='<button class="abtn" id="btnClearStats">\u6E05\u9664\u8BB0\u5F55</button>';
  html+='<button class="abtn primary" id="btnCloseStats">\u5173\u95ED</button>';
  html+='</div></div>';
  modal.innerHTML=html;
  modal.style.display='flex';
  var bc=document.getElementById('btnCloseStats');
  if(bc) bc.addEventListener('click',function(){modal.style.display='none';modal.innerHTML='';});
  var bcl=document.getElementById('btnClearStats');
  if(bcl) bcl.addEventListener('click',function(){
    if(confirm('\u786E\u8BA4\u6E05\u9664\u6240\u6709\u6218\u7EE9\u8BB0\u5F55\uFF1F')){
      App.stats={rounds:[],totalGames:0,wins:0,losses:0};
      persistStats();showStats();
    }
  });
}

/* ============================================================
  13. SINGLE-PLAYER FLOW
  ============================================================ */
function bindHumanAdapter(ad){
  ad.onPrompt=function(type,ctx){
    if(type==='bid') showBidButtons(ctx.currentBidValue||0);
    else if(type==='play'){
      showPlayButtons(!ctx.free);
      clearSelection();
      render();
    }
  };
}
function startSingle(){
  App.gameMode='single';
  App.mySeat=0;
  App.cumulativeScores=[0,0,0];
  App.humanAdapter=new DDZ.HumanLocalAdapter();
  bindHumanAdapter(App.humanAdapter);
  App.engine=new DDZ.GameEngine({
    players:[App.humanAdapter,
             new DDZ.AIAdapter({thinkMin:600,thinkMax:1100}),
             new DDZ.AIAdapter({thinkMin:600,thinkMax:1100})],
    names:[App.myName,'AI \u4E59','AI \u4E19'],
    onEvent:onEngineEvent,
    onState:onEngineState,
    onSettle:onEngineSettle,
    cumulativeScores:App.cumulativeScores
  });
  showView('game');
  clearAllPlayed();clearSelection();clearActionBar();
  App.engine.startRound();
}
function nextRoundSingle(){
  if(!App.engine){startSingle();return;}
  clearAllPlayed();clearSelection();clearActionBar();
  App.humanAdapter=new DDZ.HumanLocalAdapter();
  bindHumanAdapter(App.humanAdapter);
  App.engine.players[App.mySeat]=App.humanAdapter;
  App.engine.startRound();
}

/* ============================================================
  14. ENGINE CALLBACKS (single + host)
  ============================================================ */
function onEngineState(st){
  if(App.gameMode==='guest') return;
  if(App.gameMode==='host'&&App.net) App.net.broadcastState(st);
  render();
}
function onEngineEvent(ev){
  if(App.gameMode==='guest') return;
  switch(ev.type){
    case'roundStart':
      clearAllPlayed();
      App.cumulativeScores=App.engine.cumulativeScores;
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      render();
      break;
    case'bid':
      showBid(ev.seat,ev.value);
      if(ev.value>0) playSound('bid');
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      break;
    case'bidRedeal':
      toast('\u4E09\u4EBA\u4E0D\u53EB\uFF0C\u91CD\u53D1');
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      break;
    case'bidFinal':
      var center=document.getElementById('bottomReveal');
      if(center){
        var html='';
        for(var i=0;i<ev.bottomCards.length;i++) html+=cardHTML(ev.bottomCards[i],false);
        center.innerHTML=html;center.style.display='flex';
        setTimeout(function(){center.style.display='none';center.innerHTML='';clearAllPlayed();},2200);
      }
      App.cumulativeScores=App.engine.cumulativeScores;
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      render();
      break;
    case'play':
      clearAllPlayed();
      showPlayed(ev.seat,ev.cards,ev.isBomb);
      if(ev.isBomb){
        if(ev.pattern.type==='rocket') playSound('rocket');
        else playSound('bomb');
      } else playSound('play');
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      break;
    case'pass':
      showPass(ev.seat);playSound('pass');
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      break;
    case'roundEnd':
      if(App.gameMode==='host'&&App.net) App.net.broadcastEvent(ev);
      break;
  }
}
function onEngineSettle(info){
  App.cumulativeScores=App.engine.cumulativeScores;
  setTimeout(function(){showResult(info);},800);
  if(App.gameMode==='host'&&App.net) App.net.broadcastSettle(info);
}

/* ============================================================
  15. EXIT / MENU
  ============================================================ */
function exitToMenu(){
  if(App.net){try{App.net.close();}catch(e){}}
  App.engine=null;App.net=null;App.gameMode=null;App.humanAdapter=null;
  App.remoteState=null;clearSelection();clearActionBar();
  var ov=document.getElementById('resultOverlay');
  if(ov){ov.style.display='none';ov.innerHTML='';}
  showView('menu');
}

/* ============================================================
  16. PEERJS LOADER
  ============================================================ */
var peerJSLoaded=false;
function loadPeerJS(cb){
  if(peerJSLoaded||window.Peer){peerJSLoaded=true;cb();return;}
  var s=document.createElement('script');
  s.src='https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
  s.onload=function(){peerJSLoaded=true;cb();};
  s.onerror=function(){cb(new Error('peerjs load failed'));};
  document.body.appendChild(s);
}

/* ============================================================
  17. HOST NET
  ============================================================ */
function makeHostNet(){
  var net={
    role:'host',
    peer:null,
    hostPeerId:'',
    conns:{},          // peerId -> { conn, seat, name, alive }
    pendingRequests:{},
    engine:null,
    close:function(){
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){try{this.conns[ids[i]].conn.close();}catch(e){}}
      try{this.peer&&this.peer.destroy();}catch(e){}
    },
    seatOf:function(peerId){return this.conns[peerId]?this.conns[peerId].seat:-1;},
    findFreeSeat:function(){
      for(var s=1;s<3;s++){
        var taken=false;
        var ids=Object.keys(this.conns);
        for(var i=0;i<ids.length;i++) if(this.conns[ids[i]].seat===s&&this.conns[ids[i]].alive){taken=true;break;}
        if(!taken) return s;
      }
      return -1;
    },
    buildLobbyInfo:function(){
      var seats=[App.myName,null,null];
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){
        var c=this.conns[ids[i]];
        if(c.alive&&c.seat>=0) seats[c.seat]=c.name;
      }
      return {roomCode:this.hostPeerId,seats:seats};
    },
    broadcastLobby:function(){
      var info=this.buildLobbyInfo();
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){
        try{this.conns[ids[i]].conn.send({type:'lobby',info:info});}catch(e){}
      }
      if(this.onLobby) this.onLobby(info);
    },
    filterStateForSeat:function(st,seat){
      var out={
        phase:st.phase,landlordIdx:st.landlordIdx,
        bidder:st.bidder,bidValue:st.bidValue,bidTurn:st.bidTurn,
        bidLog:st.bidLog,currentPlayer:st.currentPlayer,
        lastPlay:st.lastPlay,lastPlayCards:st.lastPlayCards,
        lastPlayPlayer:st.lastPlayPlayer,passCount:st.passCount,
        bombCount:st.bombCount,spring:st.spring,antiSpring:st.antiSpring,
        playedCounts:st.playedCounts,playerNames:st.playerNames,
        cumulativeScores:st.cumulativeScores,
        handLengths:st.handLengths,
        hands:[[],[],[]],
        bottomCards:[]
      };
      if(st.hands&&st.hands[seat]){
        out.hands[seat]=st.hands[seat].map(function(c){
          return{id:c.id,rank:c.rank,suit:c.suit,value:c.value,isJoker:c.isJoker};
        });
      }
      return out;
    },
    broadcastState:function(st){
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){
        var c=this.conns[ids[i]];
        if(!c.alive||c.seat<0) continue;
        try{c.conn.send({type:'state',state:this.filterStateForSeat(st,c.seat)});}catch(e){}
      }
    },
    broadcastEvent:function(ev){
      var msg={type:'event',ev:{type:ev.type,seat:ev.seat,value:ev.value}};
      if(ev.cards) msg.ev.cards=ev.cards.map(function(c){return{id:c.id,rank:c.rank,suit:c.suit,value:c.value,isJoker:c.isJoker};});
      if(ev.isBomb) msg.ev.isBomb=true;
      if(ev.pattern) msg.ev.pattern=ev.pattern;
      if(ev.bottomCards) msg.ev.bottomCards=ev.bottomCards.map(function(c){return{id:c.id,rank:c.rank,suit:c.suit,value:c.value,isJoker:c.isJoker};});
      if(ev.landlordIdx!==undefined) msg.ev.landlordIdx=ev.landlordIdx;
      if(ev.baseBid!==undefined) msg.ev.baseBid=ev.baseBid;
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){
        if(this.conns[ids[i]].alive){try{this.conns[ids[i]].conn.send(msg);}catch(e){}}
      }
    },
    broadcastSettle:function(info){
      var msg={type:'settle',info:{
        landlordIdx:info.landlordIdx,winnerIdx:info.winnerIdx,
        baseBid:info.baseBid,multiplier:info.multiplier,
        deltas:info.deltas,spring:info.spring,antiSpring:info.antiSpring,
        cumulativeScores:info.cumulativeScores,playerNames:info.playerNames
      }};
      var ids=Object.keys(this.conns);
      for(var i=0;i<ids.length;i++){
        if(this.conns[ids[i]].alive){try{this.conns[ids[i]].conn.send(msg);}catch(e){}}
      }
    },
    requestBid:function(seat,req){
      var self=this;
      return new Promise(function(resolve){
        var ids=Object.keys(self.conns);
        var conn=null;
        for(var i=0;i<ids.length;i++) if(self.conns[ids[i]].seat===seat&&self.conns[ids[i]].alive){conn=self.conns[ids[i]].conn;break;}
        if(!conn){resolve(DDZ.aiBidDec(req.hand,req.currentBidValue));return;}
        self.pendingRequests[seat]={resolve:resolve,kind:'bid',req:req,t0:Date.now()};
        try{conn.send({type:'requestBid',currentBidValue:req.currentBidValue,seat:seat});}
        catch(e){delete self.pendingRequests[seat];resolve(DDZ.aiBidDec(req.hand,req.currentBidValue));}
      });
    },
    requestPlay:function(seat,ctx){
      var self=this;
      return new Promise(function(resolve){
        var ids=Object.keys(self.conns);
        var conn=null;
        for(var i=0;i<ids.length;i++) if(self.conns[ids[i]].seat===seat&&self.conns[ids[i]].alive){conn=self.conns[ids[i]].conn;break;}
        if(!conn){
          resolve(DDZ.aiChoose({
            myIdx:ctx.myIdx,hand:ctx.hand,candidates:ctx.candidates,free:ctx.free,
            landlordIdx:ctx.landlordIdx,handLengths:ctx.handLengths,
            lastPlay:ctx.lastPlay,lastPlayPlayer:ctx.lastPlayPlayer,
            playedRecord:ctx.playedRecord,allHands:ctx.allHands
          }));return;
        }
        self.pendingRequests[seat]={resolve:resolve,kind:'play',ctx:ctx,t0:Date.now()};
        try{conn.send({type:'requestPlay',free:ctx.free,lastPlay:ctx.lastPlay,lastPlayPlayer:ctx.lastPlayPlayer,seat:seat});}
        catch(e){
          delete self.pendingRequests[seat];
          resolve(DDZ.aiChoose({
            myIdx:ctx.myIdx,hand:ctx.hand,candidates:ctx.candidates,free:ctx.free,
            landlordIdx:ctx.landlordIdx,handLengths:ctx.handLengths,
            lastPlay:ctx.lastPlay,lastPlayPlayer:ctx.lastPlayPlayer,
            playedRecord:ctx.playedRecord,allHands:ctx.allHands
          }));
        }
      });
    },
    onClientDisconnect:function(peerId){
      var c=this.conns[peerId];
      if(!c)return;
      c.alive=false;
      var seat=c.seat;
      if(this.pendingRequests[seat]){
        var pr=this.pendingRequests[seat];
        delete this.pendingRequests[seat];
        if(pr.kind==='bid'){pr.resolve(DDZ.aiBidDec(pr.req.hand,pr.req.currentBidValue));}
        else{
          var ctx=pr.ctx;
          pr.resolve(DDZ.aiChoose({
            myIdx:ctx.myIdx,hand:ctx.hand,candidates:ctx.candidates,free:ctx.free,
            landlordIdx:ctx.landlordIdx,handLengths:ctx.handLengths,
            lastPlay:ctx.lastPlay,lastPlayPlayer:ctx.lastPlayPlayer,
            playedRecord:ctx.playedRecord,allHands:ctx.allHands
          }));
        }
      }
      this.broadcastLobby();
      if(this.onClientDrop) this.onClientDrop(seat);
    }
  };
  return net;
}
function buildHostAdapter(net,seat){
  return {
    decideBid:function(req){return net.requestBid(seat,req);},
    decidePlay:function(ctx){
      return net.requestPlay(seat,ctx).then(function(cardIds){
        if(!cardIds) return null;
        if(cardIds.length&&typeof cardIds[0]==='number'){
          var cards=DDZ.idsToCards(cardIds);
          var inHand={};
          for(var i=0;i<ctx.hand.length;i++) inHand[ctx.hand[i].id]=true;
          for(var i=0;i<cardIds.length;i++) if(!inHand[cardIds[i]]) return null;
          var play=DDZ.analyzeCards(cards);
          if(!play) return null;
          if(!ctx.free){if(!DDZ.canBeat(play,ctx.lastPlay)) return null;}
          return cards;
        }
        return cardIds;
      });
    },
    onState:function(){}
  };
}
function hostCreateRoom(cb){
  loadPeerJS(function(err){
    if(err){cb(err);return;}
    var net=makeHostNet();
    var peer=new window.Peer(undefined,{debug:0});
    net.peer=peer;
    peer.on('open',function(id){net.hostPeerId=id;cb(null,net);});
    peer.on('error',function(e){
      console.error('host peer error',e);
      toast('\u8054\u673A\u9519\u8BEF\uFF1A'+((e&&e.type)||'unknown'));
    });
    peer.on('connection',function(conn){
      var clientName='\u73A9\u5BB6';
      var seat=-1;
      conn.on('open',function(){
        seat=net.findFreeSeat();
        if(seat<0){try{conn.send({type:'rejected',reason:'full'});conn.close();}catch(e){}return;}
        net.conns[conn.peer]={conn:conn,seat:seat,name:clientName,alive:true};
        try{conn.send({type:'welcome',seat:seat,roomCode:net.hostPeerId,hostName:App.myName});}catch(e){}
        net.broadcastLobby();
      });
      conn.on('data',function(data){
        if(!data||!data.type)return;
        switch(data.type){
          case'hello':
            clientName=(data.name||'\u73A9\u5BB6').substring(0,12);
            if(net.conns[conn.peer]) net.conns[conn.peer].name=clientName;
            net.broadcastLobby();
            break;
          case'submitBid':
            (function(){
              var s=net.seatOf(conn.peer);if(s<0)return;
              var pr=net.pendingRequests[s];if(!pr||pr.kind!=='bid')return;
              delete net.pendingRequests[s];pr.resolve(data.value|0);
            })();
            break;
          case'submitPlay':
            (function(){
              var s=net.seatOf(conn.peer);if(s<0)return;
              var pr=net.pendingRequests[s];if(!pr||pr.kind!=='play')return;
              delete net.pendingRequests[s];pr.resolve(data.cardIds||null);
            })();
            break;
        }
      });
      conn.on('close',function(){if(seat>=0)net.onClientDisconnect(conn.peer);});
      conn.on('error',function(){if(seat>=0)net.onClientDisconnect(conn.peer);});
    });
  });
}
function hostStartGame(net){
  App.gameMode='host';
  App.mySeat=0;
  App.cumulativeScores=[0,0,0];
  App.humanAdapter=new DDZ.HumanLocalAdapter();
  bindHumanAdapter(App.humanAdapter);
  var players=[null,null,null];
  players[0]=App.humanAdapter;
  for(var s=1;s<3;s++){
    var hasClient=false;
    var ids=Object.keys(net.conns);
    for(var i=0;i<ids.length;i++) if(net.conns[ids[i]].alive&&net.conns[ids[i]].seat===s){hasClient=true;break;}
    if(hasClient) players[s]=buildHostAdapter(net,s);
    else players[s]=new DDZ.AIAdapter({thinkMin:600,thinkMax:1100});
  }
  var info=net.buildLobbyInfo();
  var names=[];
  for(var i=0;i<3;i++) names.push(info.seats[i]||('AI '+String.fromCharCode(0x4E59+i-1)));
  App.engine=new DDZ.GameEngine({
    players:players,names:names,
    onEvent:onEngineEvent,onState:onEngineState,onSettle:onEngineSettle,
    cumulativeScores:App.cumulativeScores
  });
  net.engine=App.engine;
  App.net=net;
  var ids=Object.keys(net.conns);
  for(var i=0;i<ids.length;i++){
    if(net.conns[ids[i]].alive){
      try{net.conns[ids[i]].conn.send({type:'gameStart',names:names,mySeat:net.conns[ids[i]].seat});}catch(e){}
    }
  }
  showView('game');
  clearAllPlayed();clearSelection();clearActionBar();
  App.engine.startRound();
}
function nextRoundHost(){
  if(!App.engine||!App.net) return;
  clearAllPlayed();clearSelection();clearActionBar();
  App.humanAdapter=new DDZ.HumanLocalAdapter();
  bindHumanAdapter(App.humanAdapter);
  App.engine.players[App.mySeat]=App.humanAdapter;
  // notify guests
  var ids=Object.keys(App.net.conns);
  for(var i=0;i<ids.length;i++){
    if(App.net.conns[ids[i]].alive){
      try{App.net.conns[ids[i]].conn.send({type:'nextRound'});}catch(e){}
    }
  }
  App.engine.startRound();
}

/* ============================================================
  18. GUEST NET
  ============================================================ */
function makeGuestNet(){
  var net={
    role:'guest',peer:null,conn:null,seat:-1,roomCode:'',hostName:'',
    close:function(){
      try{this.conn&&this.conn.close();}catch(e){}
      try{this.peer&&this.peer.destroy();}catch(e){}
    },
    sendBid:function(v){try{this.conn.send({type:'submitBid',value:v});}catch(e){}},
    sendPlay:function(cardIds){try{this.conn.send({type:'submitPlay',cardIds:cardIds});}catch(e){}}
  };
  return net;
}
function guestJoinRoom(roomCode,myName,cb){
  loadPeerJS(function(err){
    if(err){cb(err);return;}
    var net=makeGuestNet();
    var peer=new window.Peer(undefined,{debug:0});
    net.peer=peer;
    peer.on('open',function(){
      var conn=peer.connect(roomCode,{reliable:true});
      net.conn=conn;
      conn.on('open',function(){try{conn.send({type:'hello',name:myName});}catch(e){}});
      conn.on('data',function(data){if(data&&data.type) handleHostMessage(net,data);});
      conn.on('close',function(){
        toast('\u4E0E\u623F\u4E3B\u65AD\u5F00\u8FDE\u63A5');
        setTimeout(function(){exitToMenu();},1500);
      });
      conn.on('error',function(){cb(new Error('connect failed'));});
    });
    peer.on('error',function(e){
      var et=e&&e.type;
      if(et==='peer-unavailable'){toast('\u623F\u95F4\u4E0D\u5B58\u5728');cb(new Error('peer-unavailable'));return;}
      toast('\u8054\u673A\u9519\u8BEF\uFF1A'+(et||'unknown'));
      cb(e);
    });
    cb(null,net);
  });
}
function handleHostMessage(net,data){
  switch(data.type){
    case'welcome':
      net.seat=data.seat;net.roomCode=data.roomCode;net.hostName=data.hostName;
      App.mySeat=data.seat;
      if(App.onLobby) App.onLobby({roomCode:data.roomCode,seat:data.seat});
      break;
    case'rejected':
      toast('\u52A0\u5165\u88AB\u62D2\uFF1A\u623F\u95F4\u5DF2\u6EE1');
      setTimeout(function(){exitToMenu();},1500);
      break;
    case'lobby':
      if(App.onLobbyUpdate) App.onLobbyUpdate(data.info);
      break;
    case'gameStart':
      App.gameMode='guest';
      App.mySeat=data.mySeat;
      showView('game');
      clearAllPlayed();clearSelection();clearActionBar();
      App.remoteState={
        phase:'bid',landlordIdx:-1,bidValue:0,
        hands:[[],[],[]],handLengths:[17,17,17],
        currentPlayer:0,playerNames:data.names,cumulativeScores:[0,0,0]
      };
      render();
      break;
    case'nextRound':
      clearAllPlayed();clearSelection();clearActionBar();
      var ov=document.getElementById('resultOverlay');
      if(ov){ov.style.display='none';ov.innerHTML='';}
      break;
    case'state':
      App.remoteState=data.state;
      render();
      break;
    case'event':
      handleNetEvent(data.ev);
      break;
    case'requestBid':
      showBidButtons(data.currentBidValue||0);
      break;
    case'requestPlay':
      showPlayButtons(!data.free);
      clearSelection();
      render();
      break;
    case'settle':
      setTimeout(function(){showResult(data.info);},800);
      break;
  }
}
function handleNetEvent(ev){
  switch(ev.type){
    case'bid':showBid(ev.seat,ev.value);if(ev.value>0)playSound('bid');break;
    case'bidFinal':
      var center=document.getElementById('bottomReveal');
      if(center&&ev.bottomCards){
        var html='';
        for(var i=0;i<ev.bottomCards.length;i++) html+=cardHTML(ev.bottomCards[i],false);
        center.innerHTML=html;center.style.display='flex';
        setTimeout(function(){center.style.display='none';center.innerHTML='';clearAllPlayed();},2200);
      }
      break;
    case'play':
      clearAllPlayed();
      showPlayed(ev.seat,ev.cards,!!ev.isBomb);
      if(ev.isBomb){
        if(ev.pattern&&ev.pattern.type==='rocket') playSound('rocket');
        else playSound('bomb');
      } else playSound('play');
      break;
    case'pass':showPass(ev.seat);playSound('pass');break;
  }
}

/* ============================================================
  19. LOBBY UI
  ============================================================ */
function showLobbyHost(net){
  var lobby=document.getElementById('viewLobby');
  if(!lobby)return;
  var info=net.buildLobbyInfo();
  var displayCode=net.hostPeerId;
  var html='<div class="lobby-panel">';
  html+='<div class="lobby-title">\u521B\u5EFA\u623F\u95F4</div>';
  html+='<div class="lobby-roomcode"><div class="rc-label">\u623F\u95F4\u53F7</div><div class="rc-val" id="rcVal">'+displayCode+'</div></div>';
  html+='<div class="rc-hint">\u70B9\u51FB\u53F7\u590D\u5236 \u00B7 \u53D1\u7ED9\u670B\u53CB\u52A0\u5165</div>';
  html+='<div class="seat-list">';
  for(var s=0;s<3;s++){
    var n=info.seats[s];
    html+='<div class="seat-row"><span class="seat-num">'+(s+1)+'\u53F7\u4F4D</span>';
    if(n) html+='<span class="seat-name">'+n+(s===0?' (\u4F60)':'')+'</span><span class="seat-stat ready">\u5DF2\u5165\u5EA7</span>';
    else html+='<span class="seat-name">--</span><span class="seat-stat empty">\u7B49\u5F85\u52A0\u5165</span>';
    html+='</div>';
  }
  html+='</div>';
  html+='<div class="lobby-actions">';
  html+='<button class="abtn" id="btnLobbyBack">\u8FD4\u56DE</button>';
  html+='<button class="abtn primary" id="btnHostStart">\u5F00\u59CB\u6E38\u620F</button>';
  html+='</div>';
  html+='<div class="rc-hint">\u7A7A\u4F4D\u4F1A\u7531 AI \u8865\u4F4D</div>';
  html+='</div>';
  lobby.innerHTML=html;
  document.getElementById('btnLobbyBack').addEventListener('click',exitToMenu);
  document.getElementById('btnHostStart').addEventListener('click',function(){hostStartGame(net);});
  var rc=document.getElementById('rcVal');
  if(rc) rc.addEventListener('click',function(){
    var txt=rc.textContent;
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt);
        toast('\u5DF2\u590D\u5236\u623F\u95F4\u53F7');
      } else {
        // fallback
        var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);
        ta.select();try{document.execCommand('copy');toast('\u5DF2\u590D\u5236');}catch(e){toast('\u8BF7\u624B\u52A8\u590D\u5236');}
        document.body.removeChild(ta);
      }
    }catch(e){toast('\u8BF7\u624B\u52A8\u590D\u5236');}
  });
}
function showLobbyJoin(){
  var lobby=document.getElementById('viewLobby');
  if(!lobby)return;
  var html='<div class="lobby-panel">';
  html+='<div class="lobby-title">\u52A0\u5165\u623F\u95F4</div>';
  html+='<div class="lobby-input"><label>\u4F60\u7684\u6635\u79F0</label><input type="text" id="joinName" maxlength="12" value="'+(App.myName||'')+'"></div>';
  html+='<div class="lobby-input"><label>\u623F\u95F4\u53F7</label><input type="text" id="joinCode" placeholder="\u7C98\u8D34\u623F\u4E3B\u7684\u53F7"></div>';
  html+='<div class="lobby-actions">';
  html+='<button class="abtn" id="btnLobbyBack">\u8FD4\u56DE</button>';
  html+='<button class="abtn primary" id="btnDoJoin">\u52A0\u5165</button>';
  html+='</div>';
  html+='<div id="joinStatus" class="join-status"></div>';
  html+='</div>';
  lobby.innerHTML=html;
  document.getElementById('btnLobbyBack').addEventListener('click',exitToMenu);
  document.getElementById('btnDoJoin').addEventListener('click',function(){
    var name=(document.getElementById('joinName').value||'').trim().substring(0,12);
    var code=(document.getElementById('joinCode').value||'').trim();
    if(!name){toast('\u8BF7\u8F93\u5165\u6635\u79F0');return;}
    if(!code){toast('\u8BF7\u8F93\u5165\u623F\u95F4\u53F7');return;}
    App.myName=name;
    try{localStorage.setItem(NAME_KEY,name);}catch(e){}
    var ss=document.getElementById('joinStatus');
    if(ss) ss.textContent='\u8FDE\u63A5\u4E2D\u2026';
    App.onLobby=function(info){
      if(ss) ss.textContent='\u5DF2\u52A0\u5165 \u00B7 '+(info.seat+1)+'\u53F7\u4F4D';
    };
    App.onLobbyUpdate=function(info){
      var sl=document.getElementById('joinSeats');
      if(!sl){
        sl=document.createElement('div');sl.className='seat-list';sl.id='joinSeats';
        document.querySelector('#viewLobby .lobby-panel').appendChild(sl);
      }
      var h='';
      for(var s=0;s<3;s++){
        var n=info.seats[s];
        h+='<div class="seat-row"><span class="seat-num">'+(s+1)+'\u53F7\u4F4D</span>';
        if(n) h+='<span class="seat-name">'+n+'</span><span class="seat-stat ready">\u5DF2\u5165\u5EA7</span>';
        else h+='<span class="seat-name">--</span><span class="seat-stat empty">\u7A7A</span>';
        h+='</div>';
      }
      h+='<div class="rc-hint">\u7B49\u5F85\u623F\u4E3B\u5F00\u59CB\u2026</div>';
      sl.innerHTML=h;
    };
    guestJoinRoom(code,name,function(err,net){
      if(err){if(ss)ss.textContent='\u8FDE\u63A5\u5931\u8D25\uFF1A'+(err.message||'');return;}
      App.net=net;App.gameMode='guest';
    });
  });
}

/* ============================================================
  20. MENU WIRING
  ============================================================ */
function wireMenu(){
  var bs=document.getElementById('btnSinglePlayer');
  if(bs) bs.addEventListener('click',function(){promptName(function(){ensureAudio();startSingle();});});
  var bc=document.getElementById('btnCreateRoom');
  if(bc) bc.addEventListener('click',function(){
    promptName(function(){
      ensureAudio();
      showView('lobby');
      var lobby=document.getElementById('viewLobby');
      if(lobby) lobby.innerHTML='<div class="lobby-panel"><div class="lobby-title">\u521B\u5EFA\u623F\u95F4</div><div class="rc-hint">\u8FDE\u63A5\u4E2D\u2026</div></div>';
      hostCreateRoom(function(err,net){
        if(err){toast('\u521B\u5EFA\u5931\u8D25');exitToMenu();return;}
        showLobbyHost(net);
        net.onLobby=function(){showLobbyHost(net);};
        net.onClientDrop=function(seat){toast((seat+1)+'\u53F7\u4F4D\u73A9\u5BB6\u65AD\u7EBF\uFF0C\u5DF2\u7531 AI \u63A5\u7BA1');};
      });
    });
  });
  var bj=document.getElementById('btnJoinRoom');
  if(bj) bj.addEventListener('click',function(){ensureAudio();showView('lobby');showLobbyJoin();});
  var br=document.getElementById('btnRules');
  if(br) br.addEventListener('click',function(){
    var m=document.getElementById('rulesModal');
    if(m) m.style.display='flex';
  });
  var bst=document.getElementById('btnStats');
  if(bst) bst.addEventListener('click',function(){showStats();});
  var brc=document.getElementById('btnRulesClose');
  if(brc) brc.addEventListener('click',function(){
    var m=document.getElementById('rulesModal');
    if(m) m.style.display='none';
  });
}
function promptName(cb){
  if(App.myName&&App.myName!=='\u73A9\u5BB6'){cb();return;}
  var nm=prompt('\u8BF7\u8F93\u5165\u6635\u79F0\uFF08\u6700\u591A12\u5B57\uFF09',App.myName||'\u73A9\u5BB6');
  if(nm){
    App.myName=nm.substring(0,12);
    try{localStorage.setItem(NAME_KEY,App.myName);}catch(e){}
  }
  cb();
}

/* ============================================================
  21. GAME VIEW WIRING
  ============================================================ */
function wireGameView(){
  var hb=document.getElementById('hand_bottom');
  if(hb){
    hb.addEventListener('click',function(e){
      var t=e.target;
      while(t&&t!==hb){
        if(t.classList&&t.classList.contains('card')){
          var cid=parseInt(t.getAttribute('data-cid'),10);
          if(!isNaN(cid)) toggleSelect(cid);
          break;
        }
        t=t.parentNode;
      }
    });
  }
  var ex=document.getElementById('btnGameExit');
  if(ex) ex.addEventListener('click',function(){
    if(confirm('\u786E\u8BA4\u9000\u51FA\u672C\u5C40\uFF1F')) exitToMenu();
  });
  var cheat=document.getElementById('btnCheat');
  if(cheat) cheat.addEventListener('click',function(){
    App.cheat=!App.cheat;
    cheat.classList.toggle('on',App.cheat);
    render();
  });
}

/* ============================================================
  22. INIT
  ============================================================ */
function init(){
  loadStats();
  try{var sn=localStorage.getItem(NAME_KEY);if(sn) App.myName=sn;}catch(e){}
  var gh=document.getElementById('app');
  if(gh) gh.style.height=window.innerHeight+'px';
  window.addEventListener('resize',function(){if(gh) gh.style.height=window.innerHeight+'px';});
  document.addEventListener('touchstart',ensureAudio,{passive:true,once:true});
  document.addEventListener('click',ensureAudio,{once:true});
  wireMenu();
  wireGameView();
  showView('menu');
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
} else init();

/* ============================================================
  23. EXPORTS for console debugging
  ============================================================ */
global.DDZ_UI={App:App,startSingle:startSingle,exitToMenu:exitToMenu};

})(typeof window!=='undefined'?window:this);
