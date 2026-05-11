/* ============================================================
   DOUDIZHU CORE - game-core.js
   Engine, card patterns, AI (L1+L2 inherited from prior version,
   L3 endgame solver added), PlayerAdapter contract.
   iOS-safe: var only, no arrow funcs, no .includes(), IIFE,
   unicode escapes for Chinese strings.
   ============================================================ */
(function(global){
'use strict';

/* ============================================================
   1. CONSTANTS (1:1 from prior version)
   ============================================================ */
var RANKS=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
var RV={};for(var i=0;i<RANKS.length;i++)RV[RANKS[i]]=i+3;RV['SJ']=16;RV['BJ']=17;
var SUITS=['\u2660','\u2665','\u2666','\u2663'];
var SC={'\u2660':'black','\u2665':'red','\u2666':'red','\u2663':'black'};

/* ============================================================
   2. DECK / SHUFFLE / SORT (id added for net serialization)
   ============================================================ */
function createDeck(){
  var d=[],id=0;
  for(var r=0;r<RANKS.length;r++){
    for(var s=0;s<SUITS.length;s++){
      d.push({id:id++,rank:RANKS[r],suit:SUITS[s],value:RV[RANKS[r]]});
    }
  }
  d.push({id:52,rank:'\u5C0F\u738B',suit:'',value:16,isJoker:'small'});
  d.push({id:53,rank:'\u5927\u738B',suit:'',value:17,isJoker:'big'});
  return d;
}
function shuffle(a){
  for(var i=a.length-1;i>0;i--){
    var j=0|Math.random()*(i+1);
    var t=a[i];a[i]=a[j];a[j]=t;
  }
}
function sortHand(h){
  h.sort(function(a,b){return b.value-a.value||(SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit));});
}
var ALL_CARDS_BY_ID=null;
function cardById(id){
  if(!ALL_CARDS_BY_ID){
    ALL_CARDS_BY_ID={};
    var d=createDeck();
    for(var i=0;i<d.length;i++) ALL_CARDS_BY_ID[d[i].id]=d[i];
  }
  return ALL_CARDS_BY_ID[id];
}
function cardsToIds(cards){var r=[];for(var i=0;i<cards.length;i++)r.push(cards[i].id);return r;}
function idsToCards(ids){var r=[];for(var i=0;i<ids.length;i++)r.push(cardById(ids[i]));return r;}

/* ============================================================
   3. PATTERN ANALYSIS (1:1 from prior version)
   ============================================================ */
function getCM(h){
  var c={};for(var i=0;i<h.length;i++){var v=h[i].value;if(!c[v])c[v]=[];c[v].push(h[i]);}return c;
}
function analyzeCards(cards){
  if(!cards||!cards.length)return null;
  var n=cards.length;
  var vs=cards.map(function(c){return c.value}).sort(function(a,b){return a-b});
  var ct={};for(var i=0;i<vs.length;i++)ct[vs[i]]=(ct[vs[i]]||0)+1;
  var ks=Object.keys(ct).map(Number).sort(function(a,b){return a-b});
  if(n===2&&vs[0]===16&&vs[1]===17)return{type:'rocket',rank:17,len:2};
  if(n===4&&ks.length===1)return{type:'bomb',rank:ks[0],len:4};
  if(n===1)return{type:'single',rank:vs[0],len:1};
  if(n===2&&ks.length===1&&ct[ks[0]]===2)return{type:'pair',rank:ks[0],len:2};
  if(n===3&&ks.length===1)return{type:'triple',rank:ks[0],len:3};
  if(n===4&&ks.length===2){
    for(var k=0;k<ks.length;k++)if(ct[ks[k]]===3)return{type:'triple1',rank:ks[k],len:4};
  }
  if(n===5&&ks.length===2){
    for(var k=0;k<ks.length;k++)if(ct[ks[k]]===3&&ct[ks[1-k]]===2)return{type:'triple2',rank:ks[k],len:5};
  }
  if(n>=5&&ks.length===n){
    var ok=true;
    for(var i=1;i<ks.length;i++)if(ks[i]-ks[i-1]!==1){ok=false;break;}
    if(ok&&ks[ks.length-1]<=14)return{type:'straight',rank:ks[ks.length-1],len:n};
  }
  if(n>=6&&n%2===0){
    var ap=true;
    for(var k=0;k<ks.length;k++)if(ct[ks[k]]!==2){ap=false;break;}
    if(ap&&ks.length>=3){
      var c2=true;
      for(var i=1;i<ks.length;i++)if(ks[i]-ks[i-1]!==1){c2=false;break;}
      if(c2&&ks[ks.length-1]<=14)return{type:'pairstraight',rank:ks[ks.length-1],len:n};
    }
  }
  if(n>=6&&n%3===0){
    var at=true;
    for(var k=0;k<ks.length;k++)if(ct[ks[k]]!==3){at=false;break;}
    if(at&&ks.length>=2){
      var c3=true;
      for(var i=1;i<ks.length;i++)if(ks[i]-ks[i-1]!==1){c3=false;break;}
      if(c3&&ks[ks.length-1]<=14)return{type:'plane',rank:ks[ks.length-1],len:n,planeLen:ks.length};
    }
  }
  var trips=[];
  for(var k=0;k<ks.length;k++)if(ct[ks[k]]>=3)trips.push(ks[k]);
  trips.sort(function(a,b){return a-b});
  for(var tl=trips.length;tl>=2;tl--){
    for(var st=0;st<=trips.length-tl;st++){
      var sub=trips.slice(st,st+tl);
      var cc=true;
      for(var i=1;i<sub.length;i++)if(sub[i]-sub[i-1]!==1){cc=false;break;}
      if(!cc||sub[sub.length-1]>14)continue;
      var used=tl*3,rem=n-used;
      if(rem===tl)return{type:'plane1',rank:sub[sub.length-1],len:n,planeLen:tl};
      if(rem===tl*2){
        var tc=JSON.parse(JSON.stringify(ct));
        for(var i=0;i<sub.length;i++)tc[sub[i]]-=3;
        var a2=true;var rk=Object.keys(tc).map(Number);
        for(var i=0;i<rk.length;i++)if(tc[rk[i]]>0&&tc[rk[i]]!==2){a2=false;break;}
        if(a2)return{type:'plane2',rank:sub[sub.length-1],len:n,planeLen:tl};
      }
    }
  }
  if(n===6){
    for(var k=0;k<ks.length;k++)if(ct[ks[k]]===4)return{type:'four2',rank:ks[k],len:6};
  }
  if(n===8){
    for(var k=0;k<ks.length;k++){
      if(ct[ks[k]]===4){
        var tc2=JSON.parse(JSON.stringify(ct));tc2[ks[k]]-=4;
        var rk2=Object.keys(tc2).map(Number);var o2=true;
        for(var i=0;i<rk2.length;i++)if(tc2[rk2[i]]>0&&tc2[rk2[i]]!==2){o2=false;break;}
        if(o2)return{type:'four22',rank:ks[k],len:8};
      }
    }
  }
  return null;
}
function canBeat(p,l){
  if(!l)return true;
  if(p.type==='rocket')return true;
  if(p.type==='bomb'){
    if(l.type==='rocket')return false;
    if(l.type==='bomb')return p.rank>l.rank;
    return true;
  }
  if(l.type==='rocket'||l.type==='bomb')return false;
  if(p.type!==l.type||p.len!==l.len)return false;
  return p.rank>l.rank;
}
function findValid(h,last){
  var r=[];
  if(!last){
    r=r.concat(fSing(h,null),fPair(h,null),fTrip(h,null),fTrip1(h,null),fTrip2(h,null),
               fStr(h,null),fPStr(h,null),fPlane(h,null),fBomb(h,null),fRocket(h));
  } else {
    switch(last.type){
      case'single':r=fSing(h,last);break;
      case'pair':r=fPair(h,last);break;
      case'triple':r=fTrip(h,last);break;
      case'triple1':r=fTrip1(h,last);break;
      case'triple2':r=fTrip2(h,last);break;
      case'straight':r=fStr(h,last);break;
      case'pairstraight':r=fPStr(h,last);break;
      case'plane':case'plane1':case'plane2':r=fPlaneB(h,last);break;
      case'four2':case'four22':r=fFour2B(h,last);break;
      case'bomb':r=fBombB(h,last);break;
      case'rocket':return[];
    }
    if(last.type!=='bomb'&&last.type!=='rocket')r=r.concat(fBomb(h,null));
    r=r.concat(fRocket(h));
  }
  return r;
}
function fSing(h,l){
  var r=[],s={},mn=l?l.rank:0;
  for(var i=0;i<h.length;i++){var v=h[i].value;if(v>mn&&!s[v]){s[v]=true;r.push([h[i]])}}
  return r;
}
function fPair(h,l){
  var r=[],cm=getCM(h),mn=l?l.rank:0;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++)if(vs[i]>mn&&cm[vs[i]].length>=2)r.push(cm[vs[i]].slice(0,2));
  return r;
}
function fTrip(h,l){
  var r=[],cm=getCM(h),mn=l?l.rank:0;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++)if(vs[i]>mn&&cm[vs[i]].length>=3)r.push(cm[vs[i]].slice(0,3));
  return r;
}
function fTrip1(h,l){
  var r=[],cm=getCM(h),mn=l?l.rank:0;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++){
    if(vs[i]>mn&&cm[vs[i]].length>=3){
      var t=cm[vs[i]].slice(0,3);
      for(var j=0;j<vs.length;j++)if(vs[j]!==vs[i]){r.push(t.concat([cm[vs[j]][0]]));break;}
    }
  }
  return r;
}
function fTrip2(h,l){
  var r=[],cm=getCM(h),mn=l?l.rank:0;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++){
    if(vs[i]>mn&&cm[vs[i]].length>=3){
      var t=cm[vs[i]].slice(0,3);
      for(var j=0;j<vs.length;j++)if(vs[j]!==vs[i]&&cm[vs[j]].length>=2){r.push(t.concat(cm[vs[j]].slice(0,2)));break;}
    }
  }
  return r;
}
function fStr(h,l){
  var r=[],cm=getCM(h);
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b}).filter(function(v){return v<=14});
  var tL=l?l.len:5,mn=l?l.rank:0;
  if(l){
    for(var s=0;s<=vs.length-tL;s++){
      var ok=true;
      for(var k=1;k<tL;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
      if(ok&&vs[s+tL-1]>mn){
        var c=[];for(var k=0;k<tL;k++)c.push(cm[vs[s+k]][0]);r.push(c);
      }
    }
  } else {
    for(var ln=5;ln<=12;ln++){
      for(var s=0;s<=vs.length-ln;s++){
        var ok=true;
        for(var k=1;k<ln;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
        if(ok){var c=[];for(var k=0;k<ln;k++)c.push(cm[vs[s+k]][0]);r.push(c);}
      }
    }
  }
  return r;
}
function fPStr(h,l){
  var r=[],cm=getCM(h);
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b}).filter(function(v){return v<=14&&cm[v].length>=2});
  var tP=l?l.len/2:3,mn=l?l.rank:0;
  if(l){
    for(var s=0;s<=vs.length-tP;s++){
      var ok=true;
      for(var k=1;k<tP;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
      if(ok&&vs[s+tP-1]>mn){
        var c=[];for(var k=0;k<tP;k++){c.push(cm[vs[s+k]][0]);c.push(cm[vs[s+k]][1]);}r.push(c);
      }
    }
  } else {
    for(var ln=3;ln<=10;ln++){
      for(var s=0;s<=vs.length-ln;s++){
        var ok=true;
        for(var k=1;k<ln;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
        if(ok){var c=[];for(var k=0;k<ln;k++){c.push(cm[vs[s+k]][0]);c.push(cm[vs[s+k]][1]);}r.push(c);}
      }
    }
  }
  return r;
}
function fPlane(h,l){
  var r=[],cm=getCM(h);
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b}).filter(function(v){return v<=14&&cm[v].length>=3});
  for(var ln=2;ln<=vs.length;ln++){
    for(var s=0;s<=vs.length-ln;s++){
      var ok=true;
      for(var k=1;k<ln;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
      if(ok){
        var c=[];for(var k=0;k<ln;k++){c.push(cm[vs[s+k]][0]);c.push(cm[vs[s+k]][1]);c.push(cm[vs[s+k]][2]);}
        r.push(c);
      }
    }
  }
  return r;
}
function fPlaneB(h,l){
  var r=[],cm=getCM(h),pL=l.planeLen||2;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b}).filter(function(v){return v<=14&&cm[v].length>=3});
  for(var s=0;s<=vs.length-pL;s++){
    var ok=true;
    for(var k=1;k<pL;k++)if(vs[s+k]-vs[s]!==k){ok=false;break;}
    if(!ok||vs[s+pL-1]<=l.rank)continue;
    var c=[];
    for(var k=0;k<pL;k++){c.push(cm[vs[s+k]][0]);c.push(cm[vs[s+k]][1]);c.push(cm[vs[s+k]][2]);}
    if(l.type==='plane1'){
      var ad=0,av=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
      for(var j=0;j<av.length&&ad<pL;j++){
        var ip=false;
        for(var k=0;k<pL;k++)if(vs[s+k]===av[j]){ip=true;break;}
        if(!ip){c.push(cm[av[j]][0]);ad++;}
      }
      if(ad===pL)r.push(c);
    } else if(l.type==='plane2'){
      var ad=0,av=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
      for(var j=0;j<av.length&&ad<pL;j++){
        var ip=false;
        for(var k=0;k<pL;k++)if(vs[s+k]===av[j]){ip=true;break;}
        if(!ip&&cm[av[j]].length>=2){c.push(cm[av[j]][0]);c.push(cm[av[j]][1]);ad++;}
      }
      if(ad===pL)r.push(c);
    } else {
      r.push(c);
    }
  }
  return r;
}
function fFour2B(h,l){
  var r=[],cm=getCM(h);
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++){
    if(cm[vs[i]].length===4&&vs[i]>l.rank){
      var c=cm[vs[i]].slice(0,4);
      if(l.type==='four2'){
        var ad=0;
        for(var j=0;j<vs.length&&ad<2;j++)if(vs[j]!==vs[i]){c.push(cm[vs[j]][0]);ad++;}
        if(ad===2)r.push(c);
      } else {
        var ad=0;
        for(var j=0;j<vs.length&&ad<2;j++)if(vs[j]!==vs[i]&&cm[vs[j]].length>=2){c.push(cm[vs[j]][0]);c.push(cm[vs[j]][1]);ad++;}
        if(ad===2)r.push(c);
      }
    }
  }
  return r;
}
function fBomb(h,l){
  var r=[],cm=getCM(h),mn=l?l.rank:0;
  var vs=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  for(var i=0;i<vs.length;i++)if(cm[vs[i]].length===4&&vs[i]>mn)r.push(cm[vs[i]].slice(0,4));
  return r;
}
function fBombB(h,l){return fBomb(h,l);}
function fRocket(h){
  var s=null,b=null;
  for(var i=0;i<h.length;i++){if(h[i].value===16)s=h[i];if(h[i].value===17)b=h[i];}
  return(s&&b)?[[s,b]]:[];
}

/* ============================================================
   4. HAND-COUNT METRIC (1:1 from prior version)
   ============================================================ */
function countHands(hand){
  var cm=getCM(hand);
  var vals=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  var hands=0;
  var singles=0,pairs=0,triples=0,bombs=0,rocket=false;
  var sj=false,bj=false;
  for(var i=0;i<vals.length;i++){
    var cnt=cm[vals[i]].length;
    if(vals[i]===16){sj=true;continue;}
    if(vals[i]===17){bj=true;continue;}
    if(cnt===1) singles++;
    else if(cnt===2) pairs++;
    else if(cnt===3) triples++;
    else if(cnt===4) bombs++;
  }
  if(sj&&bj) rocket=true;
  else{if(sj)singles++;if(bj)singles++;}
  var tripleHands=triples;
  var freeSingles=singles;
  var freePairs=pairs;
  var carry=Math.min(tripleHands,freeSingles+freePairs);
  hands+=tripleHands;
  freeSingles=Math.max(0,freeSingles-(carry>freePairs?carry-freePairs:0));
  freePairs=Math.max(0,freePairs-Math.min(carry,freePairs));
  hands+=freeSingles+freePairs+bombs+(rocket?1:0);
  return hands;
}

/* ============================================================
   5. PLAYED-RECORD MEMORY (1:1 from prior version, behavior preserved)
   ============================================================ */
function getPlayedCount(playedRecord,value){
  var c=0;for(var i=0;i<playedRecord.length;i++)if(playedRecord[i]===value)c++;return c;
}
function isCardMaster(playedRecord,value){
  // PRESERVED behavior (user requested no fix)
  if(value>=16) return getPlayedCount(playedRecord,value>=17?0:17)>0||value===17;
  for(var v=value+1;v<=15;v++){
    var total=4,played=getPlayedCount(playedRecord,v);
    if(played<total) return false;
  }
  return true;
}

/* ============================================================
   6. AI BIDDING (1:1 from prior version, behavior preserved)
   ============================================================ */
function aiBidDec(hand,currentBidValue){
  var sc=0,ct={};
  for(var i=0;i<hand.length;i++){var v=hand[i].value;ct[v]=(ct[v]||0)+1;}
  var vs=Object.keys(ct).map(Number);
  var bc=0;
  for(var i=0;i<vs.length;i++)if(ct[vs[i]]===4)bc++;
  var sJ=false,bJ=false;
  for(var i=0;i<hand.length;i++){
    if(hand[i].value===16)sJ=true;
    if(hand[i].value===17)bJ=true;
    if(hand[i].value===15)sc+=3;
    if(hand[i].value===14)sc+=2;
  }
  if(sJ&&bJ)sc+=8;
  else if(bJ)sc+=4;
  else if(sJ)sc+=2;
  sc+=bc*6;
  var th=currentBidValue===0?6:currentBidValue===1?8:10;
  if(sc>=th){
    var bid=currentBidValue+1;
    if(sc>=14)bid=3;
    else if(sc>=10)bid=Math.max(bid,2);
    return Math.min(bid,3);
  }
  return 0;
}

/* ============================================================
   7. AI L1+L2 STRATEGY (1:1 from prior version aiChoose)
   Refactored to take a context object instead of reading global G.
   ============================================================ */
function aiChooseL12(ctx){
  var hand=ctx.hand,cs=ctx.candidates,free=ctx.free;
  var pi=ctx.myIdx,landlordIdx=ctx.landlordIdx,isD=(pi===landlordIdx);
  var hLen=hand.length;
  var myHands=countHands(hand);
  var cm=getCM(hand);
  var nextPlayer=(pi+1)%3,prevPlayer=(pi+2)%3;
  var nextIsD=(nextPlayer===landlordIdx);
  var dizhuLen=ctx.handLengths[landlordIdx];
  var nextLen=ctx.handLengths[nextPlayer];
  var lastPlay=ctx.lastPlay,lastPlayPlayer=ctx.lastPlayPlayer;
  var playedRecord=ctx.playedRecord;
  var bombVals={};
  var vals=Object.keys(cm).map(Number);
  for(var vi=0;vi<vals.length;vi++){if(cm[vals[vi]].length===4)bombVals[vals[vi]]=true;}
  var enemyAboutToWin=false;
  if(isD){
    for(var f=0;f<3;f++)if(f!==landlordIdx&&ctx.handLengths[f]<=2)enemyAboutToWin=true;
  } else {
    if(dizhuLen<=2)enemyAboutToWin=true;
  }

  var filtered=[];
  for(var i=0;i<cs.length;i++){
    var p=analyzeCards(cs[i]);if(!p)continue;
    if(p.type==='rocket'||p.type==='bomb'){
      var tempH=hand.filter(function(c){return cs[i].indexOf(c)<0});
      var hAfter=countHands(tempH);
      if(free&&hAfter>2) continue;
      if(!free&&!enemyAboutToWin&&hAfter>2) continue;
    }
    if(free&&myHands>2&&p.type==='single'&&p.rank>=15) continue;
    if(free&&myHands>2&&p.type==='pair'&&p.rank>=15) continue;
    if(p.type!=='bomb'&&myHands>2&&cs[i].length!==hLen){
      var splits=false;
      for(var ci=0;ci<cs[i].length;ci++){
        if(bombVals[cs[i][ci].value]){splits=true;break;}
      }
      if(splits) continue;
    }
    if(myHands>3&&(p.type==='triple'||p.type==='triple1'||p.type==='triple2')&&p.rank>=15) continue;
    filtered.push(cs[i]);
  }
  if(!filtered.length){
    for(var i=0;i<cs.length;i++){
      var p=analyzeCards(cs[i]);if(!p)continue;
      if(p.type==='rocket'&&myHands>2) continue;
      filtered.push(cs[i]);
    }
  }
  if(!filtered.length) filtered=cs;
  cs=filtered;

  var scored=[];
  for(var i=0;i<cs.length;i++){
    var play=analyzeCards(cs[i]);if(!play)continue;
    var sc=0;
    var isBomb=(play.type==='bomb'||play.type==='rocket');
    var tempHand=hand.filter(function(c){return cs[i].indexOf(c)<0});
    var handsAfter=countHands(tempHand);
    var handReduction=myHands-handsAfter;
    if(free){
      if(isBomb){
        if(myHands<=2) sc=80; else if(enemyAboutToWin) sc=60; else sc=-200;
      } else {
        sc+=handReduction*30;
        if(isCardMaster(playedRecord,play.rank)) sc+=15;
        sc+=cs[i].length*2;
        if(!isD&&nextIsD&&play.type==='single'&&isCardMaster(playedRecord,play.rank)) sc+=20;
        if(!isD&&!nextIsD&&nextLen<=3&&play.type==='single'&&play.rank<=6) sc+=15;
        if(play.type==='single'){
          var pen=Math.pow(1.8,Math.max(0,play.rank-8));
          if(myHands>4) sc-=pen*4; else if(myHands>2) sc-=pen*2;
        }
        if(play.type==='pair'&&play.rank>=13&&myHands>3) sc-=25;
        if(cs[i].length===hLen) sc+=500;
      }
    } else {
      if(isBomb){
        if(enemyAboutToWin) sc=80; else if(myHands<=2) sc=60; else sc=-100;
        if(!isD&&lastPlayPlayer!==landlordIdx) sc=-300;
      } else {
        sc=10+handReduction*25;
        if(play.rank>=15&&lastPlay&&lastPlay.rank<=10&&myHands>3) sc-=60;
        var wp=Math.pow(1.4,Math.max(0,play.rank-8));
        if(myHands>3) sc-=wp*2;
        if(!isD&&lastPlayPlayer!==landlordIdx){
          sc-=40;
          if(cs[i].length===hLen) sc+=500;
          if(myHands<=2&&tempHand.length<=3) sc+=30;
        }
        if(!isD&&lastPlayPlayer===landlordIdx){
          sc+=15;if(dizhuLen<=4) sc+=25;
          if(isCardMaster(playedRecord,play.rank)) sc+=10;
        }
        if(isD&&enemyAboutToWin) sc+=25;
        if(cs[i].length===hLen) sc+=500;
      }
    }
    scored.push({cards:cs[i],score:sc,play:play});
  }
  scored.sort(function(a,b){return b.score-a.score});
  if(!free&&scored.length>0&&scored[0].score<-30) return null;
  return scored.length>0?scored[0].cards:cs[0];
}

/* ============================================================
   8. AI L3 ENDGAME SOLVER
   Trigger: anyone has hand <= 7 cards.
   Game tree search with alpha-beta and transposition table.
   Terminal eval: from the perspective of the LANDLORD side.
     +1 = landlord wins, -1 = farmers win, 0 = unresolved at depth limit.
   The current player picks the move maximizing their side's outcome.
   Returns: best play (cards array) or null to fall back to L1+L2.
   ============================================================ */
var L3_TIME_BUDGET_MS=600;
var L3_MAX_NODES=80000;
function l3Encode(hands,lastPlay,lastPlayPlayer,turn){
  // Hand encoding: sorted list of values as string
  var s='';
  for(var i=0;i<3;i++){
    var vs=[];for(var j=0;j<hands[i].length;j++)vs.push(hands[i][j].value);
    vs.sort(function(a,b){return a-b});s+=vs.join(',');s+='|';
  }
  if(lastPlay){
    s+=lastPlay.type+lastPlay.rank+'_'+lastPlay.len+'_'+(lastPlay.planeLen||0);
  } else s+='F';
  s+='|'+lastPlayPlayer+'|'+turn;
  return s;
}
function l3Solve(rootCtx){
  var t0=Date.now(),nodeCount={n:0};
  var landlordIdx=rootCtx.landlordIdx;
  var rootTurn=rootCtx.myIdx;
  var rootPasses=rootCtx.passCount||0;
  // hands[0..2] hold remaining cards (objects)
  var rootHands=[rootCtx.allHands[0].slice(),rootCtx.allHands[1].slice(),rootCtx.allHands[2].slice()];
  var memo={};

  // returns +1 if landlord side wins, -1 if farmers win
  function search(hands,lastPlay,lastPlayPlayer,turn,passes,depth){
    nodeCount.n++;
    if(nodeCount.n>L3_MAX_NODES) return 0;
    if((nodeCount.n&255)===0&&Date.now()-t0>L3_TIME_BUDGET_MS) return 0;
    if(hands[turn].length===0){
      return turn===landlordIdx?1:-1;
    }
    var key=l3Encode(hands,lastPlay,lastPlayPlayer,turn)+'|'+passes;
    if(memo[key]!==undefined) return memo[key];
    var meSide=(turn===landlordIdx)?1:-1;
    var free=(!lastPlay)||(lastPlayPlayer===turn)||(passes>=2);
    var moves=findValid(hands[turn],free?null:lastPlay);
    var seen={},uniqMoves=[];
    for(var i=0;i<moves.length;i++){
      var sig=moves[i].map(function(c){return c.value}).sort(function(a,b){return a-b}).join(',');
      if(!seen[sig]){seen[sig]=true;uniqMoves.push(moves[i]);}
    }
    // Order moves: shorter / lower rank first (typical good move ordering)
    uniqMoves.sort(function(a,b){
      var pa=analyzeCards(a),pb=analyzeCards(b);
      var aB=(pa.type==='rocket'||pa.type==='bomb')?1:0;
      var bB=(pb.type==='rocket'||pb.type==='bomb')?1:0;
      if(aB!==bB) return aB-bB;
      if(a.length!==b.length) return b.length-a.length;
      return pa.rank-pb.rank;
    });

    var best=-meSide; // worst for me
    var foundBetter=false;
    // Try playing
    for(var i=0;i<uniqMoves.length;i++){
      if(nodeCount.n>L3_MAX_NODES) break;
      if((nodeCount.n&255)===0&&Date.now()-t0>L3_TIME_BUDGET_MS) break;
      var mv=uniqMoves[i];
      var play=analyzeCards(mv);
      var newHand=[];
      for(var j=0;j<hands[turn].length;j++){
        var keep=true;
        for(var k=0;k<mv.length;k++)if(hands[turn][j].id===mv[k].id){keep=false;break;}
        if(keep) newHand.push(hands[turn][j]);
      }
      var nh=[hands[0],hands[1],hands[2]];nh[turn]=newHand;
      var v=search(nh,play,turn,(turn+1)%3,0,depth+1);
      if(meSide===1){
        if(v>best){best=v;foundBetter=true;}
        if(best>=1) break; // alpha-beta cut
      } else {
        if(v<best){best=v;foundBetter=true;}
        if(best<=-1) break;
      }
    }
    // Try passing (only if not free)
    if(!free){
      var newPasses=passes+1;
      var nLast=lastPlay,nLPP=lastPlayPlayer;
      if(newPasses>=2){nLast=null;nLPP=-1;newPasses=0;}
      var v=search(hands,nLast,nLPP,(turn+1)%3,newPasses,depth+1);
      if(meSide===1){
        if(v>best){best=v;foundBetter=true;}
      } else {
        if(v<best){best=v;foundBetter=true;}
      }
    }
    if(!foundBetter) best=-meSide; // no legal move (shouldn't happen)
    memo[key]=best;
    return best;
  }

  // Top level: pick the move whose result is best for current side
  var lastPlay=rootCtx.lastPlay,lastPlayPlayer=rootCtx.lastPlayPlayer;
  var free=rootCtx.free;
  var moves=findValid(rootHands[rootTurn],free?null:lastPlay);
  if(!moves.length) return null;
  var seen={},uniqMoves=[];
  for(var i=0;i<moves.length;i++){
    var sig=moves[i].map(function(c){return c.value}).sort(function(a,b){return a-b}).join(',');
    if(!seen[sig]){seen[sig]=true;uniqMoves.push(moves[i]);}
  }
  // Use L1+L2 ordering for better move ordering
  uniqMoves.sort(function(a,b){
    var pa=analyzeCards(a),pb=analyzeCards(b);
    var aB=(pa.type==='rocket'||pa.type==='bomb')?1:0;
    var bB=(pb.type==='rocket'||pb.type==='bomb')?1:0;
    if(aB!==bB) return aB-bB;
    if(a.length!==b.length) return b.length-a.length;
    return pa.rank-pb.rank;
  });
  var meSide=(rootTurn===landlordIdx)?1:-1;
  var bestVal=-meSide,bestMove=null;
  for(var i=0;i<uniqMoves.length;i++){
    if(Date.now()-t0>L3_TIME_BUDGET_MS) break;
    var mv=uniqMoves[i];
    var play=analyzeCards(mv);
    var newHand=[];
    for(var j=0;j<rootHands[rootTurn].length;j++){
      var keep=true;
      for(var k=0;k<mv.length;k++)if(rootHands[rootTurn][j].id===mv[k].id){keep=false;break;}
      if(keep) newHand.push(rootHands[rootTurn][j]);
    }
    var nh=[rootHands[0],rootHands[1],rootHands[2]];nh[rootTurn]=newHand;
    var v=search(nh,play,rootTurn,(rootTurn+1)%3,0,1);
    if(meSide===1){
      if(v>bestVal){bestVal=v;bestMove=mv;if(bestVal>=1)break;}
    } else {
      if(v<bestVal){bestVal=v;bestMove=mv;if(bestVal<=-1)break;}
    }
  }
  // Only commit to L3 result if we proved a forced win
  if(meSide===1&&bestVal>=1) return bestMove;
  if(meSide===-1&&bestVal<=-1) return bestMove;
  return null; // not a forced result; let L1+L2 decide
}

/* ============================================================
   9. AI ENTRY POINT - aiChoose dispatches L1+L2 / L3
   In multiplayer (where L3 cannot see other hands), only L1+L2
   is used. In single-player AI knows other hands implicitly via
   the engine that creates the context.
   ============================================================ */
function aiChoose(ctx){
  // Try L3 only if endgame condition met AND we have full info
  if(ctx.allHands){
    var totalRemain=ctx.allHands[0].length+ctx.allHands[1].length+ctx.allHands[2].length;
    var minH=Math.min(ctx.allHands[0].length,ctx.allHands[1].length,ctx.allHands[2].length);
    if(minH<=7&&totalRemain<=22){
      try{
        var l3=l3Solve(ctx);
        if(l3) return l3;
      } catch(e){}
    }
  }
  return aiChooseL12(ctx);
}

/* ============================================================
  10. HINT GENERATION (1:1 sort logic from prior version)
  ============================================================ */
function generateHints(hand,lastPlay,lastPlayPlayer,myIdx){
  var free=!lastPlay||lastPlayPlayer===myIdx;
  var cs=findValid(hand,free?null:lastPlay);
  if(!cs.length) return [];
  var seen={},uniq=[];
  for(var i=0;i<cs.length;i++){
    var sig=cs[i].map(function(c){return c.value}).sort(function(a,b){return a-b}).join(',');
    if(!seen[sig]){seen[sig]=true;uniq.push(cs[i]);}
  }
  var cm=getCM(hand),bombV={};
  var vs=Object.keys(cm).map(Number);
  for(var i=0;i<vs.length;i++)if(cm[vs[i]].length===4)bombV[vs[i]]=true;
  var myH=countHands(hand);
  uniq.sort(function(a,b){
    var pa=analyzeCards(a),pb=analyzeCards(b);
    var aSplit=false,bSplit=false;
    if(pa.type!=='bomb'){for(var i=0;i<a.length;i++)if(bombV[a[i].value]){aSplit=true;break;}}
    if(pb.type!=='bomb'){for(var i=0;i<b.length;i++)if(bombV[b[i].value]){bSplit=true;break;}}
    var aOkSplit=aSplit&&a.length>=7;
    var bOkSplit=bSplit&&b.length>=7;
    if(aSplit&&!aOkSplit&&!(bSplit&&!bOkSplit)) return 1;
    if(bSplit&&!bOkSplit&&!(aSplit&&!aOkSplit)) return -1;
    var aB=(pa.type==='rocket'||pa.type==='bomb')?1:0;
    var bB=(pb.type==='rocket'||pb.type==='bomb')?1:0;
    if(aB!==bB) return aB-bB;
    var aTemp=hand.filter(function(c){return a.indexOf(c)<0});
    var bTemp=hand.filter(function(c){return b.indexOf(c)<0});
    var aRed=myH-countHands(aTemp), bRed=myH-countHands(bTemp);
    if(aRed!==bRed) return bRed-aRed;
    if(a.length!==b.length) return b.length-a.length;
    return pa.rank-pb.rank;
  });
  return uniq;
}

/* ============================================================
  11. GAME ENGINE
  Authoritative state machine. In single-player and host mode,
  this runs locally. In guest mode, the guest never instantiates
  Engine; it only renders state pushed by the host.

  State machine:
    'idle' -> 'bid' -> 'play' -> 'result' -> 'idle'

  Players are abstracted via PlayerAdapter:
    adapter.decideBid({hand, currentBidValue}) -> Promise<int 0..3>
    adapter.decidePlay(ctx) -> Promise<Card[] | null>  (null = pass)
    adapter.onState(state) -> void  (broadcast, optional)

  Engine never references DOM; UI subscribes via callbacks.
  ============================================================ */
function GameEngine(opts){
  this.players=opts.players;     // [adapter0, adapter1, adapter2]
  this.playerNames=opts.names||['\u73A9\u5BB6A','\u73A9\u5BB6B','\u73A9\u5BB6C'];
  this.localSeat=(opts.localSeat===undefined)?-1:opts.localSeat; // -1 = host watches all
  this.onState=opts.onState||function(){};
  this.onEvent=opts.onEvent||function(){}; // for UI animations & sounds
  this.onSettle=opts.onSettle||function(){};
  this.cumulativeScores=opts.cumulativeScores||[0,0,0];
  this.G=null;
}
GameEngine.prototype.startRound=function(){
  var deck=createDeck();shuffle(deck);
  var hands=[[],[],[]];
  for(var i=0;i<51;i++)hands[i%3].push(deck[i]);
  var bottom=[deck[51],deck[52],deck[53]];
  for(var i=0;i<3;i++)sortHand(hands[i]);
  this.G={
    phase:'bid',
    hands:hands,
    bottomCards:bottom,
    landlordIdx:-1,
    bidder:Math.floor(Math.random()*3),
    bidValue:0,
    bidTurn:0,
    bidLog:[], // [{seat, value}]
    currentPlayer:0,
    lastPlay:null,
    lastPlayPlayer:-1,
    passCount:0,
    bombCount:0,
    spring:false,antiSpring:false,
    playedCounts:[0,0,0],
    playedRecord:[]
  };
  this.onEvent({type:'roundStart',state:this.snapshot()});
  this.onState(this.snapshot());
  var self=this;
  setTimeout(function(){self.runBidLoop();},250);
};
GameEngine.prototype.snapshot=function(){
  // Full snapshot for host's eyes; UI filters per-seat for guests
  var G=this.G;
  return {
    phase:G.phase,
    hands:[G.hands[0].slice(),G.hands[1].slice(),G.hands[2].slice()],
    handLengths:[G.hands[0].length,G.hands[1].length,G.hands[2].length],
    bottomCards:G.bottomCards.slice(),
    landlordIdx:G.landlordIdx,
    bidder:G.bidder,
    bidValue:G.bidValue,
    bidTurn:G.bidTurn,
    bidLog:G.bidLog.slice(),
    currentPlayer:G.currentPlayer,
    lastPlay:G.lastPlay?{type:G.lastPlay.type,rank:G.lastPlay.rank,len:G.lastPlay.len,planeLen:G.lastPlay.planeLen}:null,
    lastPlayCards:G.lastPlayCards?G.lastPlayCards.slice():null,
    lastPlayPlayer:G.lastPlayPlayer,
    passCount:G.passCount,
    bombCount:G.bombCount,
    spring:G.spring,antiSpring:G.antiSpring,
    playedCounts:G.playedCounts.slice(),
    playedRecord:G.playedRecord.slice(),
    playerNames:this.playerNames.slice(),
    cumulativeScores:this.cumulativeScores.slice()
  };
};
GameEngine.prototype.runBidLoop=function(){
  var self=this,G=this.G;
  if(G.bidTurn>=3){
    if(G.bidValue===0){
      this.onEvent({type:'bidRedeal'});
      setTimeout(function(){self.startRound();},1500);
      return;
    }
    this.finalizeBid();return;
  }
  var cp=(G.bidder+G.bidTurn)%3;
  G.currentPlayer=cp;
  this.onState(this.snapshot());
  var adapter=this.players[cp];
  var minBid=G.bidValue+1;
  if(minBid>3){this.finalizeBid();return;}
  adapter.decideBid({
    hand:G.hands[cp].slice(),
    currentBidValue:G.bidValue,
    seat:cp,
    bidLog:G.bidLog.slice()
  }).then(function(v){
    if(typeof v!=='number') v=0;
    v=v|0;
    if(v<0)v=0;if(v>3)v=3;
    self.onEvent({type:'bid',seat:cp,value:v});
    if(v>G.bidValue){
      G.bidValue=v;G.landlordIdx=cp;
    }
    G.bidLog.push({seat:cp,value:v});
    if(v===3){G.bidTurn=3;}
    else G.bidTurn++;
    self.onState(self.snapshot());
    setTimeout(function(){self.runBidLoop();},700);
  });
};
GameEngine.prototype.finalizeBid=function(){
  var G=this.G;
  G.baseBid=G.bidValue;
  for(var i=0;i<G.bottomCards.length;i++)G.hands[G.landlordIdx].push(G.bottomCards[i]);
  sortHand(G.hands[G.landlordIdx]);
  this.onEvent({type:'bidFinal',landlordIdx:G.landlordIdx,bottomCards:G.bottomCards.slice(),baseBid:G.bidValue});
  G.phase='play';
  G.currentPlayer=G.landlordIdx;
  G.lastPlay=null;G.lastPlayCards=null;G.lastPlayPlayer=-1;G.passCount=0;
  this.onState(this.snapshot());
  var self=this;
  setTimeout(function(){self.runPlayLoop();},2000);
};
GameEngine.prototype.runPlayLoop=function(){
  var self=this,G=this.G;
  if(G.phase!=='play')return;
  var pi=G.currentPlayer;
  this.onState(this.snapshot());
  var adapter=this.players[pi];
  var free=!G.lastPlay||G.lastPlayPlayer===pi;
  var ctx={
    myIdx:pi,
    hand:G.hands[pi].slice(),
    candidates:findValid(G.hands[pi],free?null:G.lastPlay),
    free:free,
    landlordIdx:G.landlordIdx,
    handLengths:[G.hands[0].length,G.hands[1].length,G.hands[2].length],
    lastPlay:G.lastPlay,lastPlayPlayer:G.lastPlayPlayer,
    playedRecord:G.playedRecord.slice(),
    passCount:G.passCount,
    allHands:[G.hands[0].slice(),G.hands[1].slice(),G.hands[2].slice()] // only AI uses this
  };
  adapter.decidePlay(ctx).then(function(played){
    if(self.G!==G||G.phase!=='play')return;
    if(!played||!played.length){
      // pass attempt
      if(free){
        // can't pass when free; ask again with first valid
        if(ctx.candidates.length){
          played=ctx.candidates[0];
        } else {
          // truly empty? should never happen; force pass anyway
          self.onEvent({type:'pass',seat:pi});
          self.advancePass();return;
        }
      } else {
        self.onEvent({type:'pass',seat:pi});
        self.advancePass();return;
      }
    }
    var play=analyzeCards(played);
    if(!play||(!free&&!canBeat(play,G.lastPlay))){
      // illegal; force a valid candidate
      if(ctx.candidates.length){
        played=ctx.candidates[0];play=analyzeCards(played);
      } else {
        self.onEvent({type:'pass',seat:pi});
        self.advancePass();return;
      }
    }
    var isBomb=(play.type==='bomb'||play.type==='rocket');
    if(isBomb)G.bombCount++;
    G.lastPlay=play;G.lastPlayCards=played.slice();G.lastPlayPlayer=pi;G.passCount=0;
    G.playedCounts[pi]++;
    for(var i=0;i<played.length;i++)G.playedRecord.push(played[i].value);
    // remove from hand by id
    var nh=[];
    for(var i=0;i<G.hands[pi].length;i++){
      var keep=true;
      for(var j=0;j<played.length;j++)if(G.hands[pi][i].id===played[j].id){keep=false;break;}
      if(keep)nh.push(G.hands[pi][i]);
    }
    G.hands[pi]=nh;
    self.onEvent({type:'play',seat:pi,cards:played,isBomb:isBomb,pattern:play});
    if(G.hands[pi].length===0){self.endRound(pi);return;}
    G.currentPlayer=(pi+1)%3;
    self.onState(self.snapshot());
    setTimeout(function(){self.runPlayLoop();},900);
  });
};
GameEngine.prototype.advancePass=function(){
  var self=this,G=this.G;
  G.passCount++;
  if(G.passCount>=2){G.lastPlay=null;G.lastPlayCards=null;G.lastPlayPlayer=-1;G.passCount=0;}
  G.currentPlayer=(G.currentPlayer+1)%3;
  this.onState(this.snapshot());
  setTimeout(function(){self.runPlayLoop();},700);
};
GameEngine.prototype.endRound=function(winnerIdx){
  var G=this.G;
  G.phase='result';
  // spring detection (1:1 from prior version)
  if(winnerIdx===G.landlordIdx){
    var fp=false;
    for(var i=0;i<3;i++)if(i!==G.landlordIdx&&G.playedCounts[i]>0)fp=true;
    if(!fp)G.spring=true;
  } else {
    if(G.playedCounts[G.landlordIdx]<=1)G.antiSpring=true;
  }
  var mult=this.calcMult();
  var pts=G.baseBid*mult;
  var dWin=(winnerIdx===G.landlordIdx);
  // distribute
  var deltas=[0,0,0];
  for(var i=0;i<3;i++){
    if(i===G.landlordIdx) deltas[i]=(dWin?1:-1)*pts*2;
    else deltas[i]=(dWin?-1:1)*pts;
  }
  for(var i=0;i<3;i++) this.cumulativeScores[i]+=deltas[i];
  this.onEvent({type:'roundEnd',winnerIdx:winnerIdx,landlordIdx:G.landlordIdx,
    baseBid:G.baseBid,multiplier:mult,deltas:deltas,
    spring:G.spring,antiSpring:G.antiSpring,
    finalHands:[G.hands[0].slice(),G.hands[1].slice(),G.hands[2].slice()]});
  this.onSettle({deltas:deltas,winnerIdx:winnerIdx,landlordIdx:G.landlordIdx,
    multiplier:mult,baseBid:G.baseBid,spring:G.spring,antiSpring:G.antiSpring,
    cumulativeScores:this.cumulativeScores.slice(),
    playerNames:this.playerNames.slice()});
};
GameEngine.prototype.calcMult=function(){
  var G=this.G,m=1;
  for(var i=0;i<G.bombCount;i++)m*=2;
  if(G.spring||G.antiSpring)m*=2;
  return m;
};

/* ============================================================
  12. PLAYER ADAPTERS
  ============================================================ */
/* AIAdapter: synchronous decisions wrapped in Promise + delay */
function AIAdapter(opts){
  this.thinkMin=opts&&opts.thinkMin?opts.thinkMin:500;
  this.thinkMax=opts&&opts.thinkMax?opts.thinkMax:900;
}
AIAdapter.prototype.decideBid=function(req){
  var self=this;
  return new Promise(function(resolve){
    var v=aiBidDec(req.hand,req.currentBidValue);
    var d=self.thinkMin+Math.random()*(self.thinkMax-self.thinkMin);
    setTimeout(function(){resolve(v);},d);
  });
};
AIAdapter.prototype.decidePlay=function(ctx){
  var self=this;
  return new Promise(function(resolve){
    if(!ctx.candidates.length){resolve(null);return;}
    var ch=aiChoose(ctx);
    var d=self.thinkMin+Math.random()*(self.thinkMax-self.thinkMin);
    setTimeout(function(){resolve(ch);},d);
  });
};
AIAdapter.prototype.onState=function(){};

/* HumanLocalAdapter: UI sets a pending resolver, then calls submit() */
function HumanLocalAdapter(){
  this.pendingResolve=null;
  this.pendingType=null; // 'bid' | 'play'
  this.pendingCtx=null;
}
HumanLocalAdapter.prototype.decideBid=function(req){
  var self=this;
  return new Promise(function(resolve){
    self.pendingResolve=resolve;self.pendingType='bid';self.pendingCtx=req;
    if(self.onPrompt) self.onPrompt('bid',req);
  });
};
HumanLocalAdapter.prototype.decidePlay=function(ctx){
  var self=this;
  return new Promise(function(resolve){
    self.pendingResolve=resolve;self.pendingType='play';self.pendingCtx=ctx;
    if(self.onPrompt) self.onPrompt('play',ctx);
  });
};
HumanLocalAdapter.prototype.submit=function(value){
  if(!this.pendingResolve)return;
  var r=this.pendingResolve;
  this.pendingResolve=null;this.pendingType=null;this.pendingCtx=null;
  r(value);
};
HumanLocalAdapter.prototype.onState=function(){};

/* RemoteAdapter: defined in game-ui.js (uses PeerJS) */

/* ============================================================
  13. EXPORTS
  ============================================================ */
global.DDZ={
  RANKS:RANKS,SUITS:SUITS,SC:SC,RV:RV,
  createDeck:createDeck,shuffle:shuffle,sortHand:sortHand,
  cardById:cardById,cardsToIds:cardsToIds,idsToCards:idsToCards,
  getCM:getCM,analyzeCards:analyzeCards,canBeat:canBeat,findValid:findValid,
  countHands:countHands,
  getPlayedCount:getPlayedCount,isCardMaster:isCardMaster,
  aiBidDec:aiBidDec,aiChoose:aiChoose,aiChooseL12:aiChooseL12,l3Solve:l3Solve,
  generateHints:generateHints,
  GameEngine:GameEngine,
  AIAdapter:AIAdapter,
  HumanLocalAdapter:HumanLocalAdapter
};

})(typeof window!=='undefined'?window:this);
