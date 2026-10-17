/* 포켓몬 사다리 대모험 — 화면·연출
 * 규칙은 rules.js, 문제는 quiz-math.js / quiz-en.js / learn.js, 읽어 줄 말은 voice-lines.js.
 * 여기서는 판을 그리고, 규칙 엔진이 묻는 것(io)을 화면으로 보여 주고 답을 받는다.
 */
"use strict";

const R = window.Rules;
const L = window.VoiceLines.L;
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QS = new URLSearchParams(location.search);
const TEST = QS.has("test");
const TRAINER = Object.fromEntries(R.TRAINERS.map((t) => [t.id, t]));
const ABORT = new Error("abort");
/** 받침에 맞는 조사: jo("형", "을", "를") → "형을" */
function jo(w, a, b) {
  const c = String(w).charCodeAt(String(w).length - 1);
  return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b);
}

// ---------- 저장 ----------
const Store = {
  KEY: "pokeladder_v1",
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY) || "null"); } catch (e) { this.data = null; }
    this.data = Object.assign({ settings: { sound: true, voice: true, fast: false }, setup: null, game: null, learn: {}, history: [] }, this.data || {});
    if (QS.has("reset")) this.data.game = null;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 공간 없음 */ } },
};
Store.load();

// ---------- 속도 ----------
const Speed = {
  get k() { return TEST ? 0.02 : Store.data.settings.fast ? 0.55 : 1; },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms * Speed.k)));

// ---------- 효과음 (WebAudio 칩튠) ----------
const SFX = {
  ctx: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(seq, type) {
    if (!Store.data.settings.sound || TEST) return;
    const c = this.ensure();
    if (!c) return;
    let t = c.currentTime;
    for (const [f, d, v] of seq) {
      if (f) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || "square";
        o.frequency.value = f;
        g.gain.setValueAtTime((v || 0.06), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + d);
      }
      t += d;
    }
  },
  step() { this.tone([[660, 0.05, 0.04]]); },
  dice() { this.tone([[300, 0.04], [500, 0.04], [400, 0.04], [700, 0.06]]); },
  up() { this.tone([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]]); },
  down() { this.tone([[880, 0.08], [740, 0.08], [587, 0.08], [440, 0.08], [330, 0.18]], "triangle"); },
  good() { this.tone([[784, 0.09], [1047, 0.2]]); },
  bad() { this.tone([[300, 0.12], [220, 0.22]], "sawtooth"); },
  card() { this.tone([[880, 0.05], [1175, 0.05], [1568, 0.12]], "triangle"); },
  alarm() { this.tone([[880, 0.12], [660, 0.12], [880, 0.12], [660, 0.12]], "sawtooth"); },
  win() { this.tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [784, 0.1], [1047, 0.35]]); },
  pop() { this.tone([[1200, 0.04], [1600, 0.05]], "triangle"); },
};

// ---------- 목소리 (Edge TTS 미리 녹음, 없으면 기기 목소리) ----------
const Voice = {
  el: null,
  queue: Promise.resolve(),
  token: 0,
  key(s) {
    return String(s).replace(/[\u{1F000}-\u{1FAFF}☀-➿️‍]/gu, "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
      .toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'가-힣]+/g, " ").trim();
  },
  unlock() {
    if (this.el) return;
    this.el = new Audio();
    this.el.preload = "auto";
    // iOS 사파리: 첫 터치 안에서 한 번 재생해 둬야 나중에 녹음이 나온다 (무음 wav)
    this.el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
    SFX.ensure();
  },
  stop() {
    this.token++;
    if (this.el) { try { this.el.pause(); } catch (e) { /* */ } }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  playOne(text, lang, my) {
    return new Promise((resolve) => {
      if (my !== this.token) return resolve();
      const file = window.VOICE && window.VOICE[this.key(text)];
      const done = () => resolve();
      if (file && this.el) {
        this.el.onended = done;
        this.el.onerror = done;
        this.el.src = "assets/voice/" + file;
        const p = this.el.play();
        if (p && p.catch) p.catch(done);
        setTimeout(done, 9000);
      } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = lang === "en-US" ? 0.85 : 1;
        u.onend = done; u.onerror = done;
        speechSynthesis.speak(u);
        setTimeout(done, 6000);
      } else resolve();
    });
  },
  /** 조각을 이어 읽는다. 새 말이 오면 하던 말은 끊는다. */
  speak(pieces, lang) {
    if (!Store.data.settings.voice || TEST) return Promise.resolve();
    this.stop();
    const my = this.token;
    const list = pieces.filter((x) => x != null && String(x).trim());
    const run = async () => { for (const p of list) { if (my !== this.token) return; await this.playOne(String(p), lang, my); } };
    return run();
  },
};
const say = (...pieces) => Voice.speak(pieces, "ko-KR");
const sayEn = (text) => Voice.speak([text], "en-US");
document.addEventListener("pointerdown", () => Voice.unlock(), { once: true });

// ---------- 그림 ----------
const IMG = {
  trainer: (id) => `assets/trainers/${id}.png`,
  poke: (n) => `assets/sprites/${n}.png`,
  pokeAnim: (n) => `assets/sprites/${n}.gif`,
  region: (r) => `assets/board/region-${r}.webp`,
  tile: (k) => `assets/icons/tile-${k}.png`,
  frame: (cat) => `assets/cards/frame-${cat}.webp`,
  cardIcon: (id) => { const c = R.CARDS[id]; return c.cat === "ability" ? IMG.poke(c.poke) : `assets/icons/${c.cat}-${c.icon}.png`; },
};
const CAT_NAME = { ability: "능력 카드", rocket: "로켓단 카드", event: "이벤트 카드" };

function cardHTML(id, extra) {
  const c = R.CARDS[id];
  const long = c.text.length > 15 ? "long" : "";
  return `<div class="card cat-${c.cat} ${long} ${extra || ""}" data-card="${id}">
    <img class="frame" src="${IMG.frame(c.cat)}" alt="">
    <div class="art"><img src="${IMG.cardIcon(id)}" alt=""></div>
    <div class="cname">${esc(c.name)}</div>
    <div class="ctext">${esc(c.text)}</div>
    ${c.who ? `<div class="cwho">${esc(c.who)}</div>` : ""}
  </div>`;
}
function trainerHTML(p, cls) {
  const t = TRAINER[p.trainer];
  return `<span class="tr ${cls || ""}"><img class="tr-img" src="${IMG.trainer(t.id)}" alt=""><img class="tr-poke" src="${IMG.poke(t.partner)}" alt=""></span>`;
}
function rocketHTML() {
  return `<span class="rk"><img src="assets/ui/rocket-jessie.png" alt=""><img src="assets/ui/rocket-james.png" alt=""><img class="rk-cat" src="assets/ui/rocket-meowth.png" alt=""></span>`;
}

// ---------- 화면 바꾸기 ----------
function show(html, cls) {
  closeLayers();
  const app = $("#app");
  app.className = cls || "";
  app.innerHTML = html;
  return app;
}
function layer(cls, html) {
  const d = document.createElement("div");
  d.className = "layer " + cls;
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}
function closeLayers(keep) { $$(".layer").forEach((d) => { if (!keep || !d.matches(keep)) d.remove(); }); }
/** 요소 안의 [data-v] 버튼 중 하나를 누를 때까지 기다린다 */
function waitPick(root, sel) {
  return new Promise((resolve, reject) => {
    G.reject = reject;
    root.addEventListener("click", function h(e) {
      const b = e.target.closest(sel || "[data-v]");
      if (!b || !root.contains(b) || b.disabled) return;
      root.removeEventListener("click", h);
      SFX.pop();
      G.reject = null;
      resolve(b.dataset.v);
    });
  });
}
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add("hidden"), ms || 1800);
}

// =====================================================================
// 처음 화면
// =====================================================================
function renderTitle() {
  G.stop();
  const g = Store.data.game;
  show(`
  <div class="title-screen">
    <div class="title-sky">
      <h1 class="logo"><span>포켓몬</span><b>사다리 대모험</b></h1>
      <div class="title-cast">${R.TRAINERS.map((t) => `<img src="${IMG.trainer(t.id)}" alt="${esc(t.name)}">`).join("")}</div>
    </div>
    <div class="title-menu win-box">
      ${g && g.winner == null ? `<button class="btn big primary" data-act="resume">▶ 이어하기 <small>${g.mode}칸 · ${g.round}라운드</small></button>` : ""}
      <button class="btn big ${g && g.winner == null ? "" : "primary"}" data-act="new">🎲 새 모험</button>
      <div class="row">
        <button class="btn" data-act="help">📖 방법</button>
        <button class="btn" data-act="parent">🔒 부모</button>
        <button class="btn" data-act="sound">${Store.data.settings.voice ? "🔊 목소리" : "🔇 목소리"}</button>
      </div>
    </div>
    <footer class="ver">v${APP_VERSION}<span id="updFoot"></span></footer>
    ${Update.ver ? `<button class="btn upd" data-act="update">🎁 새 버전으로 바꾸기</button>` : ""}
  </div>`, "screen-title");
  $(".title-menu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    SFX.pop();
    const a = b.dataset.act;
    if (a === "resume") resumeGame();
    if (a === "new") renderSetup();
    if (a === "help") showHelp();
    if (a === "parent") parentGate();
    if (a === "sound") { Store.data.settings.voice = !Store.data.settings.voice; Store.data.settings.sound = Store.data.settings.voice; Store.save(); renderTitle(); }
  });
  const u = $(".upd");
  if (u) u.onclick = () => applyUpdate();
  checkUpdate();
}

function showHelp() {
  const d = layer("modal help", `<div class="win-box">
    <h2>📖 이렇게 놀아요</h2>
    <ol class="help-list">
      <li>🎡 돌림판(One~Twelve)을 돌려서 앞으로! <b>100번 칸에 딱 맞게</b> 들어가면 골인! (넘치면 그 자리)</li><li>👣 다른 사람이 있는 칸에 멈추면 그 사람을 밟아요 → 밟힌 사람은 10칸 뒤로!</li>
      <li><img src="${IMG.tile("ladder")}" alt="" onerror="this.remove()">🪜 <b>사다리</b> 칸에 멈추면 위로, 🛝 <b>미끄럼틀</b> 칸에 멈추면 아래로.</li>
      <li><img src="${IMG.tile("quiz")}" alt=""> <b>퀴즈 칸</b>: 수학·영어 문제! 바로 맞히면 카드 또는 3칸.</li>
      <li><img src="${IMG.tile("card")}" alt=""> <b>카드 칸</b>: 카드를 뽑아요. 능력 카드는 내 차례에 1장 쓸 수 있어요.</li>
      <li><img src="${IMG.tile("rocket")}" alt=""> <b>로켓단 칸</b>: 로켓단에게 무슨 일이?!</li>
      <li>👿 모두 한 번씩 하면 <b>로켓단 차례</b>. 같은 칸에 멈추면 잡혀요 → 문제를 맞히면 탈출!</li>
      <li>⭐ 세 번째 차례마다 보너스 퀴즈!</li>
    </ol>
    <button class="btn big primary" data-v="ok">알겠어요!</button>
  </div>`);
  waitPick(d).then(() => d.remove()).catch(() => {});
}

// =====================================================================
// 시작 설정 (모드 · 인원 · 트레이너 · 이름 · 난이도)
// =====================================================================
const SHOW_200 = QS.has("200"); // 200칸은 숨김 — 주소에 ?200 을 붙이면 보인다
const DEFAULT_SETUP = {
  mode: 100,
  players: [
    { name: "지온이", trainer: "ash", adult: false, math: 3, en: 2 },
    { name: "엄마", trainer: "misty", adult: true, math: 4, en: 4 },
  ],
};
function renderSetup() {
  const st = JSON.parse(JSON.stringify(Store.data.setup || DEFAULT_SETUP));
  if (!SHOW_200) st.mode = 100; // 200칸은 지금 숨김 (2026-10-17 사용자 요청: 100칸만 오픈)
  st.cpus = (st.cpus || []).filter((id) => TRAINER[id]);
  const draw = () => {
    const solo = st.players.length === 1;
    const taken = st.players.map((p) => p.trainer);
    show(`
    <div class="setup">
      <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>새 모험 준비</h2><span></span></header>
      <section class="win-box modes">
        <button class="mode ${solo ? "on" : ""}" data-a="solo" data-v="1"><b>👤 혼자 하기</b><small>컴퓨터 친구 0~3명 · 로켓단보다 먼저 골인!</small></button>
        <button class="mode ${solo ? "" : "on"}" data-a="solo" data-v="0"><b>👥 같이 하기</b><small>2~4명 · 로켓단보다 먼저 골인!</small></button>
        ${SHOW_200 ? `<button class="mode ${st.mode === 200 ? "on" : ""}" data-a="mode" data-v="${st.mode === 200 ? 100 : 200}"><b>${st.mode === 200 ? "200칸" : "100칸"}</b><small>눌러서 바꾸기</small></button>` : ""}
      </section>
      <section class="players">
        ${st.players.map((p, i) => `
        <div class="win-box pl" style="--pc:${TRAINER[p.trainer].color}">
          <div class="pl-head">
            <span class="pl-num">${i + 1}P</span>
            <button class="pl-name" data-a="name" data-i="${i}">${esc(p.name)} ✏️</button>
            ${st.players.length > 2 ? `<button class="btn x" data-a="del" data-i="${i}" aria-label="빼기">✕</button>` : ""}
          </div>
          <div class="pl-trainers">
            ${R.TRAINERS.map((t) => `<button class="tpick ${p.trainer === t.id ? "on" : ""}" data-a="tr" data-i="${i}" data-v="${t.id}" ${taken.includes(t.id) && p.trainer !== t.id ? "disabled" : ""}>
              <img src="${IMG.trainer(t.id)}" alt=""><img class="tp-poke" src="${IMG.poke(t.partner)}" alt=""><span>${esc(t.name)}</span></button>`).join("")}
          </div>
          <div class="pl-levels">
            <button class="chip ${p.adult ? "" : "on"}" data-a="adult" data-i="${i}" data-v="0">🧒 아이</button>
            <button class="chip ${p.adult ? "on" : ""}" data-a="adult" data-i="${i}" data-v="1">🧑 어른</button>
            <span class="lv">수학 <button class="step" data-a="lv" data-k="math" data-i="${i}" data-v="-1">−</button><b>LV.${p.math}</b><button class="step" data-a="lv" data-k="math" data-i="${i}" data-v="1">+</button></span>
            <span class="lv">영어 <button class="step" data-a="lv" data-k="en" data-i="${i}" data-v="-1">−</button><b>LV.${p.en}</b><button class="step" data-a="lv" data-k="en" data-i="${i}" data-v="1">+</button></span>
          </div>
        </div>`).join("")}
        ${st.players.length < 4 && st.players.length > 1 ? `<button class="win-box add" data-a="add">➕ 한 명 더</button>` : ""}
        ${solo ? `<div class="win-box cpu-box">
          <div class="cpu-title">🤖 같이 달릴 컴퓨터 친구 <small>(0~3명 · 안 고르면 로켓단과 둘이서)</small></div>
          <div class="pl-trainers">${R.TRAINERS.filter((t) => t.id !== st.players[0].trainer).map((t) => `<button class="tpick ${st.cpus.includes(t.id) ? "on" : ""}" data-a="cpu" data-v="${t.id}" ${!st.cpus.includes(t.id) && st.cpus.length >= 3 ? "disabled" : ""}>
            <img src="${IMG.trainer(t.id)}" alt=""><img class="tp-poke" src="${IMG.poke(t.partner)}" alt=""><span>${esc(t.name)}</span></button>`).join("")}</div>
        </div>` : ""}
      </section>
      <footer class="setup-go"><button class="btn big primary" data-a="go">🚀 모험 출발!</button></footer>
    </div>`, "screen-setup");
  };
  draw();
  $("#app").onclick = async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b || b.disabled) return;
    SFX.pop();
    const a = b.dataset.a, i = +b.dataset.i;
    if (a === "back") return renderTitle();
    if (a === "mode") st.mode = +b.dataset.v;
    if (a === "solo") {
      if (b.dataset.v === "1") { st.together = st.players.slice(1); st.players = st.players.slice(0, 1); }
      else if (st.players.length === 1) {
        const back = (st.together || []).filter((p) => p.trainer !== st.players[0].trainer && p.name !== st.players[0].name);
        if (back.length) st.players.push(...back.slice(0, 3));
        else { const free = R.TRAINERS.find((t) => t.id !== st.players[0].trainer); st.players.push({ name: st.players[0].name === "엄마" ? "아빠" : "엄마", trainer: free.id, adult: true, math: 4, en: 4 }); }
      }
    }
    if (a === "tr") { st.players[i].trainer = b.dataset.v; st.cpus = st.cpus.filter((id) => id !== b.dataset.v); }
    if (a === "cpu") {
      const id = b.dataset.v;
      st.cpus = st.cpus.includes(id) ? st.cpus.filter((x) => x !== id) : st.cpus.concat(id).slice(0, 3);
    }
    if (a === "adult") {
      const ad = b.dataset.v === "1";
      st.players[i].adult = ad;
      st.players[i].math = ad ? 4 : 3;
      st.players[i].en = ad ? 4 : 2;
    }
    if (a === "lv") {
      const k = b.dataset.k, lo = k === "math" ? 2 : 1;
      st.players[i][k] = Math.max(lo, Math.min(4, st.players[i][k] + +b.dataset.v));
    }
    if (a === "del") st.players.splice(i, 1);
    if (a === "add") {
      const free = R.TRAINERS.find((t) => !st.players.some((p) => p.trainer === t.id));
      const used = st.players.map((p) => p.name);
      const nm = window.VoiceLines.NAMES.find((n) => !used.includes(n)) || "친구";
      st.players.push({ name: nm, trainer: free.id, adult: true, math: 4, en: 4 });
    }
    if (a === "name") {
      const nm = await askName(st.players[i].name, st.players.filter((_, k) => k !== i).map((p) => p.name));
      if (nm) st.players[i].name = nm;
    }
    if (a === "go") {
      Store.data.setup = st;
      Store.save();
      return startGame(st);
    }
    draw();
  };
}
function askName(cur, others) {
  return new Promise((resolve) => {
    const d = layer("modal", `<div class="win-box name-box">
      <h2>이름 정하기</h2>
      <div class="chips">${window.VoiceLines.NAMES.map((n) => `<button class="chip" data-v="${esc(n)}" ${others.includes(n) ? "disabled" : ""}>${esc(n)}</button>`).join("")}</div>
      <input id="nameIn" maxlength="8" value="${esc(cur)}" autocomplete="off">
      <div class="row"><button class="btn" data-x="cancel">취소</button><button class="btn primary" data-x="ok">좋아요</button></div>
    </div>`);
    d.onclick = (e) => {
      const c = e.target.closest("[data-v]");
      if (c && !c.disabled) { $("#nameIn", d).value = c.dataset.v; return; }
      const x = e.target.closest("[data-x]");
      if (!x) return;
      const v = $("#nameIn", d).value.trim().slice(0, 8);
      d.remove();
      resolve(x.dataset.x === "ok" && v && !others.includes(v) ? v : null);
    };
  });
}

// =====================================================================
// 게임
// =====================================================================
const G = {
  s: null, cell: 60, rows: 10, running: false, reject: null, current: 0, aborted: false, used: new Set(),
  stop() {
    this.aborted = true;
    this.running = false;
    if (this.reject) { const r = this.reject; this.reject = null; r(ABORT); }
    Voice.stop();
  },
};

function startGame(setup) {
  if (!SHOW_200) setup = Object.assign({}, setup, { mode: 100 });
  // 혼자하기 + 컴퓨터 친구 (관장들) 최대 3명
  if (setup.players.length === 1 && (setup.cpus || []).length) {
    setup = Object.assign({}, setup, { players: setup.players.concat(setup.cpus.slice(0, 3).map((id) => ({ name: TRAINER[id].name, trainer: id, cpu: true, adult: true, math: 4, en: 4 }))) });
  }
  const seed = QS.has("seed") ? +QS.get("seed") : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const s = R.createGame({ mode: setup.mode, seed, players: setup.players });
  s.players.forEach((p) => { p.qs = { n: 0, first: 0, hint: 0, explained: 0, fail: 0, math: 0, en: 0 }; p.lastSubj = p.adult ? "en" : "math"; });
  s.usedQ = [];
  s.started = Date.now();
  Store.data.game = s;
  Store.save();
  say(s.solo ? L.solo : L.newGame);
  runGame(s);
}
function resumeGame() {
  const s = Store.data.game;
  if (!s) return renderTitle();
  runGame(s);
}

async function runGame(s) {
  G.stop();
  G.aborted = false;
  G.s = s;
  G.used = new Set(s.usedQ || []);
  G.running = true;
  renderBoardScreen();
  try {
    while (s.winner == null && !G.aborted) {
      Store.data.game = s;
      s.usedQ = [...G.used];
      Store.save();
      await R.step(s, IO);
      renderPanel();
    }
  } catch (e) {
    if (e !== ABORT) { console.error(e); toast("앗, 문제가 생겼어요: " + e.message, 5000); }
    return;
  }
  if (G.aborted) return;
  Store.data.game = s;
  Store.save();
  await finishGame(s);
}

// ---------- 판 화면 ----------
// 실물 사다리 보드게임처럼: 줄마다 흙길이 굽이치고(끝에서 U자로 꺾임), 줄 사이는 덤불, 칸은 나무·돌 블록,
// 미끄럼틀은 무지개 원통, 사다리는 나무. 판이 화면을 거의 다 쓰도록 칸은 가로·세로 따로 잰다.
function renderBoardScreen() {
  const s = G.s;
  const map = R.MAPS[s.mode];
  G.rows = s.goal / 10;
  show(`
  <div class="game">
    <div class="board-frame"><div class="board-view" id="boardView"><div class="board" id="board"></div></div>
      <div class="turn-banner" id="turnBanner"></div>
      <div class="wheel-stage hidden" id="wheelStage">
        <div class="wheel-box">
          <div class="wheel-badge" id="wheelBadge"></div>
          <div class="wheel"><div class="wheel-disc" id="wheelDisc"></div><div class="wheel-pointer"></div>
            <button class="wheel-hub" id="rollBtn" disabled aria-label="돌림판 돌리기">돌려!</button></div>
          <div class="wheel-result" id="wheelResult"></div>
        </div>
      </div></div>
    <aside class="hud" id="hud">
      <div class="hud-top" id="hudTop"></div>
      <div class="turn-card" id="turnCard"></div>
      <div class="spin-result" id="spinResult"></div>
      <div class="hand" id="hand"></div>
      <ul class="plist" id="plist"></ul>
      <div class="msg" id="msg"><span id="msgText">${esc(L.title)}</span></div>
    </aside>
  </div>`, "screen-game mode-" + s.mode);
  layoutBoard();
  drawBoard(map);
  renderPanel();
  focusCell(s.players[s.turn].pos, true);
  window.onresize = () => { layoutBoard(); drawBoard(map); placeAll(true); };
}
function layoutBoard() {
  const v = $("#boardView");
  if (!v) return;
  const W = v.clientWidth, H = v.clientHeight;
  const vis = Math.min(G.rows, 10);
  G.cw = Math.max(30, Math.floor(W / 10));
  G.ch = Math.max(30, Math.floor(Math.min(H / vis, G.cw * 1.15)));
  G.cell = Math.min(G.cw, G.ch);
}
function cellCenter(n) {
  const { row, col } = R.cellXY(n);
  return { x: col * G.cw + G.cw / 2, y: (G.rows - 1 - row) * G.ch + G.ch / 2 };
}
const MARK_ICON = { quiz: "quiz", card: "card", rocket: "rocket" };
function drawBoard(map) {
  const b = $("#board");
  const cw = G.cw, ch = G.ch, s = G.s, rows = G.rows;
  const W = cw * 10, H = ch * rows;
  b.style.width = W + "px";
  b.style.height = H + "px";
  b.style.setProperty("--cw", cw + "px");
  b.style.setProperty("--ch", ch + "px");
  b.style.setProperty("--blk", Math.round(G.cell * 0.7) + "px");
  let h = "";
  // 풀밭 (지역마다 5줄)
  map.regions.forEach((rg, i) => {
    h += `<div class="region r-${rg}" style="bottom:${i * 5 * ch}px;height:${5 * ch}px;background-image:url(${IMG.region(rg)})"></div>`;
  });
  // 덤불 줄 (줄과 줄 사이 · 꺾이는 끝 칸은 비운다)
  const laneH = ch * 0.8;
  for (let r = 0; r < rows - 1; r++) {
    const y = (rows - 1 - r) * ch;
    const turnRight = r % 2 === 0;
    const x0 = turnRight ? 0 : cw, x1 = turnRight ? W - cw : W;
    h += `<div class="hedge" style="left:${x0}px;width:${x1 - x0}px;top:${y - ch * 0.16}px;height:${ch * 0.32}px"></div>`;
  }
  // 흙길: 줄마다 한 줄 + 끝의 U자 꺾임
  for (let r = 0; r < rows; r++) {
    const yc = (rows - 1 - r) * ch + ch / 2;
    h += `<div class="lane" style="left:${cw * 0.06}px;width:${W - cw * 0.12}px;top:${yc - laneH / 2}px;height:${laneH}px"></div>`;
    if (r < rows - 1) {
      const right = r % 2 === 0;
      const x = right ? W - cw * 0.94 : cw * 0.06;
      h += `<div class="lane turn ${right ? "tr" : "tl"}" style="left:${x}px;width:${cw * 0.88}px;top:${yc - ch - laneH / 2}px;height:${ch + laneH}px"></div>`;
    }
  }
  // 지역 이름 팻말 (200칸)
  if (map.regions.length > 2) map.regions.forEach((rg, i) => {
    const y = (rows - 1 - i * 5) * ch;
    h += `<div class="sign" style="top:${y + ch * 0.05}px">${esc(R.REGION_NAMES[rg])}</div>`;
  });
  // 칸 블록
  let nums = "";
  for (let n = 1; n <= s.goal; n++) {
    const p = cellCenter(n);
    const t = R.cellType(map, n);
    const stone = n % 2 === 0;
    const cls = ["cell", stone ? "stone" : "wood", t ? "t-" + t : "", n === 1 ? "t-start" : "", n === s.goal ? "t-goal" : ""].join(" ");
    let mark = "";
    if (MARK_ICON[t]) mark = `<img class="mk" src="${IMG.tile(MARK_ICON[t])}" alt="">`;
    if (t === "ladder") mark = `<span class="go up">▲${map.ladders[n]}</span>`;
    if (t === "slide") mark = `<span class="go down">▼${map.slides[n]}</span>`;
    const label = n === 1 ? `<span class="tag-start">출발</span>` : n === s.goal ? `<span class="tag-goal">도착</span>` : "";
    h += `<div class="${cls}" data-n="${n}" style="left:${p.x - cw / 2}px;top:${p.y - ch / 2}px"><span class="blk">${mark}</span>${label}</div>`;
    // 숫자는 미끄럼틀·사다리보다 위층 (가려지면 몇 번 칸인지 못 읽는다)
    nums += `<b class="num ${t ? "n-" + t : ""} ${n === s.goal ? "n-goal" : ""}" style="left:${p.x - cw / 2}px;top:${p.y - ch / 2}px">${n}</b>`;
  }
  h += `<div class="nums">${nums}</div>`;
  // 사다리·미끄럼틀 (SVG 한 장)
  h += `<svg class="chutes" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${chuteSVG(map)}</svg>`;
  s.players.forEach((p, i) => { h += `<div class="piece" id="pc${i}" style="--pc:${TRAINER[p.trainer].color}">${trainerHTML(p)}<span class="tag">${esc(p.name)}</span></div>`; });
  h += `<div class="piece rocket" id="pcR">${rocketHTML()}</div>`;
  b.innerHTML = h;
  placeAll(true);
}
/** 무지개 원통 미끄럼틀 · 나무 사다리 */
function chuteSVG(map) {
  const u = G.cell;
  let out = "";
  for (const k in map.ladders) {
    const a = cellCenter(+k), z = cellCenter(map.ladders[k]);
    const dx = z.x - a.x, dy = z.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, w = u * 0.2;
    const rail = (sgn) => `M${a.x + nx * w * sgn},${a.y + ny * w * sgn} L${z.x + nx * w * sgn},${z.y + ny * w * sgn}`;
    let rungs = "";
    const step = u * 0.3, cnt = Math.floor(len / step);
    for (let i = 1; i < cnt; i++) {
      const t = i / cnt, cx = a.x + dx * t, cy = a.y + dy * t;
      rungs += `M${cx - nx * w},${cy - ny * w} L${cx + nx * w},${cy + ny * w} `;
    }
    out += `<g class="ladder"><path d="${rungs}" class="rung-o"/><path d="${rungs}" class="rung"/><path d="${rail(1)} ${rail(-1)}" class="rail-o"/><path d="${rail(1)} ${rail(-1)}" class="rail"/></g>`;
  }
  let i = 0;
  for (const k in map.slides) {
    const a = cellCenter(+k), z = cellCenter(map.slides[k]);
    const dx = z.x - a.x, dy = z.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, bend = Math.min(len * 0.22, u * 1.4) * (i++ % 2 ? 1 : -1);
    const c1 = `${a.x + dx * 0.3 + nx * bend},${a.y + dy * 0.3 + ny * bend}`;
    const c2 = `${a.x + dx * 0.7 - nx * bend},${a.y + dy * 0.7 - ny * bend}`;
    const d = `M${a.x},${a.y} C${c1} ${c2} ${z.x},${z.y}`;
    const w = u * 0.34, seg = w * 1.05;
    const band = (col, k2) => `<path d="${d}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${seg} ${seg * 3}" stroke-dashoffset="${-seg * k2}" class="band"/>`;
    out += `<g class="slide"><path d="${d}" class="tube-o" stroke-width="${w + 5}"/>${band("#e8453c", 0)}${band("#f7c33b", 1)}${band("#3a8fe0", 2)}${band("#3fb35a", 3)}
      <path d="${d}" class="tube-hi" stroke-width="${w * 0.22}" transform="translate(${-w * 0.18},${-w * 0.18})"/>
      <ellipse cx="${a.x}" cy="${a.y}" rx="${w * 0.72}" ry="${w * 0.6}" class="mouth"/><ellipse cx="${a.x}" cy="${a.y}" rx="${w * 0.45}" ry="${w * 0.36}" class="hole"/>
      <circle cx="${z.x}" cy="${z.y}" r="${w * 0.55}" class="exit"/></g>`;
  }
  return out;
}
/** 같은 칸에 여럿이면(출발 칸·로켓단) 조금씩 비켜 선다 */
function slotOffset(n, who) {
  const s = G.s;
  const here = s.players.map((p, i) => (p.pos === n ? "p" + i : null)).filter(Boolean);
  if (s.rocket.pos === n) here.push("R");
  const k = here.indexOf(who);
  if (here.length <= 1 || k < 0) return { x: 0, y: 0, sc: 1 };
  const spots = [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6], [0, 0]];
  const [sx, sy] = spots[k % spots.length];
  return { x: sx * G.cw * 0.24, y: sy * G.ch * 0.22, sc: 0.74 };
}
function placePiece(el, n, who, instant) {
  if (!el) return;
  const p = cellCenter(n), o = slotOffset(n, who);
  const size = G.cell;
  if (instant) el.style.transition = "none";
  el.style.width = el.style.height = size + "px";
  el.style.left = p.x - size / 2 + o.x + "px";
  el.style.top = p.y - size * 0.62 + o.y + "px";
  el.style.setProperty("--sc", o.sc);
  if (instant) { void el.offsetWidth; el.style.transition = ""; }
}
function placeAll(instant) {
  const s = G.s;
  if (!s) return;
  s.players.forEach((p, i) => placePiece($("#pc" + i), p.pos, "p" + i, instant));
  placePiece($("#pcR"), s.rocket.pos, "R", instant);
  markDanger();
}
function markDanger() {
  const s = G.s;
  s.players.forEach((p, i) => {
    const el = $("#pc" + i);
    if (!el) return;
    el.dataset.danger = R.danger(s, i);
    el.classList.toggle("now", i === G.current && s.phase === "players");
  });
}
/** 카메라: 그 칸이 보이게 (200칸은 위아래로 따라간다) */
function focusCell(n, instant) {
  const v = $("#boardView");
  if (!v) return;
  const y = cellCenter(n).y;
  const top = Math.max(0, y - v.clientHeight / 2);
  if (Math.abs(v.scrollTop - top) < G.ch * 1.5 && !instant) return;
  v.scrollTo({ top, behavior: instant || TEST ? "auto" : "smooth" });
}
function setMsg(t) {
  const m = $("#msgText");
  if (m) { m.textContent = t; m.parentElement.classList.remove("fresh"); void m.offsetWidth; m.parentElement.classList.add("fresh"); }
}
/** 차례 띠: 판 위로 쓱 지나간다 (기다리지 않음) */
function turnBanner(html, rocket) {
  const b = $("#turnBanner");
  if (!b) return;
  b.innerHTML = html;
  b.className = "turn-banner" + (rocket ? " rocket" : "");
  void b.offsetWidth;
  b.classList.add("go");
}

/** 말을 한 칸씩 걸어서 (사다리·미끄럼틀은 쭉) */
async function animateMove(who, from, to, mode) {
  const el = who === "R" ? $("#pcR") : $("#pc" + who);
  if (!el) return;
  const key = who === "R" ? "R" : "p" + who;
  const setPos = (n) => { if (who === "R") G.s.rocket.pos = n; else G.s.players[who].pos = n; };
  const final = to;
  if (mode === "walk" && Math.abs(to - from) <= 24 && from !== to) {
    const d = to > from ? 1 : -1;
    el.classList.add("walking");
    for (let n = from + d; d > 0 ? n <= to : n >= to; n += d) {
      setPos(n);
      placePiece(el, n, key);
      focusCell(n);
      SFX.step();
      await sleep(150);
    }
    el.classList.remove("walking");
  } else {
    el.classList.add(mode === "slide" ? "sliding" : mode === "ladder" ? "climbing" : "warping");
    setPos(final);
    placePiece(el, final, key);
    focusCell(final);
    await sleep(mode === "warp" ? 450 : 750);
    el.classList.remove("sliding", "climbing", "warping");
  }
  setPos(final);
  placeAll();
}

// ---------- 오른쪽 HUD ----------
function renderPanel(opt) {
  const s = G.s;
  if (!s || !$("#hud")) return;
  opt = opt || {};
  const cur = s.players[G.current] || s.players[0];
  const rocketPhase = s.phase === "rocket";
  const slot = (id, k) => id ? `<button class="mini-card cat-${R.CARDS[id].cat}" data-card="${id}" data-slot="${k}"><img src="${IMG.cardIcon(id)}" alt=""><span>${esc(R.CARDS[id].name)}</span></button>` : `<span class="mini-card empty">${k === "held" ? "일반 칸" : "능력 칸"}</span>`;
  $("#hudTop").innerHTML = `
      <button class="icon-btn" data-p="home" aria-label="처음으로">🏠</button>
      <span class="round"><b>${s.round}</b>라운드</span>
      <button class="icon-btn" data-p="voice" aria-label="목소리">${Store.data.settings.voice ? "🔊" : "🔇"}</button>
      <button class="icon-btn" data-p="fast" aria-label="빠르기">${Store.data.settings.fast ? "⏩" : "▶️"}</button>`;
  const tc = $("#turnCard");
  tc.className = "turn-card" + (rocketPhase ? " rocket-turn" : "");
  tc.style.setProperty("--pc", rocketPhase ? "#2b2b2b" : TRAINER[cur.trainer].color);
  tc.innerHTML = rocketPhase ? `${rocketHTML()}<div><b>로켓단</b><small>차례다옹!</small></div>`
    : `${trainerHTML(cur, "big")}<div><b>${esc(cur.name)}</b><small>${cur.pos}번 칸</small></div>`;
  const sr = $("#spinResult");
  const ls = G.lastSpin;
  sr.className = "spin-result" + (ls && ls.rocket ? " rocket" : "");
  sr.innerHTML = ls ? `<small>${ls.rocket ? "로켓단 돌림판" : esc(ls.name) + "의 돌림판"}</small><b>${ls.words}</b><i>${ls.total}칸</i>`
    : rocketPhase ? `<small>로켓단 돌림판</small><b>?</b><i>로켓단이 돌려요</i>` : `<small>돌림판</small><b>?</b><i>판 가운데를 눌러요</i>`;
  $("#hand").innerHTML = rocketPhase ? "" : `<div class="slots">${slot(cur.ability[0], "ability")}${slot(cur.ability[1], "ability")}${slot(cur.held, "held")}</div>`;
  $("#hand").classList.toggle("hidden", rocketPhase);
  $("#plist").innerHTML = s.players.map((p, i) => {
    const dg = R.danger(s, i);
    const n = p.ability.length + (p.held ? 1 : 0);
    return `<li class="${i === G.current && !rocketPhase ? "now" : ""} dg-${dg}" style="--pc:${TRAINER[p.trainer].color}">
        ${trainerHTML(p, "sm")}<span class="pname">${p.cpu ? "🤖 " : ""}${esc(p.name)}<i class="pst">${p.st.skip ? "💤" : ""}${p.st.minus6 ? "🐌-6" : ""}${p.st.minus2 ? "🚧-2" : ""}${p.st.safe ? "🛡️" : ""}${n ? "🃏" + n : ""}${dg === "danger" ? " 🚨" : dg === "caution" ? " ⚠️" : ""}</i></span><b class="ppos">${p.pos}</b>
      </li>`;
  }).join("") + `<li class="rocket-row">${rocketHTML()}<span class="pname">로켓단<i class="pst">${s.rocket.skip ? "💤" : ""}${s.rocket.double ? "🔥×2" : ""}${s.rocket.reverse ? "🔄" : ""}</i></span><b class="ppos">${s.rocket.pos}</b></li>`;
  const hud = $("#hud");
  hud.onclick = (e) => {
    const b = e.target.closest("[data-p]");
    if (b) {
      SFX.pop();
      if (b.dataset.p === "home") { G.stop(); renderTitle(); }
      if (b.dataset.p === "voice") { Store.data.settings.voice = !Store.data.settings.voice; Store.data.settings.sound = Store.data.settings.voice; Store.save(); b.textContent = Store.data.settings.voice ? "🔊" : "🔇"; }
      if (b.dataset.p === "fast") { Store.data.settings.fast = !Store.data.settings.fast; Store.save(); b.textContent = Store.data.settings.fast ? "⏩" : "▶️"; toast(Store.data.settings.fast ? "빠르게 보기" : "보통 빠르기"); }
      return;
    }
    const c = e.target.closest(".mini-card[data-card]");
    if (c && !G.actionWait) showCardInfo(c.dataset.card);
  };
  markDanger();
}

// ---------- 돌림판 (주사위 대신, 2026-10-17 사용자 요청) ----------
// 사람 = 12칸 One~Twelve, 로켓단 = 8칸 One~Eight. 판 가운데에 뜨고 가운데 버튼을 눌러 돌린다.
const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const WHEEL_COLORS = ["#e8453c", "#f7c33b", "#3a8fe0", "#3fb35a"];
const ROCKET_COLORS = ["#c0262d", "#2b2b2b"];
const Wheel = {
  n: 0, rot: 0, rocket: false,
  build(n, rocket) {
    const disc = $("#wheelDisc");
    if (!disc) return;
    this.n = n; this.rocket = rocket; this.rot = 0;
    const seg = 360 / n, R0 = 96;
    const pt = (a, r) => `${(r * Math.sin(a * Math.PI / 180)).toFixed(2)},${(-r * Math.cos(a * Math.PI / 180)).toFixed(2)}`;
    let g = "";
    for (let k = 1; k <= n; k++) {
      const a0 = (k - 1) * seg - seg / 2, a1 = a0 + seg, mid = (k - 1) * seg;
      const col = rocket ? ROCKET_COLORS[(k - 1) % 2] : WHEEL_COLORS[(k - 1) % 4];
      const dark = !rocket && col === "#f7c33b";
      g += `<path d="M0,0 L${pt(a0, R0)} A${R0},${R0} 0 0 1 ${pt(a1, R0)} Z" fill="${col}" class="wedge" data-k="${k}"/>`;
      // 칸 폭(현) 안에 들어가게: 길면 글자 폭을 줄인다 (Twelve·Eleven 이 옆 칸과 겹치지 않게)
      const r = R0 * (n > 8 ? 0.74 : 0.7), chord = 2 * r * Math.sin(Math.PI / n) * 0.88, fs = n > 8 ? 11 : 15;
      const fit = WORDS[k].length * fs * 0.62 > chord ? ` textLength="${chord.toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : "";
      g += `<text transform="rotate(${mid})" x="0" y="${-r}" class="wword ${dark ? "dark" : ""}" font-size="${fs}"${fit}>${WORDS[k]}</text>`;
      g += `<circle cx="${pt(a0, R0 - 3).split(",")[0]}" cy="${pt(a0, R0 - 3).split(",")[1]}" r="2.6" class="stud"/>`;
    }
    disc.innerHTML = `<svg viewBox="-100 -100 200 200"><circle r="99" class="rim"/>${g}<circle r="96" class="rim-in"/></svg>`;
    disc.style.transition = "none";
    disc.style.transform = "rotate(0deg)";
  },
  show(n, badge, rocket) {
    const st = $("#wheelStage");
    if (!st) return;
    // 판을 새로 시작하면 돌림판 자리가 비어 있다 → 칸 수가 같아도 다시 그린다 (친구↔혼자 오갈 때 투명해지던 버그)
    const disc = $("#wheelDisc");
    if (this.n !== n || this.rocket !== !!rocket || !disc || !disc.querySelector("svg")) this.build(n, !!rocket);
    st.classList.remove("hidden");
    st.classList.toggle("rocket", !!rocket);
    $("#wheelBadge").innerHTML = badge;
    $("#wheelResult").innerHTML = rocket ? "로켓단이 돌린다옹!" : "가운데를 눌러서 돌려요!";
    $("#rollBtn").textContent = rocket ? "👿" : "돌려!";
    this.enable(false);
  },
  hide() { const st = $("#wheelStage"); if (st) st.classList.add("hidden"); },
  enable(on) { const h = $("#rollBtn"); if (h) { h.disabled = !on; h.classList.toggle("ready", !!on); } },
  /** v 칸이 위쪽 바늘에 오도록 돌린다 */
  async spinTo(v) {
    const disc = $("#wheelDisc");
    if (!disc) return;
    const seg = 360 / this.n;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const target = -(v - 1) * seg + jitter;
    const cur = this.rot;
    const delta = (((target - cur) % 360) + 360) % 360;
    this.rot = cur + 360 * (TEST ? 1 : 4) + delta;
    const dur = TEST ? 0.03 : 2.6;
    disc.style.transition = `transform ${dur}s cubic-bezier(.12,.68,.18,1)`;
    disc.style.transform = `rotate(${this.rot}deg)`;
    $("#wheelResult").innerHTML = "빙글빙글…";
    // 칸을 지날 때마다 딸깍
    if (!TEST) {
      let last = Math.floor(cur / seg);
      const t0 = performance.now();
      while (performance.now() - t0 < dur * 1000) {
        await new Promise((r) => requestAnimationFrame(r));
        const m = getComputedStyle(disc).transform;
        if (m && m !== "none") {
          const [a, b] = m.slice(7, -1).split(",").map(Number);
          const ang = Math.atan2(b, a) * 180 / Math.PI;
          const k = Math.floor(ang / seg);
          if (k !== last) { last = k; SFX.step(); }
        }
      }
    } else await sleep(60);
    $$(".wedge", disc).forEach((w) => w.classList.toggle("win", +w.dataset.k === v));
  },
};
function wheelBadge(p) {
  return `${trainerHTML(p, "big")}<div><b>${esc(p.name)}</b><span>${p.cpu ? "🤖 컴퓨터 차례" : "차례!"}</span></div>`;
}
function rocketBadge() {
  return `${rocketHTML()}<div><b>로켓단</b><span>차례다옹!</span></div>`;
}
/** 돌림판 결과 보여 주기 (여러 번 돌리면 차례로) */
async function spinShow(values, rocket, who) {
  const words = [];
  for (let i = 0; i < values.length; i++) {
    await Wheel.spinTo(values[i]);
    words.push(WORDS[values[i]]);
    $("#wheelResult").innerHTML = `<b>${WORDS[values[i]]}!</b> <span>${values[i]}칸</span>`;
    sayEn(WORDS[values[i]]);
    SFX.good();
    await sleep(values.length > 1 && i < values.length - 1 ? 900 : 650);
  }
  const total = values.reduce((a, b) => a + b, 0);
  if (values.length > 1) $("#wheelResult").innerHTML = `<b>${words.join(" + ")}</b> <span>= ${total}칸</span>`;
  G.lastSpin = { rocket: !!rocket, name: rocket ? "로켓단" : G.s.players[who].name, words: words.join(" + "), total };
  await sleep(values.length > 1 ? 700 : 250);
}

function showCardInfo(id, useBtn) {
  const d = layer("modal card-modal", `<div class="card-big">${cardHTML(id, "big")}</div>
    <div class="row">${useBtn ? `<button class="btn big primary" data-v="use">✨ 쓰기</button>` : ""}<button class="btn big" data-v="close">${useBtn ? "안 쓸래요" : "닫기"}</button></div>`);
  say(R.CARDS[id].name);
  return waitPick(d).then((v) => { d.remove(); return v; });
}

// =====================================================================
// 규칙 엔진 ↔ 화면 (io)
// =====================================================================
const IO = {
  async show(e) {
    if (G.aborted) throw ABORT;
    const s = G.s;
    const P = (i) => s.players[i];
    const nm = (i) => P(i).name;
    switch (e.type) {
      case "turn":
        G.current = e.who;
        G.lastSpin = null;
        Wheel.show(12, wheelBadge(P(e.who)), false);
        renderPanel();
        focusCell(P(e.who).pos);
        setMsg(`${nm(e.who)}의 차례!`);
        turnBanner(`${trainerHTML(P(e.who), "big")}<b>${esc(nm(e.who))}</b><span>차례!</span>`);
        say(nm(e.who), L.turn); // 기다리지 않는다 (사용자 피드백: 차례 안내가 너무 길다)
        await sleep(250);
        break;
      case "skip":
        Wheel.hide();
        setMsg(`💤 ${nm(e.who)}: ${L.skip}`);
        say(L.skip); await sleep(600);
        renderPanel();
        break;
      case "card-use": {
        Wheel.hide(); // 카드가 판을 움직이는 게 보이게
        const c = R.CARDS[e.card];
        setMsg(`✨ ${nm(e.who)}: ${c.name}!`);
        SFX.card();
        const d = layer("flash-card", cardHTML(e.card, "big pop"));
        say(c.name);
        await sleep(1100);
        d.remove();
        renderPanel();
        break;
      }
      case "dice":
        Wheel.show(12, wheelBadge(P(e.who)), false);
        await spinShow(e.dice, false, e.who);
        Wheel.hide();
        renderPanel();
        setMsg(`🎲 ${e.dice.join(" + ")}${e.dice.length > 1 ? " = " + e.dice.reduce((a, b) => a + b, 0) : ""}!${e.lucky ? " (행운의 숫자)" : ""}`);
        say(String(e.dice.reduce((a, b) => a + b, 0)));
        await sleep(350);
        break;
      case "modify": {
        const t = e.mods.includes("minus6") ? L.minus6 : L.minus2;
        setMsg(`${e.mods.includes("minus6") ? "🐌" : "🚧"} ${t} → ${e.move > 0 ? "+" : ""}${e.move}칸`);
        say(t);
        await sleep(700);
        break;
      }
      case "move":
        await animateMove(e.who, e.from, e.to, e.via === "dice" || e.via === "reward" || e.via === "penalty" || (e.via === "card" && Math.abs(e.to - e.from) <= 15) ? "walk" : "warp");
        renderPanel();
        break;
      case "chute":
        setMsg(e.kind === "ladder" ? `🪜 ${L.ladder} ${e.from} → ${e.to}` : `🛝 ${L.slide} ${e.from} → ${e.to}`);
        e.kind === "ladder" ? SFX.up() : SFX.down();
        say(e.kind === "ladder" ? L.ladder : L.slide);
        await animateMove(e.who, e.from, e.to, e.kind);
        renderPanel();
        break;
      case "stomp": {
        // 밟기: 내가 멈춘 칸에 있던 캐릭터는 10칸 뒤로 (2026-10-17 사용자 요청)
        setMsg(`💥 ${jo(nm(e.who), "이", "가")} ${jo(nm(e.victim), "을", "를")} 밟았다! ${nm(e.victim)} ${e.from} → ${e.to}`);
        say(L.stomp);
        const el = $("#pc" + e.victim);
        if (el) el.classList.add("squashed");
        SFX.bad();
        await sleep(650);
        if (el) el.classList.remove("squashed");
        await animateMove(e.victim, e.from, e.to, "slide");
        renderPanel();
        break;
      }
      case "over":
        setMsg(`🎯 ${nm(e.who)}: 도착까지 딱 ${e.need}칸! ${e.want}칸은 넘쳐서 그 자리에 있어요.`);
        say(L.over);
        { const el = $("#pc" + e.who); if (el) { el.classList.add("target"); await sleep(700); el.classList.remove("target"); } }
        break;
      case "stay":
        setMsg(L.stay); say(L.stay); await sleep(500); break;
      case "cell": {
        const t = { quiz: L.cellQuiz, card: L.cellCard, rocket: L.cellRocket }[e.cell];
        setMsg(t);
        const c = $(`.cell[data-n="${P(e.who).pos}"]`);
        if (c) { c.classList.add("ping"); setTimeout(() => c.classList.remove("ping"), 1200); }
        say(t);
        await sleep(400);
        break;
      }
      case "draw":
        await revealCard(e.who, e.card, e.from);
        renderPanel();
        break;
      case "effect": break;
      case "swap": setMsg(`🔄 ${nm(e.who)} ↔ ${nm(e.target)} ${L.swap}`); say(L.swap); await sleep(500); break;
      case "status":
        setMsg(`🐌 잠만보 길막기! ${nm(e.target)}: 다음 이동 -6칸!`); renderPanel(); await sleep(900); break;
      case "psyduck":
        setMsg(`🌀 로켓단이 ${e.dir > 0 ? "앞으로" : "뒤로"} ${e.n}칸 휘청!`); await sleep(900); break;
      case "lullaby":
        setMsg(e.ok ? `💤 ${nm(e.target)}: ${L.lullabyOk}` : `😳 ${L.lullabyFail}`);
        await coinFlip(e.ok);
        say(e.ok ? L.lullabyOk : L.lullabyFail);
        renderPanel();
        break;
      case "steal":
        setMsg(`😼 ${nm(e.who)}: ${L.steal} (${R.CARDS[e.card].name})`); say(L.steal); await sleep(500); break;
      case "reward":
        if (e.why === "stamp") { setMsg(`⭐ ${L.stamp}`); say(L.stamp); await sleep(500); }
        else if (e.why === "challenge-miss") { setMsg(L.challengeMiss); say(L.challengeMiss); }
        else await rewardPop(e.who, e.move, e.why);
        break;
      case "nothing": setMsg(L.nothing); say(L.nothing); await sleep(400); break;
      case "bonus-quiz": setMsg(`⭐ ${L.bonus}`); say(L.bonus); await sleep(300); break;
      case "regroup":
        setMsg(`💨 ${L.regroup}`); say(L.regroup);
        await animateMove("R", e.from, e.to, "warp"); break;
      case "rocket-turn":
        G.current = -1;
        G.lastSpin = null;
        Wheel.show(8, rocketBadge(), true);
        renderPanel();
        focusCell(s.rocket.pos);
        setMsg(`👿 ${L.rocketTurn}`);
        turnBanner(`${rocketHTML()}<b>로켓단</b><span>차례다옹!</span>`, true);
        say(L.rocketTurn);
        await sleep(250);
        break;
      case "rocket-rest":
        Wheel.hide();
        setMsg(`💤 ${L.rocketRest}`); say(L.rocketRest); await sleep(500); break;
      case "rocket-dice":
        Wheel.show(8, rocketBadge(), true);
        await spinShow(e.dice, true);
        Wheel.hide();
        renderPanel();
        setMsg(e.dir > 0 ? `👿 ${e.dice.map((v) => WORDS[v]).join(" + ")}! 로켓단이 앞으로 달린다옹!` : `🔄 방향 전환! 로켓단이 뒤로 간다옹~`);
        say(L.rocketChase);
        break;
      case "rocket-over":
        setMsg(`👿 로켓단도 딱 맞아야 도착! ${e.want}칸은 넘쳐서 그 자리다옹.`);
        say(L.rocketOver);
        await sleep(700);
        break;
      case "rocket-win": {
        SFX.alarm();
        const d = layer("capture-scene rocket-win", `<div class="cap-bg"></div><div class="cap-rocket">${rocketHTML()}</div>
          <div class="cap-line win-box"><span>🏁 ${esc(L.rocketWin)}</span></div>`);
        setMsg(`🏁 ${L.rocketWin}`);
        say(L.rocketWin);
        await sleep(2400);
        d.remove();
        break;
      }
      case "rocket-move":
        await animateMove("R", e.from, e.to, e.via === "dice" || Math.abs(e.to - e.from) <= 12 ? "walk" : "warp");
        renderPanel();
        break;
      case "rocket-chute":
        setMsg(e.kind === "ladder" ? `👿🪜 로켓단도 사다리! ${e.from} → ${e.to}` : `👿🛝 로켓단도 미끄럼틀! ${e.from} → ${e.to}`);
        e.kind === "ladder" ? SFX.up() : SFX.down();
        await animateMove("R", e.from, e.to, e.kind);
        renderPanel();
        break;
      case "rocket-warp":
        if (e.why === "kick") await kickScene(e);
        else {
          setMsg(`💥 ${L.rocketWarp}`);
          say(L.rocketWarp);
          await animateMove("R", e.from, e.to, "warp");
        }
        renderPanel();
        break;
      case "capture": await captureScene(e.who); break;
      case "capture-safe": await captureLine(`🛡️ ${L.safe}`, L.safe); break;
      case "defend": await captureLine(`💧 ${R.CARDS[e.card].name}! ${L.defend}`, L.defend); break;
      case "escaped": await captureLine(`🎉 ${L.escaped}`, L.escaped); break;
      case "escape-fail": await captureLine(`😢 ${L.escapeFail}`, L.escapeFail); break;
      case "win": break;
    }
    if (G.aborted) throw ABORT;
  },

  async choose(kind, data) {
    if (G.aborted) throw ABORT;
    const s = G.s;
    const P = (i) => s.players[i];
    if (TEST && window.__T && window.__T.auto && kind !== "action") return window.__T.auto(kind, data);
    if (data && data.who != null && P(data.who) && P(data.who).cpu) return cpuChoose(kind, data);
    switch (kind) {
      case "action": return chooseAction(data);
      case "spin": return chooseSpin(data);
      case "target": {
        const c = R.CARDS[data.card];
        say(L.pickTarget);
        const d = layer("modal", `<div class="win-box pick-box"><h2>${esc(c.name)}: ${esc(L.pickTarget)}</h2>
          <div class="pick-row">${data.options.map((i) => `<button class="pick-p" data-v="${i}" style="--pc:${TRAINER[P(i).trainer].color}">${trainerHTML(P(i), "big")}<b>${esc(P(i).name)}</b><small>${P(i).pos}번 칸</small></button>`).join("")}</div></div>`);
        const v = await waitPick(d); d.remove(); return +v;
      }
      case "direction": {
        const c = R.CARDS[data.card];
        say(L.pickDir);
        const who = data.target != null ? P(data.target).name + "의 " : "로켓단을 ";
        const d = layer("modal", `<div class="win-box pick-box"><h2>${esc(c.name)}: ${esc(L.pickDir)}</h2>
          <div class="row"><button class="btn big" data-v="-1">⬅ ${esc(who)}${data.n}칸 뒤</button><button class="btn big primary" data-v="1">${esc(who)}${data.n}칸 앞 ➡</button></div></div>`);
        const v = await waitPick(d); d.remove(); return +v;
      }
      case "cell": return chooseCell(data);
      case "pick": {
        say(L.pickTwo);
        const d = layer("modal", `<div class="win-box pick-box"><h2>${esc(L.pickTwo)}</h2>
          <div class="pick-row cards">${data.cards.map((id, k) => `<button class="pick-c" data-v="${k}">${cardHTML(id)}</button>`).join("")}</div></div>`);
        const v = await waitPick(d); d.remove(); return +v;
      }
      case "discard": {
        say(L.full);
        const all = data.have.concat([data.add]);
        const d = layer("modal", `<div class="win-box pick-box"><h2>🃏 ${esc(L.full)}</h2>
          <div class="pick-row cards">${all.map((id, k) => `<button class="pick-c ${k === all.length - 1 ? "new" : ""}" data-v="${id}">${cardHTML(id)}${k === all.length - 1 ? '<span class="badge-new">새 카드</span>' : ""}<span class="drop">🗑 버리기</span></button>`).join("")}</div></div>`);
        const v = await waitPick(d); d.remove(); return v;
      }
      case "reward": {
        say(L.rewardPick);
        const d = layer("modal", `<div class="win-box pick-box reward"><h2>🎉 ${esc(L.great)}</h2>
          <div class="row"><button class="btn big primary" data-v="card">🃏 능력 카드 받기</button><button class="btn big" data-v="move">🎲 ${data.min}~${data.max}칸 앞으로</button></div></div>`);
        const v = await waitPick(d); d.remove(); return v;
      }
      case "reroll": {
        say(L.reroll);
        const d = layer("modal", `<div class="win-box pick-box"><h2>🎡 ${data.dice.map((v) => WORDS[v]).join(" + ")} — ${esc(L.reroll)}</h2><p>"한 번 더!" 카드를 쓰면 돌림판을 다시 돌려요.</p>
          <div class="row"><button class="btn big primary" data-v="1">🎡 다시 돌리기</button><button class="btn big" data-v="0">이대로 갈래요</button></div></div>`);
        const v = await waitPick(d); d.remove(); return v === "1";
      }
      case "lucky": {
        say(L.lucky);
        const d = layer("modal", `<div class="win-box pick-box"><h2>🍀 ${esc(L.lucky)}</h2>
          <div class="lucky-grid">${WORDS.slice(1).map((w, i) => `<button class="lucky" data-v="${i + 1}"><b>${w}</b><small>${i + 1}</small></button>`).join("")}</div></div>`);
        const v = await waitPick(d); d.remove(); return +v;
      }
      case "defend": {
        say(L.defendAsk);
        const host = $(".capture-scene .cap-ask") ? $(".capture-scene") : null;
        const d = layer("modal over-capture", `<div class="win-box pick-box"><h2>🛡️ ${esc(L.defendAsk)}</h2>
          <div class="pick-row cards">${data.options.map((id) => `<button class="pick-c" data-v="${id}">${cardHTML(id)}</button>`).join("")}</div>
          <button class="btn big" data-v="">안 쓰고 문제 풀래요</button></div>`);
        const v = await waitPick(d); d.remove(); void host; return v || null;
      }
    }
    return null;
  },

  async quiz(pi, ctx) {
    if (G.aborted) throw ABORT;
    if (TEST && window.__T && window.__T.autoQuiz) return window.__T.autoQuiz(pi, ctx);
    if (G.s.players[pi].cpu) return cpuQuiz(pi, ctx);
    return Quiz.run(pi, ctx);
  },
};

/** 차례 시작: 카드 쓰기 또는 돌림판 돌리기 */
function chooseAction(data) {
  return new Promise((resolve, reject) => {
    G.reject = reject;
    renderPanel();
    Wheel.show(12, wheelBadge(G.s.players[data.who]), false);
    Wheel.enable(true);
    setMsg(data.cards.some((c) => c.ok) ? "카드를 쓰거나, 돌림판을 돌려요!" : "돌림판을 돌려요!");
    const panel = $("#hud"), hub = $("#rollBtn");
    const usable = new Set(data.cards.filter((c) => c.ok).map((c) => c.id));
    $$(".mini-card[data-card]", panel).forEach((b) => b.classList.toggle("usable", usable.has(b.dataset.card)));
    G.actionWait = true;
    const done = (v) => { G.actionWait = false; G.reject = null; panel.removeEventListener("click", h, true); hub.onclick = null; Wheel.enable(false); resolve(v); };
    hub.onclick = () => { SFX.pop(); Voice.unlock(); done("roll"); };
    const h = async (e) => {
      const c = e.target.closest(".mini-card[data-card]");
      if (!c) return;
      e.stopPropagation();
      const id = c.dataset.card;
      const info = data.cards.find((x) => x.id === id);
      if (!info) return;
      if (!info.ok) { showCardInfo(id).then(() => {}).catch(() => {}); toast(info.why); return; }
      G.actionWait = false;
      const v = await showCardInfo(id, true).catch(() => null);
      G.actionWait = true;
      if (v === "use") done(id);
    };
    panel.addEventListener("click", h, true);
    if (TEST && window.__T && window.__T.auto) setTimeout(() => done(window.__T.auto("action", data)), 0);
  });
}
// ---------- 컴퓨터 친구 (혼자하기에서 고르는 관장들, 2026-10-17 사용자 요청) ----------
/** 컴퓨터가 고른다 — 아이가 무슨 일인지 볼 수 있게 잠깐씩 멈춘다 */
async function cpuChoose(kind, d) {
  const s = G.s, me = s.players[d.who], map = R.MAPS[s.mode];
  const lead = (opts) => opts.slice().sort((a, b) => s.players[b].pos - s.players[a].pos)[0];
  if (kind === "action") {
    Wheel.show(12, wheelBadge(me), false);
    setMsg(`🤖 ${jo(me.name, "이", "가")} 생각 중…`);
    await sleep(800);
    const u = d.cards.filter((c) => c.ok);
    if (u.length && Math.random() < 0.5) return u[Math.floor(Math.random() * u.length)].id;
    setMsg(`🤖 ${jo(me.name, "이", "가")} 돌림판을 돌려요!`);
    $("#rollBtn") && $("#rollBtn").classList.add("cpu-press");
    await sleep(350);
    $("#rollBtn") && $("#rollBtn").classList.remove("cpu-press");
    return "roll";
  }
  if (kind === "spin") { Wheel.show(12, wheelBadge(me), false); await sleep(600); return true; }
  await sleep(500);
  switch (kind) {
    case "target": return lead(d.options);
    case "direction": return d.target != null ? 1 : -1; // 로켓단은 뒤로 보내고, 급습은 앞사람 앞에
    case "cell": {
      let best = d.to;
      for (let n = d.to; n >= d.from; n--) if (map.ladders[n]) { best = n; break; }
      while (map.slides[best] && best > d.from) best--;
      return best;
    }
    case "pick": return 0;
    case "discard": return d.add;
    case "reward": return "move";
    case "reroll": return d.dice.reduce((a, b) => a + b, 0) < 5;
    case "lucky": {
      const room = s.goal - me.pos;
      for (let v = Math.min(12, room); v >= 1; v--) if (map.ladders[me.pos + v]) return v;
      for (let v = Math.min(12, room); v >= 1; v--) if (!map.slides[me.pos + v]) return v;
      return 1;
    }
    case "defend": return d.options[0];
  }
  return null;
}
/** 컴퓨터는 퀴즈를 확률로 푼다 (아이 학습 기록에는 안 넣는다) */
async function cpuQuiz(pi, ctx) {
  const p = G.s.players[pi];
  const x = Math.random();
  const res = x < 0.55 ? "first" : x < 0.75 ? "hint" : x < 0.9 ? "explained" : "fail";
  const d = layer("cpu-quiz", `<div class="win-box">${trainerHTML(p, "big")}<div><b>🤖 ${jo(p.name, "이", "가")} 문제를 풀고 있어요…</b><span id="cpuRes">🤔</span></div></div>`);
  await sleep(1100);
  $("#cpuRes", d).textContent = res === "first" ? "🌟 한 번에 정답!" : res === "hint" ? "💡 힌트 보고 정답!" : res === "explained" ? "📖 풀이 보고 맞혔어요" : "😢 아쉬워요!";
  res === "first" || res === "hint" ? SFX.good() : SFX.bad();
  await sleep(900);
  d.remove();
  p.qs = p.qs || { n: 0, first: 0, hint: 0, explained: 0, fail: 0, math: 0, en: 0 };
  p.qs.n++; p.qs[res]++;
  void ctx;
  return res;
}

/** 카드를 쓴 뒤 돌림판 누르기 */
function chooseSpin(data) {
  return new Promise((resolve, reject) => {
    G.reject = reject;
    Wheel.show(12, wheelBadge(G.s.players[data.who]), false);
    Wheel.enable(true);
    setMsg("이제 돌림판을 돌려요!");
    const hub = $("#rollBtn");
    hub.onclick = () => { SFX.pop(); hub.onclick = null; G.reject = null; Wheel.enable(false); resolve(true); };
    if (TEST && window.__T && window.__T.auto) setTimeout(() => hub.onclick && hub.onclick(), 0);
  });
}
/** 팬텀: 판 위에서 칸 고르기 */
function chooseCell(data) {
  return new Promise((resolve, reject) => {
    G.reject = reject;
    say(L.pickCell);
    setMsg(`👻 ${L.pickCell} (${data.from}~${data.to})`);
    const cells = [];
    for (let n = data.from; n <= data.to; n++) { const c = $(`.cell[data-n="${n}"]`); if (c) { c.classList.add("selectable"); cells.push(c); } }
    focusCell(Math.round((data.from + data.to) / 2));
    const b = $("#board");
    const h = (e) => {
      const c = e.target.closest(".cell.selectable");
      if (!c) return;
      SFX.pop();
      cells.forEach((x) => x.classList.remove("selectable"));
      b.removeEventListener("click", h);
      G.reject = null;
      resolve(+c.dataset.n);
    };
    b.addEventListener("click", h);
  });
}

async function revealCard(who, id, from) {
  const c = R.CARDS[id];
  SFX.card();
  const title = { deck: "카드를 뽑았다!", rocket: "로켓단 카드!", reward: "능력 카드를 받았다!", chest: "보물상자에서 나왔다!", pick: "이 카드로 결정!" }[from] || "카드!";
  const keep = c.keep === "now" ? "바로 써요!" : "보관함에 넣어요";
  const d = layer("modal card-modal reveal", `<h2 class="reveal-title">${esc(title)}</h2>
    <div class="card-flip"><div class="card-back"><img src="${IMG.tile("card")}" alt=""></div>${cardHTML(id, "big")}</div>
    <p class="keep">${esc(keep)}</p>
    <button class="btn big primary" data-v="ok">좋아!</button>`);
  await sleep(250);
  d.classList.add("flipped");
  say(c.name, c.text);
  if (TEST && !window.__TEST_SLOW_EXPLAIN) { await sleep(10); d.remove(); return; }
  await waitPick(d);
  d.remove();
}
/** 퀴즈 보상 이동: +1 · +2 · +3 이 번갈아 깜빡이다가 하나에 멈춘다 (2026-10-17 사용자 요청) */
async function rewardPop(who, n, why) {
  const p = G.s.players[who];
  if (why === "challenge") { setMsg(`💡 ${p.name}: 퀴즈 도전 성공! +${n}칸!`); await sleep(500); return; }
  const d = layer("reward-pop", `<div class="win-box"><div class="rp-title">${trainerHTML(p, "sm")} ${esc(p.name)} 앞으로!</div>
    <div class="rp-row">${[1, 2, 3].map((k) => `<span class="rp" data-k="${k}">+${k}</span>`).join("")}</div>
    <div class="rp-res" id="rpRes">두근두근…</div></div>`);
  const cells = $$(".rp", d);
  const steps = TEST ? 1 : 10 + n;
  for (let i = 0; i < steps; i++) {
    cells.forEach((c) => c.classList.toggle("on", +c.dataset.k === (i % 3) + 1));
    SFX.step();
    await sleep(70 + i * 12);
  }
  cells.forEach((c) => c.classList.toggle("on", +c.dataset.k === n));
  cells.forEach((c) => c.classList.toggle("win", +c.dataset.k === n));
  $("#rpRes", d).innerHTML = `<b>+${n}칸!</b> <span>${WORDS[n]}!</span>`;
  setMsg(`🎁 ${p.name} +${n}칸 (${WORDS[n]})!`);
  SFX.good();
  sayEn(WORDS[n]);
  await sleep(900);
  d.remove();
}
async function coinFlip(ok) {
  const d = layer("flash coin", `<div class="coin-spin">${ok ? "💤" : "😳"}</div>`);
  await sleep(1100);
  d.remove();
}

// ---------- 로켓단 포획 장면 ----------
async function captureScene(pi) {
  const p = G.s.players[pi];
  SFX.alarm();
  closeLayers(".capture-scene");
  $$(".capture-scene").forEach((x) => x.remove());
  const d = layer("capture-scene", `
    <div class="cap-bg"></div>
    <div class="cap-rocket">${rocketHTML()}</div>
    <div class="cap-player">${trainerHTML(p, "big")}<b>${esc(p.name)}</b></div>
    <div class="cap-line win-box"><span id="capText">🚨 ${esc(L.caught)}</span></div>`);
  setMsg(`🚨 ${p.name}: ${L.caught}`);
  say(L.caughtRocket, L.caught);
  await sleep(1600);
  d.dataset.ok = "1";
}
async function captureLine(text, voice) {
  const d = $(".capture-scene");
  setMsg(text);
  if (d) {
    $("#capText", d).textContent = text;
    d.classList.toggle("good", !/아쉬워/.test(text));
  }
  say(voice);
  await sleep(1200);
}
async function kickScene(e) {
  let d = $(".capture-scene");
  if (!d) d = layer("capture-scene", `<div class="cap-bg"></div><div class="cap-rocket">${rocketHTML()}</div><div class="cap-line win-box"><span id="capText"></span></div>`);
  d.classList.add("kick");
  $("#capText", d).textContent = `✨ ${L.kick}`;
  setMsg(`✨ ${L.kick} (${e.from} → ${e.to})`);
  SFX.up();
  say(L.kick);
  await sleep(1300);
  d.remove();
  await animateMove("R", e.from, e.to, "warp");
}

// =====================================================================
// 퀴즈 (plan §10.1: 문제 → 힌트 → 풀이 + 비슷한 문제)
// =====================================================================
const Quiz = {
  async run(pi, ctx) {
    const s = G.s, p = s.players[pi];
    const name = p.name;
    const rec = (Store.data.learn[name] = Store.data.learn[name] || Learn.blank());
    const q = Learn.pick(p, rec, G.used, Math.random);
    const title = { cell: "📘 퀴즈 칸", bonus: "⭐ 보너스 퀴즈", escape: "🚨 로켓단 탈출 퀴즈", challenge: "💡 퀴즈 도전 (+12칸)" }[ctx.reason] || "퀴즈";
    const d = layer("quiz-layer", `<div class="quiz win-box" style="--pc:${TRAINER[p.trainer].color}">
      <header class="qz-head">${trainerHTML(p, "sm")}<b>${esc(name)}</b><span class="qz-title">${title}</span><span class="qz-sub" id="qzSub"></span></header>
      <div class="qz-body" id="qzBody"></div>
    </div>`);
    let res;
    try {
      if (await this.ask(d, q, 1)) res = "first";
      else {
        SFX.bad();
        await this.hint(d, q);
        if (await this.ask(d, q, 2)) res = "hint";
        else {
          await this.explain(d, q);
          const q2 = Learn.similar(q, Math.random, G.used);
          say(L.similar);
          if (await this.ask(d, q2, 3)) res = "explained";
          else { await this.reveal(d, q2); res = "fail"; }
        }
      }
    } catch (e) { d.remove(); throw e; }
    if (res === "first" || res === "hint") { SFX.good(); await this.cheer(d, res); }
    d.remove();
    // 기록
    Learn.record(rec, q, res);
    const lvChange = Learn.adjust(p, q.subject, res);
    if (lvChange) {
      const subj = lvChange.subject === "math" ? "수학" : "영어";
      if (lvChange.to < lvChange.from) setMsg(`🌱 ${subj} LV.${lvChange.from} → LV.${lvChange.to} · 다음엔 조금 쉬운 문제로 연습해요!`);
      else setMsg(`🚀 ${subj} LV.${lvChange.from} → LV.${lvChange.to} · 세 번 연속 정답! 다시 도전해요!`);
      toast(`${subj} LV.${lvChange.to}`, 1600);
    }
    p.qs.n++; p.qs[res]++; p.qs[q.subject]++;
    p.qs.weak = p.qs.weak || {};
    if (res !== "first") p.qs.weak[q.concept] = (p.qs.weak[q.concept] || 0) + 1;
    Store.save();
    return res;
  },

  /** 문제 하나 보여 주고 답을 받는다 → 맞았나 */
  ask(d, q, stage) {
    G.lastQ = q;
    const body = $("#qzBody", d);
    $("#qzSub", d).textContent = `${q.subject === "math" ? "수학" : "영어"} · ${q.name} · LV.${q.level}${stage === 3 ? " · 비슷한 문제" : ""}`;
    const hintBox = stage === 2 ? `<div class="qz-hint">💡 ${esc(q.hint)}</div>` : "";
    body.innerHTML = `
      ${hintBox}
      <p class="qz-prompt">${esc(q.prompt).replace(/\n/g, "<br>")}</p>
      ${q.listen || (q.say && !q.sayAfter) ? `<button class="btn listen" data-k="listen">🔊 ${q.listen ? "다시 듣기" : "들어 보기"}</button>` : ""}
      ${q.picture ? `<div class="qz-pic">${esc(q.picture)}</div>` : ""}
      ${q.visual ? visualHTML(q.visual) : ""}
      ${q.expr ? `<div class="qz-expr">${esc(q.expr)}</div>` : ""}
      <div class="qz-answer" id="qzAns">${answerHTML(q)}</div>
      ${stage === 2 ? `<button class="btn small ghost" data-k="giveup">📖 풀이 보기</button>` : ""}
    `;
    if (q.listen) setTimeout(() => sayEn(q.say), 250);
    else if (q.say && !q.sayAfter) setTimeout(() => sayEn(q.say), 250);
    return new Promise((resolve, reject) => {
      G.reject = reject;
      const state = { typed: "", order: [] };
      const finish = async (ok, picked) => {
        body.removeEventListener("click", h);
        G.reject = null;
        if (picked) picked.classList.add(ok ? "right" : "wrong");
        body.classList.add(ok ? "ok" : "no");
        if (ok) { say(L.correct); if (q.subject === "en" && (q.sayAfter || q.sayAnswer)) setTimeout(() => sayEn(q.sayAnswer ? q.answer : q.say), 700); }
        else say(L.wrong);
        await sleep(ok ? 900 : 1000);
        body.classList.remove("ok", "no");
        resolve(ok);
      };
      const h = (e) => {
        const b = e.target.closest("[data-k]");
        if (!b || b.disabled) return;
        const k = b.dataset.k;
        if (k === "listen") { sayEn(q.say); return; }
        if (k === "giveup") { finish(false); return; }
        SFX.pop();
        if (k === "choice") { if (q.subject === "en" && q.choiceType === "text" && /^[A-Za-z]/.test(b.dataset.v) && b.dataset.v.length > 1) sayEn(b.dataset.v); return finish(b.dataset.v === q.answer, b); }
        if (k === "key") {
          const v = b.dataset.v;
          if (v === "del") state.typed = state.typed.slice(0, -1);
          else if (v === "ok") { if (state.typed) return finish(state.typed.toUpperCase() === String(q.answer).toUpperCase()); }
          else if (state.typed.length < (q.keypad === "letters" ? 1 : 5)) state.typed += v;
          $("#qzTyped", body).textContent = state.typed || "?";
          return;
        }
        if (k === "tok") {
          state.order.push(+b.dataset.i);
          b.disabled = true;
        }
        if (k === "untok") {
          const i = +b.dataset.i;
          state.order = state.order.filter((x) => x !== i);
          const t = $(`[data-k="tok"][data-i="${i}"]`, body);
          if (t) t.disabled = false;
        }
        if (k === "undo") {
          const i = state.order.pop();
          const t = $(`[data-k="tok"][data-i="${i}"]`, body);
          if (t) t.disabled = false;
        }
        if (k === "tok" || k === "untok" || k === "undo") {
          $("#qzLine", body).innerHTML = state.order.map((i) => `<button class="tok on" data-k="untok" data-i="${i}">${esc(q.tokens[i])}</button>`).join("") || `<span class="ph">눌러서 채워요</span>`;
          $("#qzCheck", body).disabled = state.order.length !== q.answer.length;
          return;
        }
        if (k === "check") {
          const got = state.order.map((i) => q.tokens[i]);
          return finish(JSON.stringify(got) === JSON.stringify(q.answer));
        }
      };
      body.addEventListener("click", h);
    });
  },

  async hint(d, q) {
    const body = $("#qzBody", d);
    body.insertAdjacentHTML("afterbegin", "");
    say(L.hint);
    void q;
  },

  /** 단계별 풀이 + 그림 (곱셈은 묶음이 하나씩 나타난다) */
  explain(d, q) {
    const body = $("#qzBody", d);
    $("#qzSub", d).textContent = `같이 풀어 봐요 · ${q.name}`;
    body.innerHTML = `<div class="qz-explain">
      <p class="qz-prompt small">${esc(q.prompt).replace(/\n/g, "<br>")}</p>
      ${q.explainVisual ? `<div class="ex-visual">${explainVisualHTML(q.explainVisual)}</div>` : q.picture ? `<div class="qz-pic">${esc(q.picture)}</div>` : q.visual ? visualHTML(q.visual) : ""}
      <ol class="ex-steps">${q.explain.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
      <div class="ex-answer">정답: <b>${esc(Array.isArray(q.answer) ? q.answer.join(" ") : q.answer)}</b>${q.unit ? esc(q.unit) : ""}</div>
      <button class="btn big primary" data-v="next" disabled>💪 비슷한 문제 풀기</button>
    </div>`;
    say(L.explain);
    if (q.subject === "en" && q.say) setTimeout(() => sayEn(q.sayAnswer ? q.answer : q.say), 900);
    return (async () => {
      const groups = $$(".grp", body);
      for (const g of groups) { await sleep(650); g.classList.add("in"); SFX.pop(); }
      for (const li of $$(".ex-steps li", body)) { await sleep(700); li.classList.add("in"); }
      await sleep(400);
      $(".ex-answer", body).classList.add("in");
      const btn = $("[data-v=next]", body);
      btn.disabled = false;
      if (TEST && !window.__TEST_SLOW_EXPLAIN) return;
      await waitPick(body);
    })();
  },

  async reveal(d, q) {
    const body = $("#qzBody", d);
    body.innerHTML = `<div class="qz-explain"><p class="qz-prompt">${esc(L.answerIs)}</p>
      <div class="ex-answer in big">${esc(Array.isArray(q.answer) ? q.answer.join(" ") : q.answer)}${q.unit ? esc(q.unit) : ""}</div>
      <ol class="ex-steps">${q.explain.map((t) => `<li class="in">${esc(t)}</li>`).join("")}</ol>
      <button class="btn big primary" data-v="ok">계속하기</button></div>`;
    say(L.answerIs);
    if (TEST) return;
    await waitPick(body);
  },

  async cheer(d, res) {
    const body = $("#qzBody", d);
    body.insertAdjacentHTML("beforeend", `<div class="cheer">${res === "first" ? "🌟 한 번에 정답!" : "👍 힌트 보고 정답!"}</div>`);
    if (res === "first") say(L.great);
    await sleep(800);
  },
};

function answerHTML(q) {
  if (q.kind === "choice") {
    return `<div class="choices ${q.choiceType}">${q.choices.map((c) => {
      if (q.choiceType === "swatch") return `<button class="ch swatch" data-k="choice" data-v="${esc(c)}" style="--sw:${EnQ.COLORS[c][0]}" aria-label="${esc(c)}"></button>`;
      return `<button class="ch" data-k="choice" data-v="${esc(c)}">${esc(c)}</button>`;
    }).join("")}</div>`;
  }
  if (q.kind === "input") {
    const keys = q.keypad === "letters" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    return `<div class="typed"><span id="qzTyped">?</span>${q.unit ? `<small>${esc(q.unit)}</small>` : ""}</div>
      <div class="keypad ${q.keypad}">${keys.map((k) => `<button class="key" data-k="key" data-v="${k}">${k}</button>`).join("")}
      <button class="key del" data-k="key" data-v="del">⌫</button><button class="key ok" data-k="key" data-v="ok">확인</button></div>`;
  }
  if (q.kind === "order") {
    return `<div class="line" id="qzLine"><span class="ph">눌러서 채워요</span></div>
      <div class="tokens">${q.tokens.map((t, i) => `<button class="tok" data-k="tok" data-i="${i}">${esc(t)}</button>`).join("")}</div>
      <div class="row"><button class="btn" data-k="undo">↩ 되돌리기</button><button class="btn primary" id="qzCheck" data-k="check" disabled>확인</button></div>`;
  }
  return "";
}

// ---------- 문제 그림 ----------
function itemHTML(it) {
  return it && it.img ? `<img class="it" src="assets/items/${it.img}.png" alt="">` : `<span class="it">${it ? it.emoji : "⭐"}</span>`;
}
function visualHTML(v) {
  switch (v.type) {
    case "clock": return `<div class="vis">${clockSVG(v.h, v.m)}</div>`;
    case "coins": return `<div class="vis coins">${Array(v.c500).fill('<span class="coin c500">500</span>').join("")}${Array(v.c100).fill('<span class="coin c100">100</span>').join("")}</div>`;
    case "shape": return `<div class="vis">${shapeSVG(v.n)}</div>`;
    case "row": return `<div class="vis row-items"><span class="side">왼쪽</span>${v.items.map((x) => `<span class="ri">${x}</span>`).join("")}<span class="side">오른쪽</span></div>`;
    case "groups": return `<div class="vis groups">${Array.from({ length: v.b }, () => `<span class="grp in">${Array(v.a).fill(itemHTML(v.item)).join("")}</span>`).join("")}</div>`;
    case "place": return `<div class="vis">${placeHTML(v)}</div>`;
  }
  return "";
}
function explainVisualHTML(v) {
  if (v.type === "groups") {
    return `<div class="groups ex">${Array.from({ length: v.b }, (_, k) => `<span class="grp"><span class="gi">${Array(v.a).fill(itemHTML(v.item)).join("")}</span><b class="acc">${v.acc ? v.acc[k] : v.a * (k + 1)}</b></span>`).join("")}</div>`;
  }
  if (v.type === "blocks") {
    const blk = (n) => `<span class="blk">${Array(Math.floor(n / 10)).fill('<i class="ten"></i>').join("")}${Array(n % 10).fill('<i class="one"></i>').join("")}<b>${n}</b></span>`;
    return `<div class="blocks">${blk(v.a)}<span class="op">${v.op === "+" ? "+" : "−"}</span>${blk(v.b)}</div>`;
  }
  if (v.type === "story") {
    let cur = v.steps[0];
    return `<div class="story"><span class="st">${cur}</span>${v.steps.slice(1).map((d) => { cur += d; return `<span class="arrow">${d > 0 ? "+" + d : d}</span><span class="st">${cur}</span>`; }).join("")}</div>`;
  }
  return "";
}
function clockSVG(h, m) {
  const ha = ((h % 12) + m / 60) * 30, ma = m * 6;
  const nums = Array.from({ length: 12 }, (_, i) => {
    const a = (i + 1) * 30 * Math.PI / 180;
    return `<text x="${50 + 37 * Math.sin(a)}" y="${54 + -37 * Math.cos(a)}" text-anchor="middle" font-size="10">${i + 1}</text>`;
  }).join("");
  return `<svg class="clock" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#fff" stroke="#222" stroke-width="4"/>${nums}
    <line x1="50" y1="50" x2="${50 + 22 * Math.sin(ha * Math.PI / 180)}" y2="${50 - 22 * Math.cos(ha * Math.PI / 180)}" stroke="#e5484d" stroke-width="5" stroke-linecap="round"/>
    <line x1="50" y1="50" x2="${50 + 34 * Math.sin(ma * Math.PI / 180)}" y2="${50 - 34 * Math.cos(ma * Math.PI / 180)}" stroke="#2f6fd6" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="3" fill="#222"/></svg>`;
}
function shapeSVG(n) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [50 + 40 * Math.cos(a), 52 + 40 * Math.sin(a)];
  });
  return `<svg class="shape" viewBox="0 0 100 100"><polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="#ffd84d" stroke="#222" stroke-width="3"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#e5484d"/>`).join("")}</svg>`;
}
function placeHTML(v) {
  const pos = { in: "p-in", on: "p-on", under: "p-under", "next to": "p-next", behind: "p-behind" }[v.prep];
  return `<div class="place ${pos}"><span class="thing">${v.thing}</span><span class="obj">${v.obj}</span>${v.prep === "in" ? `<span class="thing front">${v.thing}</span>` : ""}</div>`;
}

// =====================================================================
// 결과
// =====================================================================
async function finishGame(s) {
  const lost = !!s.rocketWon; // 로켓단이 먼저 도착 → 모두 진다
  const w = lost ? null : s.players[s.winner];
  if (lost) { SFX.bad(); say(L.rocketWin); } else { SFX.win(); say(w.name, L.win); }
  const rank = s.players.map((p, i) => ({ p, i })).sort((a, b) => (a.i === s.winner ? -1 : b.i === s.winner ? 1 : b.p.pos - a.p.pos));
  // 기록 (한 판 요약)
  Store.data.history.unshift({ at: Date.now(), mode: s.mode, rounds: s.round, winner: lost ? "로켓단 (모두 짐)" : w.name, mins: Math.round((Date.now() - (s.started || Date.now())) / 60000),
    players: s.players.map((p) => ({ name: p.name, pos: p.pos, qs: p.qs })) });
  Store.data.history = Store.data.history.slice(0, 30);
  s.players.forEach((p) => { const r = Store.data.learn[p.name]; if (r) r.games = (r.games || 0) + 1; });
  Store.data.game = null;
  Store.save();
  const medal = lost ? ["🏃", "🏃", "🏃", "🏃"] : ["🥇", "🥈", "🥉", "🎖️"];
  show(`
  <div class="result">
    <div class="podium ${lost ? "lost" : ""}">
      <div class="win-bg"></div>
      ${lost ? `<div class="champ"><span class="rk huge-rk">${rocketHTML()}</span><h1>로켓단이 먼저 도착…</h1><p>이번엔 승자가 없어요. 다시 도전해서 로켓단보다 먼저 골인해요! · ${s.round}라운드</p></div>`
        : `<div class="champ">${trainerHTML(w, "huge")}<h1>${esc(w.name)} ${s.players.length === 1 ? "골인!" : "우승!"}</h1><p>${s.mode}칸 · ${s.round}라운드 · 퀴즈 ${s.quizzes}문제 · 로켓단 포획 ${s.captures}번</p></div>`}
    </div>
    <div class="res-list">
      ${rank.map(({ p }, k) => {
        const q = p.qs || { n: 0 };
        const weak = Object.keys(q.weak || {}).slice(0, 3).map((c) => Learn.conceptName(c));
        return `<div class="win-box res-row" style="--pc:${TRAINER[p.trainer].color}">
          <span class="medal">${medal[k]}</span>${trainerHTML(p, "sm")}<b>${p.cpu ? "🤖 " : ""}${esc(p.name)}</b><span class="rpos">${p.pos}칸</span>
          <span class="rq">📝 ${q.n}문제 (수학 ${q.math || 0} · 영어 ${q.en || 0}) · 🌟 바로 ${q.first || 0} · 💡 힌트 ${q.hint || 0} · ⭐ 도장 ${q.explained || 0}</span>
          ${weak.length ? `<span class="rweak">다음에 복습: ${weak.map(esc).join(", ")}</span>` : ""}
        </div>`;
      }).join("")}
    </div>
    <div class="row res-btns"><button class="btn big primary" data-a="again">🔁 한 판 더</button><button class="btn big" data-a="home">🏠 처음으로</button></div>
  </div>`, "screen-result");
  $("#app").onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    SFX.pop();
    if (b.dataset.a === "again") startGame(Store.data.setup || DEFAULT_SETUP);
    else renderTitle();
  };
}

// =====================================================================
// 부모 화면 (두 자리 곱셈 잠금)
// =====================================================================
function parentGate() {
  const a = 12 + Math.floor(Math.random() * 28), b = 3 + Math.floor(Math.random() * 7);
  let typed = "";
  const d = layer("modal", `<div class="win-box gate"><h2>🔒 부모 화면</h2><p>어른만 열 수 있어요: <b>${a} × ${b} = ?</b></p>
    <div class="typed"><span id="gateT">?</span></div>
    <div class="keypad digits">${"1234567890".split("").map((k) => `<button class="key" data-v="${k}">${k}</button>`).join("")}<button class="key del" data-v="del">⌫</button><button class="key ok" data-v="ok">확인</button></div>
    <button class="btn" data-v="close">닫기</button></div>`);
  d.onclick = (e) => {
    const k = e.target.closest("[data-v]");
    if (!k) return;
    const v = k.dataset.v;
    if (v === "close") return d.remove();
    if (v === "del") typed = typed.slice(0, -1);
    else if (v === "ok") {
      if (+typed === a * b) { d.remove(); renderParent(); return; }
      typed = ""; toast("다시 해 보세요");
    } else if (typed.length < 4) typed += v;
    $("#gateT", d).textContent = typed || "?";
  };
}
function renderParent() {
  const learn = Store.data.learn;
  const names = Object.keys(learn);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "-");
  show(`
  <div class="parent">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>🔒 학습 기록</h2><span></span></header>
    ${names.length ? names.map((n) => {
      const r = learn[n];
      const cs = Object.entries(r.concepts);
      const sum = (k, f) => cs.filter(([c]) => !f || c[0] === f).reduce((a, [, v]) => a + v[k], 0);
      const tot = (f) => sum("n", f);
      const weak = Learn.weakList(r, 3);
      return `<section class="win-box pr">
        <h3>${esc(n)} <small>${r.games || 0}판 · ${r.total}문제</small></h3>
        <div class="pr-stats">
          <div><b>수학</b> ${tot("M")}문제 · 혼자 정답 ${pct(sum("first", "M"), tot("M"))} · 힌트 ${pct(sum("hint", "M"), tot("M"))}</div>
          <div><b>영어</b> ${tot("E")}문제 · 혼자 정답 ${pct(sum("first", "E"), tot("E"))} · 힌트 ${pct(sum("hint", "E"), tot("E"))}</div>
          <div><b>이해가 더 필요한 개념</b> ${weak.length ? weak.map((w) => esc(w.name)).join(", ") : "없음 👍"}</div>
        </div>
        <details><summary>개념별 자세히</summary><table class="pr-table"><tr><th>개념</th><th>문제</th><th>바로</th><th>힌트</th><th>풀이 후</th><th>못 풂</th></tr>
          ${cs.sort().map(([c, v]) => `<tr class="${v.needReview ? "need" : ""}"><td>${c} ${esc(Learn.conceptName(c))}</td><td>${v.n}</td><td>${v.first}</td><td>${v.hint}</td><td>${v.explained}</td><td>${v.fail}</td></tr>`).join("")}
        </table></details>
      </section>`;
    }).join("") : `<section class="win-box"><p>아직 기록이 없어요. 한 판 놀고 오세요!</p></section>`}
    <section class="win-box">
      <h3>최근 판</h3>
      <ul class="hist">${Store.data.history.slice(0, 10).map((h) => `<li>${new Date(h.at).toLocaleDateString("ko-KR")} · ${h.mode}칸 · ${h.rounds}라운드 · 약 ${h.mins}분 · 🏆 ${esc(h.winner)}</li>`).join("") || "<li>없음</li>"}</ul>
    </section>
    <section class="win-box danger-zone"><h3>기록 지우기</h3><p>모든 학습 기록을 지우려면 <b>초기화</b> 라고 써 주세요.</p>
      <input id="wipeIn" placeholder="초기화" autocomplete="off"><button class="btn" data-a="wipe">지우기</button></section>
  </div>`, "screen-parent");
  $("#app").onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    if (b.dataset.a === "back") renderTitle();
    if (b.dataset.a === "wipe") {
      if ($("#wipeIn").value.trim() === "초기화") { Store.data.learn = {}; Store.data.history = []; Store.save(); toast("지웠어요"); renderParent(); }
      else toast("'초기화' 라고 정확히 써 주세요");
    }
  };
}

// =====================================================================
// 새 버전 감지 (패드가 옛 HTML 을 붙들고 있는 문제)
// =====================================================================
const Update = { ver: null, last: 0, shown: false };
async function checkUpdate(force) {
  if (location.protocol === "file:" || !navigator.onLine) return;
  const now = Date.now();
  if (!force && now - Update.last < 60000) return;
  Update.last = now;
  try {
    const r = await fetch(location.pathname + "?v=" + now, { cache: "no-store" });
    if (r.ok) {
      const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(await r.text());
      if (m && m[1] !== APP_VERSION) Update.ver = m[1];
    }
  } catch (e) { return; }
  if (!Update.ver) return;
  const f = $("#updFoot");
  if (f) f.textContent = " → 새 버전 v" + Update.ver;
  // 판 중에는 방해하지 않는다 — 처음 화면에서만
  if (!$(".screen-title") && !$("#app.screen-title")) return;
  if (Update.shown) return;
  Update.shown = true;
  const d = layer("modal", `<div class="win-box"><h2>🎁 ${esc(L.updateNew)}</h2>
    <p>지금 <b>v${esc(APP_VERSION)}</b> 을 쓰고 있어요.<br>새 버전 <b>v${esc(Update.ver)}</b> 으로 바꿔 볼까요?<br><small>하던 판과 학습 기록은 그대로 남아요</small></p>
    <div class="row"><button class="btn big primary" data-v="go">🔄 새 버전으로 바꾸기</button><button class="btn big" data-v="later">나중에</button></div></div>`);
  waitPick(d).then((v) => { d.remove(); if (v === "go") applyUpdate(); else renderTitle(); }).catch(() => {});
}
function applyUpdate() { location.replace(location.pathname + "?v=" + Date.now()); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
window.addEventListener("online", () => checkUpdate(true));
setInterval(() => checkUpdate(), 10 * 60000);

// ---------- 시험용 손잡이 (?test) ----------
if (TEST) window.__T = { G, Store, IO, Quiz, startGame, renderTitle, renderSetup, renderParent, R, revealCard, captureScene, kickScene, finishGame, explainVisualHTML };

renderTitle();
