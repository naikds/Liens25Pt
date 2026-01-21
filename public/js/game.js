import {reConnect,sendPhotonMessage} from './photon_src.js';

// ……関数群の上部にこれを追加（グローバル変数として保持）
let afterCommitHook = null;

(() => {
    // ====== 盤・定数 ======
    const N = 5;
    const P1 = 1; // 先手（下→上）
    const P2 = 2; // 後手（上→下）
  
    // 2マス直進のルール（据え置き）
    const RULES = {
      allowP2DoubleOnFirst: true,      // 後手は可
      allowP1DoubleOnFirst: false,     // 先手は不可
    };
  
    // ====== 描画 ======
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const padding = 50;
    const gridSize = canvas.width - padding * 2;
    const step = gridSize / (N - 1);
    const px = (c) => padding + c * step;
  
    // ====== UI ======
    const statusEl = document.getElementById('status');
    const allowDiagonalsEl = document.getElementById('allowDiagonals');
    const showHintsEl = document.getElementById('showHints');
    const forbidCrossEl = document.getElementById('forbidCross');
    const forbidReusePointEl = document.getElementById('forbidReusePoint');
    const debugWhyEl = document.getElementById('debugWhy');
    const p1dsEl = document.getElementById('p1ds');
    const p2dsEl = document.getElementById('p2ds');
    const clearSelBtn = document.getElementById('clearSelBtn');
    const onlineConnectBtn = document.getElementById('onlineConnectBtn');
  
    // ====== 状態 ======
    let currentPlayer = P1;
    let swapped = false;
    const paths = { [P1]: [], [P2]: [] }; // 各プレイヤーの点列（両端伸長対応）
    const usedPoints = new Set();          // "x,y"
    const segments = [];                   // { a:{x,y}, b:{x,y}, player }
    let selected = null;                   // 選択中の端点 or 初手の開始点
    const history = [];
  
    let doubleStepUsed = { [P1]: false, [P2]: false }; // 直進2マス使用（各1回）
  
    // ====== ユーティリティ ======
    const keyOf = (p) => `${p.x},${p.y}`;
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const equals = (a,b) => a && b && a.x===b.x && a.y===b.y;
    const isOnBoard = (p) => p.x>=0 && p.x<N && p.y>=0 && p.y<N;
    
  
    function saveHistory() {
      history.push({
        currentPlayer,
        paths: clone(paths),
        used: Array.from(usedPoints),
        segments: clone(segments),
        selected: selected ? { ...selected } : null,
        swapped,
        doubleStepUsed: { ...doubleStepUsed },
      });
    }
    function undo() {
      if (history.length === 0) return;
      const s = history.pop();
      currentPlayer = s.currentPlayer;
      paths[P1] = s.paths[P1]; paths[P2] = s.paths[P2];
      usedPoints.clear(); s.used.forEach(k => usedPoints.add(k));
      segments.splice(0, segments.length, ...s.segments);
      selected = s.selected;
      swapped = s.swapped;
      doubleStepUsed = { ...s.doubleStepUsed };
      draw(); updateStatus(); updateCounters();
    }

    function onlineConnect(){
      reConnect();
        
      setSend(sendMessage);
    }
  
    function updateCounters(){
      p1dsEl.textContent = doubleStepUsed[P1] ? '0' : '1';
      p2dsEl.textContent = doubleStepUsed[P2] ? '0' : '1';
    }
  
    function pointFromPixel(mx, my) {
      let nearest=null, best=Infinity;
      for (let y=0;y<N;y++) for (let x=0;x<N;x++){
        const dx=px(x)-mx, dy=px(y)-my, d2=dx*dx+dy*dy;
        if (d2<best){ best=d2; nearest={x,y}; }
      }
      const maxSnap=18;
      return Math.sqrt(best)<=maxSnap ? nearest : null;
    }
  
    function isOwnStartEdge(player, p){
      const top=0, bottom=N-1;
      if (!swapped){
        return (player===P1 && p.y===bottom) || (player===P2 && p.y===top);
      } else {
        return (player===P1 && p.y===top) || (player===P2 && p.y===bottom);
      }
    }
    function isOpponentGoalEdge(player, p){
      const top=0, bottom=N-1;
      if (!swapped){
        return (player===P1 && p.y===top) || (player===P2 && p.y===bottom);
      } else {
        return (player===P1 && p.y===bottom) || (player===P2 && p.y===top);
      }
    }
  
    function getTail(player){
      const path=paths[player]; return (path.length>0)? path[0] : null;
    }
    function getHead(player){
      const path=paths[player]; return (path.length>0)? path[path.length-1] : null;
    }
    function getCurrentHead(player){ return getHead(player); }
    function isPointUsed(p){ return usedPoints.has(keyOf(p)); }
    function isFirstMove(player){ return paths[player].length === 0; }
  
    // 前進方向：P1は上(-1)、P2は下(+1)。swappedで反転。
    function forwardDir(player){
      if (!swapped){
        return (player === P1) ? -1 : +1;
      } else {
        return (player === P1) ? +1 : -1;
      }
    }
  
    // 1マス候補
    function neighbors(from){
      const deltas = [
        {dx: 1, dy: 0}, {dx: -1, dy: 0},
        {dx: 0, dy: 1}, {dx: 0, dy: -1}
      ];
      if (allowDiagonalsEl.checked){
        deltas.push({dx: 1, dy: 1},{dx: -1, dy: 1},{dx: 1, dy: -1},{dx: -1, dy: -1});
      }
      const list=[];
      for (const d of deltas){
        const to={x:from.x+d.dx, y:from.y+d.dy};
        if (!isOnBoard(to)) continue;
        list.push(to);
      }
      return list;
    }
  
    // 幾何：真の交差/重なりのみ
    function orient(p, q, r) {
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    }
    function segmentsIntersect(a1, a2, b1, b2) {
      // proper intersection
      const o1 = orient(a1, a2, b1);
      const o2 = orient(a1, a2, b2);
      const o3 = orient(b1, b2, a1);
      const o4 = orient(b1, b2, a2);
      if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) &&
          (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
        return true;
      }
      // colinear overlap (endpoint以外の区間重なり）
      const onSegment = (p, q, r) => {
        return Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
               Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
      };
      if (o1 === 0 && onSegment(a1, b1, a2)) return true;
      if (o2 === 0 && onSegment(a1, b2, a2)) return true;
      if (o3 === 0 && onSegment(b1, a1, b2)) return true;
      if (o4 === 0 && onSegment(b1, a2, b2)) return true;
      return false;
    }
  
    // 不正理由（nullで合法）
    function whyIllegal(from, to) {
      if (forbidReusePointEl.checked && isPointUsed(to)) return '行き先の点は使用済み';
      // 継ぎ足し許可：from と端点共有の既存線はスキップ
      for (const s of segments) {
        const sharesFrom =
          (from.x === s.a.x && from.y === s.a.y) ||
          (from.x === s.b.x && from.y === s.b.y);
        if (sharesFrom) continue;
  
        const sharesTo =
          (to.x === s.a.x && to.y === s.a.y) ||
          (to.x === s.b.x && to.y === s.b.y);
        if (sharesTo) return '行き先が既存線の端点（点の再使用）';
  
        if (forbidCrossEl.checked && segmentsIntersect(from, to, s.a, s.b)) {
          return '既存線と真に交差/重なり';
        }
      }
      return null;
    }
  
    // 2マス直進がこの手番で使えるか（権利未使用＋初手例外の考慮）
    function canUseDoubleStepThisTurn(player){
      if (doubleStepUsed[player]) return false; // 既に消費済み
      if (player === P1) return !!RULES.allowP1DoubleOnFirst;
      if (player === P2) return !!RULES.allowP2DoubleOnFirst;
    }
  
    // これは2マス直進の手か？
    function isDoubleStepMove(from, to, player){
      const dir = forwardDir(player);
      return (to.x === from.x) && (to.y === from.y + 2*dir);
    }
  
    // 端（from）からの合法行き先（1マス＋直進2マス）
    function legalDestinationsFrom(from, player){
      const list = [];
  
      // 1マス候補
      for (const to of neighbors(from)){
        if (!whyIllegal(from, to)) list.push(to);
      }
  
      // 直進2マス候補（斜め2マスは不可）
      if (canUseDoubleStepThisTurn(player)){
        const dir = forwardDir(player);
        const mid = { x: from.x, y: from.y + 1*dir }; // 視覚上の中間点
        const two = { x: from.x, y: from.y + 2*dir };
        if (isOnBoard(two)){
          // 中間点が使用済みなら不可（視覚的接触を避ける）
          if (!(forbidReusePointEl.checked && isPointUsed(mid))){
            if (!whyIllegal(from, two)) list.push(two);
          }
        }
      }
      return list;
    }
  
    // 両端のどちらかに合法手があるか
    function hasAnyMoveFromEitherEnd(player){
      const t = getTail(player), h = getHead(player);
      if (!t || !h) return false; // 初手はここには来ない
      if (legalDestinationsFrom(t, player).length>0) return true;
      if (legalDestinationsFrom(h, player).length>0) return true;
      return false;
    }
    
  
  // 既存の commitSegment を差し替え
  function commitSegment(from, to, player){
    const reason = whyIllegal(from, to);
    if (reason) {
      if (debugWhyEl.checked) console.warn('[ILLEGAL]', reason, { from, to });
      return false;
    }
    saveHistory();
  
    usedPoints.add(keyOf(from));
    usedPoints.add(keyOf(to));
    segments.push({a:{...from}, b:{...to}, player});
  
    const path = paths[player];
    if (path.length===0){
      path.push({...from}, {...to}); // 初手
    } else {
      const isTail = equals(from, path[0]);
      const isHead = equals(from, path[path.length-1]);
      if (isTail){
        path.unshift({...to}); // 先頭側に追加
      } else if (isHead){
        path.push({...to});    // 末尾側に追加
      } else {
        if (debugWhyEl.checked) console.warn('from が端ではありません', { from, path });
        return false;
      }
    }
  
    const usedDouble = isDoubleStepMove(from, to, player);
    if (usedDouble){
      doubleStepUsed[player] = true;
    }
  
    // ★ ここが追加：ローカルでコミット成功後に送信フック（あれば）を叩く
    if (typeof afterCommitHook === 'function') {
      try {
        afterCommitHook({ from, to, player, ds: usedDouble });
      } catch (e) {
        console.warn('afterCommitHook error:', e);
      }
    }
  
    return true;
  }
  ``
  
  
    // 勝利判定：どちらの端がゴールでも勝ち
    function tryWin(player){
      const t = getTail(player), h = getHead(player);
      if (!t || !h) return null;
      if (isOpponentGoalEdge(player, t)) return player;
      if (isOpponentGoalEdge(player, h)) return player;
      return null;
    }
  
    function switchPlayer(){ currentPlayer = (currentPlayer===P1)?P2:P1; selected=null; }
  
    function reset(all=true){
      paths[P1]=[]; paths[P2]=[];
      usedPoints.clear();
      segments.splice(0,segments.length);
      selected=null;
      currentPlayer=P1;
      if (all) swapped=false;
      history.length=0;
      doubleStepUsed = { [P1]: false, [P2]: false };
      draw(); updateStatus(); updateCounters();
    }
  
    function swapSides(){ saveHistory(); swapped=!swapped; reset(false); }
  
    // ====== 描画 ======
    function drawGrid(){
      ctx.lineWidth=2; ctx.strokeStyle='#e2e8f0';
      ctx.strokeRect(padding,padding,gridSize,gridSize);
      ctx.strokeStyle='#eef2f7'; ctx.lineWidth=1;
      for (let i=0;i<N;i++){
        ctx.beginPath(); ctx.moveTo(px(i),px(0)); ctx.lineTo(px(i),px(N-1)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(0),px(i)); ctx.lineTo(px(N-1),px(i)); ctx.stroke();
      }
      for (let y=0;y<N;y++) for (let x=0;x<N;x++){
        const used=usedPoints.has(`${x},${y}`);
        ctx.beginPath(); ctx.fillStyle = used ? '#94a3b8' : '#475569';
        ctx.arc(px(x),px(y),5,0,Math.PI*2); ctx.fill();
      }
    }
  
    function drawSegments(){
      for (const s of segments){
        ctx.lineWidth=6; ctx.lineCap='round';
        ctx.strokeStyle = (s.player===P1)?'#e74c3c':'#3498db';
        ctx.beginPath();
        ctx.moveTo(px(s.a.x),px(s.a.y)); ctx.lineTo(px(s.b.x),px(s.b.y)); ctx.stroke();
      }
    }
  
    function drawEndpoints(player){
      const t = getTail(player), h = getHead(player);
      if (!t || !h) return;
  
      // 端マーカー（薄いアンバー）
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(245,158,11,0.6)'; // amber
      [t,h].forEach(p=>{
        ctx.beginPath();
        ctx.arc(px(p.x), px(p.y), 9, 0, Math.PI*2);
        ctx.stroke();
      });
  
      // 選択端は太め・濃いアンバー
      if (selected){
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(245,158,11,1)';
        ctx.beginPath();
        ctx.arc(px(selected.x), px(selected.y), 9, 0, Math.PI*2);
        ctx.stroke();
      }
    }
  
    function drawSelectionAndHints(){
      const myPath = paths[currentPlayer];
  
      // 初手でも選択中の開始点があればオレンジ丸
      if (myPath.length === 0 && selected){
        ctx.beginPath();
        ctx.fillStyle = 'rgba(245,158,11,1)';
        ctx.arc(px(selected.x), px(selected.y), 8, 0, Math.PI*2);
        ctx.fill();
      }
  
      // 両端リング表示（2手目以降）
      if (myPath.length > 0){
        drawEndpoints(currentPlayer);
      }
  
      if (!showHintsEl.checked) return;
  
      // 合法手ハイライト
      if (myPath.length === 0){
        if (!selected){
          // 初手：開始点候補を緑表示
          for (let y=0;y<N;y++) for (let x=0;x<N;x++){
            const p={x,y}; if (!isOwnStartEdge(currentPlayer,p)) continue;
            if (isPointUsed(p) && forbidReusePointEl.checked) continue;
            const lm = legalDestinationsFrom(p, currentPlayer);
            if (lm.length>0){
              ctx.beginPath(); ctx.fillStyle='rgba(46,204,113,.9)';
              ctx.arc(px(p.x),px(p.y),7,0,Math.PI*2); ctx.fill();
            }
          }
        } else {
          // 初手：選択中開始点からの行き先
          for (const q of legalDestinationsFrom(selected, currentPlayer)){
            ctx.beginPath(); ctx.fillStyle='rgba(46,204,113,.9)';
            ctx.arc(px(q.x),px(q.y),7,0,Math.PI*2); ctx.fill();
          }
        }
        return;
      }
  
      // 2手目以降：端が選ばれていれば行き先を表示
      if (selected){
        for (const q of legalDestinationsFrom(selected, currentPlayer)){
          ctx.beginPath(); ctx.fillStyle='rgba(46,204,113,.9)';
          ctx.arc(px(q.x),px(q.y),7,0,Math.PI*2); ctx.fill();
        }
      }
    }
  
    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawGrid();
      drawSegments();
      drawSelectionAndHints();
    }
  
    function updateStatus(msg){
      if (msg){ statusEl.textContent=msg; return; }
      const myPath = paths[currentPlayer];
      const me=(currentPlayer===P1)?'先手（赤）':'後手（青）';
      const remain = (player)=> doubleStepUsed[player] ? '残り0' : '残り1';
  
      if (myPath.length===0){
        if (selected){
          statusEl.textContent = `${me}の初手：黄色の開始点から緑の点へ（直進2マス ${remain(currentPlayer)}）`;
        } else {
          statusEl.textContent = `${me}の初手：自陣の端のいずれかの点を開始点に選んでください（直進2マス ${remain(currentPlayer)}）`;
        }
      } else {
        if (!selected){
          statusEl.textContent = `${me}の手番：自分の線の両端いずれかをクリックして出発端を選んでください（直進2マス ${remain(currentPlayer)}）`;
        } else {
          statusEl.textContent = `${me}の手番：選択中の端（濃い黄色）から合法手へ（直進2マス ${remain(currentPlayer)}）`;
        }
      }
    }
  
    // ====== 入力 ======
    canvas.addEventListener('click', (e)=>{     
      // ★ 追加：自分の手番でないなら入力無効
      if (!isLocalTurn()) {
        updateStatus('相手の手番です');
        return;
      }

      const rect=canvas.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
      const my=(e.clientY-rect.top)*(canvas.height/rect.height);
      const p=pointFromPixel(mx,my); if (!p) return;
  
      const myPath = paths[currentPlayer];
  
      // --- 初手 ---
      if (myPath.length===0){
        if (!selected){
          if (!isOwnStartEdge(currentPlayer,p)){ updateStatus('自陣の端の点を選んでください'); return; }
          if (forbidReusePointEl.checked && isPointUsed(p)){ updateStatus('その点は使用済みです'); return; }
          selected=p; draw(); updateStatus(); return;
        } else {
          // 同じ点をもう一度クリックで選択解除（トグル）
          if (equals(p,selected)){ selected=null; draw(); updateStatus(); return; }
  
          const legal = legalDestinationsFrom(selected, currentPlayer);
          const ok = legal.some(q=>equals(q,p));
          if (!ok){ updateStatus('開始点からの合法手ではありません'); return; }
  
          const reason = whyIllegal(selected, p);
          if (reason){ if (debugWhyEl.checked) alert('不正：' + reason); updateStatus('その手は不正です'); return; }
          const done=commitSegment(selected,p,currentPlayer);
          if (!done){ updateStatus('その手は不正です'); return; }
  
          const winner=tryWin(currentPlayer);
          if (winner){ draw(); const msg=(winner===P1)?'先手（赤）の勝利！':'後手（青）の勝利！'; updateStatus(msg); alert(msg); return; }
  
          switchPlayer();
  
          if (!hasAnyLegalMove(currentPlayer)){
            draw();
            const loser=(currentPlayer===P1)?'先手（赤）':'後手（青）';
            const winnerName=(currentPlayer===P1)?'後手（青）':'先手（赤）';
            const msg=`${loser}に合法手がありません。${winnerName}の勝利！`;
            updateStatus(msg); alert(msg); return;
          }
  
          draw(); updateStatus(); updateCounters(); return;
        }
      }
  
      // --- 2手目以降：端の選択 ---
      const t = getTail(currentPlayer), h = getHead(currentPlayer);
      if (!selected){
        if (equals(p, t) || equals(p, h)){
          selected = p; draw(); updateStatus(); return;
        } else {
          updateStatus('自分の線の両端いずれかをクリックして、出発端を選んでください');
          return;
        }
      } else {
        // 同じ端をもう一度クリックで選択解除（トグル）
        if (equals(p, selected)){ selected=null; draw(); updateStatus(); return; }
      }
  
      // --- 端が選択済み：移動先へ ---
      const from=selected, to=p;
      if (equals(from,to)) return;
  
      const legal = legalDestinationsFrom(from, currentPlayer);
      const ok = legal.some(q=>equals(q,to));
      if (!ok){ updateStatus('隣接/直進2マスの合法手ではありません'); return; }
  
      const reason = whyIllegal(from, to);
      if (reason){ if (debugWhyEl.checked) alert('不正：' + reason); updateStatus('その手は不正です'); return; }
  
      const done=commitSegment(from,to,currentPlayer);
      if (!done){ updateStatus('その手は不正です'); return; }
  
      const winner=tryWin(currentPlayer);
      if (winner){ draw(); const msg=(winner===P1)?'先手（赤）の勝利！':'後手（青）の勝利！'; updateStatus(msg); alert(msg); return; }
  
      switchPlayer();
  
      if (!hasAnyLegalMove(currentPlayer)){
        draw();
        const loser=(currentPlayer===P1)?'先手（赤）':'後手（青）';
        const winnerName=(currentPlayer===P1)?'後手（青）':'先手（赤）';
        const msg=`${loser}に合法手がありません。${winnerName}の勝利！`;
        updateStatus(msg); alert(msg); return;
      }
  
      draw(); updateStatus(); updateCounters();
    });
  
    // 選択解除ボタン
    clearSelBtn.addEventListener('click', ()=>{
      selected = null; draw(); updateStatus();
    });
  
    // ESCキーで選択解除
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){
        if (selected){
          selected = null; draw(); updateStatus();
        }
      }
    });
  
    // そのプレイヤーに合法手があるか（初手 or 両端の合算）
    function hasAnyLegalMove(player){
      const path = paths[player];
      if (path.length===0){
        for (let y=0;y<N;y++) for (let x=0;x<N;x++){
          const p={x,y};
          if (!isOwnStartEdge(player,p)) continue;
          if (forbidReusePointEl.checked && isPointUsed(p)) continue;
          const lm = legalDestinationsFrom(p, player);
          if (lm.length>0) return true;
        }
        return false;
      } else {
        return hasAnyMoveFromEitherEnd(player);
      }
    }
  
    // ====== コントロール ======
    document.getElementById('undoBtn').addEventListener('click', ()=>{ undo(); });
    document.getElementById('resetBtn').addEventListener('click', ()=>{ reset(true); });
    document.getElementById('swapSidesBtn').addEventListener('click', ()=>{ swapSides(); });
    [allowDiagonalsEl, showHintsEl, forbidCrossEl, forbidReusePointEl, debugWhyEl].forEach(el=>{
      el.addEventListener('change', ()=>{ draw(); updateStatus(); updateCounters(); });
    });
    document.getElementById('onlineConnectBtn').addEventListener('click',()=>{ onlineConnect(); });
  
    // 初期描画
    draw(); updateStatus(); updateCounters();
  })();
  
  
  // ====== Online API（送受信） ======
  const PROTOCOL_VERSION = 1;
  
  let sendFn = null; // 上位（P2P層）から注入される送信関数
  
  function setSend(fn){
    sendFn = fn;
    // commitSegment 直後に呼ばれるフックをセット
    afterCommitHook = ({ from, to, player, ds }) => {
      if (!sendFn) return;
      const msg = {
        v: PROTOCOL_VERSION,
        t: 'm',         // move
        p: player,      // 1 or 2
        f: [from.x, from.y],
        to: [to.x, to.y],
        ds: !!ds
      };
      try {
        sendFn(JSON.stringify(msg));
      } catch (e) {
        console.warn('sendFn failed:', e);
      }
    };
  }

  function sendMessage(str){
    sendPhotonMessage(1,str);
  }
  
  /**
   * 受信した文字列（JSON）を適用
   * @param {string} msgStr
   * @returns {{ok:boolean, error?:string, winner?:number}}
   */
  export function applyRemote(msgStr){
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch {
      return { ok:false, error:'parse_error' };
    }
  
    if (!msg || msg.v !== PROTOCOL_VERSION || msg.t !== 'm') {
      return { ok:false, error:'bad_message' };
    }
    if (!Array.isArray(msg.f) || !Array.isArray(msg.to)) {
      return { ok:false, error:'bad_coords' };
    }
  
    const player = msg.p;
    // ターン整合性チェック：今このローカルが期待している手番と一致するか
    if (player !== currentPlayer) {
      return { ok:false, error:`out_of_turn_expected_${currentPlayer}_got_${player}` };
    }
  
    const from = { x: msg.f[0], y: msg.f[1] };
    const to   = { x: msg.to[0], y: msg.to[1] };
  
    // from 妥当性（初手 or 両端）
    const myPath = paths[player];
    if (myPath.length === 0) {
      if (!isOwnStartEdge(player, from)) {
        return { ok:false, error:'invalid_start_point' };
      }
    } else {
      const t = getTail(player), h = getHead(player);
      if (!equals(from, t) && !equals(from, h)) {
        return { ok:false, error:'from_not_endpoint' };
      }
    }
  
    // 合法性は commitSegment 内でもう一度検証
    const ok = commitSegment(from, to, player);
    if (!ok) {
      return { ok:false, error:'illegal_move' };
    }
  
    // 勝利判定
    const winner = tryWin(player);
    if (winner){
      draw();
      updateStatus((winner===P1)?'先手（赤）の勝利！':'後手（青）の勝利！');
      return { ok:true, winner };
    }
  
    // ターン切替 & 相手の詰み判定
    switchPlayer();
  
    if (!hasAnyLegalMove(currentPlayer)){
      draw();
      const loser=(currentPlayer===P1)?'先手（赤）':'後手（青）';
      const winnerName=(currentPlayer===P1)?'後手（青）':'先手（赤）';
      updateStatus(`${loser}に合法手がありません。${winnerName}の勝利！`);
      return { ok:true, winner: (currentPlayer===P1)?P2:P1 };
    }
  
    draw(); updateStatus(); updateCounters();
    return { ok:true };
  
  }

  
// ==== 追加：ロール（ローカルが先手/後手どちらを操作するか） ====
let localRole = null; // "p1" or "p2"。未設定なら両側入力可（オフライン動作優先）

function setLocalRole(role) {
  if (role !== 'p1' && role !== 'p2') throw new Error('invalid role');
  localRole = role;
  // ステータスに軽く反映
  updateStatus(`役割を設定：あなたは ${role === 'p1' ? '先手（赤）' : '後手（青）'} です`);
}

function getLocalRole() {
  return localRole; // "p1" | "p2" | null
}

// ==== クリック入力ガードのためのヘルパ ====
function isLocalTurn() {
  if (!localRole) return true; // 未設定ならガードしない（オフライン互換）
  const lp = (localRole === 'p1') ? 1 : 2;
  return currentPlayer === lp;
}
``

function decideRoleRandom() {
  return (Math.random() < 0.5) ? 'p1' : 'p2';
}

function getYouRole(){
  if(getLocalRole() == 'p1'){return 'p2';}
  else{return 'p1'}
}

export function applyRole(roleString) {
  if (roleString !== 'p1' && roleString !== 'p2') {
    return { ok:false, error:'invalid_role' };
  }
  try {
    setLocalRole(roleString);
    return { ok:true };
  } catch (e) {
    return { ok:false, error: e.message };
  }
}

export function createRole(){
  const myRole = decideRoleRandom();
  setLocalRole(myRole);
  
  sendPhotonMessage(5,getYouRole());
}
  
  // ★ 外部に公開
  window.OnlineAPI = {
    setSend,
    applyRemote,
    sendMessage,
    setLocalRole,
    getLocalRole,
    isLocalTurn,
    decideRoleRandom,
    applyRole,
    // おまけ：デシンク対策にスナップショット/復元（必要なら使ってください）
    exportSnapshot: () => JSON.stringify({
      v: PROTOCOL_VERSION,
      swapped,
      paths,
      used: Array.from(usedPoints),
      segments,
      doubleStepUsed
    }),
    importSnapshot: (str) => {
      try {
        const s = JSON.parse(str);
        if (s.v !== PROTOCOL_VERSION) return false;
        saveHistory();
        // 最低限の整合チェックは省略（用途により強化）
        // 深いコピーで代入
        swapped = !!s.swapped;
        paths[P1] = JSON.parse(JSON.stringify(s.paths[P1] || []));
        paths[P2] = JSON.parse(JSON.stringify(s.paths[P2] || []));
        usedPoints.clear(); (s.used||[]).forEach(k => usedPoints.add(k));
        segments.splice(0, segments.length, ...(s.segments||[]));
        doubleStepUsed = { ...(s.doubleStepUsed||{[P1]:false,[P2]:false}) };
        selected = null;
        currentPlayer = P1; // 必要ならスナップショットに含めて管理してください
        draw(); updateStatus(); updateCounters();
        return true;
      } catch { return false; }
    }
  };
  

``
