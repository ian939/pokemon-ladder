/* 포켓몬 사다리 대모험 — 규칙 엔진 (화면과 분리, Node 에서도 돈다)
 *
 * plan.md §0(확정) · §4~§8 을 그대로 옮긴 것.
 * - 판 상태 s 는 JSON 으로 저장할 수 있는 값만 담는다 (난수 상태 s.rng 포함 → 이어하기 해도 같은 주사위).
 * - 사람이 고르거나 퀴즈를 푸는 곳은 io 로 물어본다 (모두 async):
 *     io.show(evt)          연출·안내 (돌려받는 값 없음)
 *     io.choose(kind, data) 고르기 → 고른 값
 *     io.quiz(pi, ctx)      퀴즈 → 'first' | 'hint' | 'explained' | 'fail'
 *   시험·시뮬레이션은 io 를 스크립트로 바꿔 끼운다.
 */
(function (root) {
  "use strict";

  // ---------- 캐릭터 ----------
  const TRAINERS = [
    { id: "ash", name: "지우", partner: 25, partnerName: "피카츄", color: "#e5484d" },
    { id: "brock", name: "웅", partner: 95, partnerName: "롱스톤", color: "#b07a3c" },
    { id: "misty", name: "이슬", partner: 54, partnerName: "고라파덕", color: "#2f8fd6" },
    { id: "blue", name: "블루", partner: 133, partnerName: "이브이", color: "#7b5bd6" },
    { id: "red", name: "레드", partner: 6, partnerName: "리자몽", color: "#f08a24" },
  ];

  // ---------- 맵 (plan §8.2 · §8.3 테스트 시안 그대로) ----------
  const MAPS = {
    100: {
      goal: 100, dice: 1, rocketStart: 15, checkpoints: [51], // 돌림판 1번 (1~12, 2026-10-17 사용자 요청)
      ladders: { 4: 16, 13: 31, 22: 40, 35: 53, 47: 65, 59: 78, 71: 89, 82: 96 },
      slides: { 19: 8, 33: 17, 46: 29, 62: 44, 79: 58, 94: 74 },
      quiz: [6, 11, 18, 26, 32, 39, 49, 56, 67, 73, 84, 91],
      card: [9, 15, 24, 37, 43, 54, 64, 76, 86, 97],
      rocket: [28, 42, 61, 88],
      regions: ["town", "forest"],
    },
    200: {
      goal: 200, dice: 1, rocketStart: 25, checkpoints: [51, 101, 151],
      ladders: { 5: 24, 17: 39, 29: 52, 44: 70, 58: 83, 73: 99, 86: 112, 101: 129, 116: 143, 132: 155, 147: 172, 160: 183, 176: 194, 187: 198 },
      slides: { 27: 12, 42: 21, 63: 45, 78: 55, 95: 74, 110: 88, 127: 103, 145: 120, 163: 139, 178: 151, 190: 166, 197: 180 },
      quiz: [8, 14, 23, 34, 40, 48, 54, 66, 76, 81, 91, 98, 107, 114, 124, 135, 141, 153, 158, 169, 175, 182, 191, 195],
      card: [10, 20, 31, 37, 51, 60, 68, 80, 90, 105, 119, 125, 138, 149, 162, 171, 185, 193],
      rocket: [16, 47, 72, 93, 118, 136, 164, 188],
      regions: ["town", "forest", "ice", "champion"],
    },
  };
  const REGION_NAMES = { town: "태초마을", forest: "상록숲", ice: "얼음 동굴", champion: "챔피언 로드" };

  // ---------- 카드 30종 (plan §6 · §7, 즉시/보관은 §0.4) ----------
  // keep: ability = 능력 칸(2) · held = 일반 칸(1) · now = 뽑자마자
  const CARDS = {
    P01: { cat: "ability", keep: "ability", poke: 25, who: "피카츄", name: "번개 질주", text: "내 말이 6칸 앞으로!" },
    P02: { cat: "ability", keep: "ability", poke: 4, who: "파이리", name: "불꽃 추진", text: "이번에 돌림판을 한 번 더 돌려요" },
    P03: { cat: "ability", keep: "ability", poke: 7, who: "꼬부기", name: "물방울 보호막", text: "로켓단에게 잡힐 때 1번 막아요", react: true },
    P04: { cat: "ability", keep: "ability", poke: 1, who: "이상해씨", name: "덩굴 채찍", text: "상대 3칸 뒤로, 나는 3칸 앞으로", target: true },
    P05: { cat: "ability", keep: "ability", poke: 94, who: "팬텀", name: "그림자 이동", text: "앞으로 15칸 안, 원하는 칸으로 슝" },
    P06: { cat: "ability", keep: "ability", poke: 143, who: "잠만보", name: "길막기", text: "상대의 다음 이동 -6칸", target: true },
    P07: { cat: "ability", keep: "ability", poke: 133, who: "이브이", name: "행운의 발견", text: "카드 2장을 보고 1장 골라요" },
    P08: { cat: "ability", keep: "ability", poke: 54, who: "고라파덕", name: "혼란의 파동", text: "로켓단이 1~12칸 앞이나 뒤로 휘청!" },
    P09: { cat: "ability", keep: "ability", poke: 39, who: "푸린", name: "자장가", text: "반반 확률로 상대가 다음 턴 쿨쿨", target: true },
    P10: { cat: "ability", keep: "ability", poke: 52, who: "나옹", name: "슬쩍하기", text: "상대 카드 1장을 몰래 가져와요", target: true },

    R01: { cat: "rocket", keep: "now", icon: 0, name: "로켓단 출동", text: "로켓단이 고른 방향으로 6칸!" },
    R02: { cat: "rocket", keep: "now", icon: 1, name: "로켓단 급습", text: "고른 사람의 3칸 앞이나 뒤에 펑!" },
    R03: { cat: "rocket", keep: "now", icon: 2, name: "로켓단 폭주", text: "다음 로켓단 턴에 돌림판을 두 번" },
    R04: { cat: "rocket", keep: "now", icon: 3, name: "로켓단 후퇴", text: "로켓단 10칸 뒤로" },
    R05: { cat: "rocket", keep: "now", icon: 4, name: "로켓단 휴식", text: "로켓단 다음 턴은 쉬어요" },
    R06: { cat: "rocket", keep: "now", icon: 5, name: "로켓단 소환", text: "로켓단이 가장 가까운 로켓단 칸으로" },
    R07: { cat: "rocket", keep: "now", icon: 6, name: "방향 전환", text: "로켓단이 다음 차례에 뒤로 달려요" },
    R08: { cat: "rocket", keep: "held", icon: 7, name: "로켓단 탈출", text: "잡힐 때 1번 쏙 빠져나가요", react: true },

    E01: { cat: "event", keep: "held", icon: 0, name: "한 번 더!", text: "돌림판을 돌린 뒤 한 번 더 돌릴 수 있어요" },
    E02: { cat: "event", keep: "now", icon: 1, name: "로켓 발사", text: "바로 10칸 앞으로!" },
    E03: { cat: "event", keep: "now", icon: 2, name: "자리 바꾸기", text: "고른 사람과 자리를 바꿔요", target: true },
    E04: { cat: "event", keep: "now", icon: 3, name: "사다리 발견", text: "앞에 있는 가장 가까운 사다리로" },
    E05: { cat: "event", keep: "now", icon: 4, name: "미끄럼 사고", text: "앗! 5칸 뒤로" },
    E06: { cat: "event", keep: "now", icon: 5, name: "보물상자", text: "능력 카드 1장을 받아요" },
    E07: { cat: "event", keep: "held", icon: 6, name: "행운의 숫자", text: "돌림판 숫자를 직접 골라요" },
    E08: { cat: "event", keep: "now", icon: 7, name: "길이 막혔다", text: "내 다음 이동 -2칸" },
    E09: { cat: "event", keep: "now", icon: 8, name: "순간이동", text: "바로 8칸 앞으로!" },
    E10: { cat: "event", keep: "now", icon: 9, name: "안전지대", text: "다음 로켓단 턴까지 안 잡혀요" },
    E11: { cat: "event", keep: "now", icon: 10, name: "퀴즈 도전", text: "문제를 맞히면 12칸 앞으로!" },
    E12: { cat: "event", keep: "now", icon: 11, name: "운명의 선택", text: "카드 2장 중 1장을 골라요" },
  };
  const ABILITY_IDS = Object.keys(CARDS).filter((k) => CARDS[k].cat === "ability");
  const ROCKET_IDS = Object.keys(CARDS).filter((k) => CARDS[k].cat === "rocket");
  const ALL_IDS = Object.keys(CARDS);
  // 혼자하기에선 걸 상대가 없는 카드 (덩굴채찍·길막기·자장가·슬쩍하기·자리바꾸기)
  const SOLO_SKIP = ["P04", "P06", "P09", "P10", "E03"];
  const abilityPool = (s) => (s.solo ? ABILITY_IDS.filter((k) => !SOLO_SKIP.includes(k)) : ABILITY_IDS);

  const RULES = {
    abilitySlots: 2, heldSlots: 1,
    kick: 8,            // 포획 처리 뒤 로켓단 튕겨내기
    capturePenalty: 5,  // 탈출 실패
    exactFinish: true,  // 결승은 딱 맞아야 (넘치면 그 자리) — 2026-10-17 사용자 요청
    spin: 12,           // 사람 돌림판 1~12 (영어 One~Twelve) — 주사위 대신 (2026-10-17 사용자 요청)
    rocketSpin: 8,      // 로켓단 돌림판 1~8
    stomp: 10,          // 다른 캐릭터가 서 있는 칸에 멈추면 밟힌 쪽이 10칸 뒤로 (예전: 내가 넘어서 한 칸 앞)
    regroupGap: 20, regroupBehind: 6,
    bonusEvery: 3,      // 개인 3번째 턴마다 보너스 퀴즈
    reward: { first: 3, hint: 2, bonus: 1, challenge: 12 },
  };

  // ---------- 난수 (mulberry32, 상태는 s.rng) ----------
  function rnd(s) {
    let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rint = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));
  // s.force: 시험용 — 주사위 눈을 미리 정해 둔다 (저장되는 판에는 없다)
  const spinOf = (s, max) => (s.force && s.force.length ? s.force.shift() : rint(s, 1, max));
  const spin = (s) => spinOf(s, RULES.spin);
  const rocketSpin = (s) => spinOf(s, RULES.rocketSpin);
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(s) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- 맵 도우미 ----------
  function cellType(map, n) {
    if (map.ladders[n]) return "ladder";
    if (map.slides[n]) return "slide";
    if (map.quiz.includes(n)) return "quiz";
    if (map.card.includes(n)) return "card";
    if (map.rocket.includes(n)) return "rocket";
    return null;
  }
  function chuteAt(map, n) {
    if (map.ladders[n]) return { kind: "ladder", to: map.ladders[n] };
    if (map.slides[n]) return { kind: "slide", to: map.slides[n] };
    return null;
  }
  /** 맵 검사: 시작 칸 겹침·범위 — 문제 목록을 돌려준다 (비어 있으면 통과) */
  function validateMap(map) {
    const errs = [];
    const seen = {};
    const mark = (n, what) => {
      if (n < 2 || n >= map.goal) errs.push(`${what} ${n} 범위 밖`);
      if (seen[n]) errs.push(`${n}번 칸이 ${seen[n]}·${what} 겹침`);
      seen[n] = what;
    };
    for (const k in map.ladders) { mark(+k, "사다리"); if (map.ladders[k] <= +k) errs.push(`사다리 ${k} 가 내려감`); }
    for (const k in map.slides) { mark(+k, "미끄럼틀"); if (map.slides[k] >= +k) errs.push(`미끄럼틀 ${k} 가 올라감`); }
    map.quiz.forEach((n) => mark(n, "퀴즈"));
    map.card.forEach((n) => mark(n, "카드"));
    map.rocket.forEach((n) => mark(n, "로켓단"));
    // 도착 칸이 다른 장치의 시작이면 연쇄처럼 보인다 → 경고
    for (const k in map.ladders) if (chuteAt(map, map.ladders[k])) errs.push(`사다리 ${k}→${map.ladders[k]} 도착 칸이 장치 시작`);
    for (const k in map.slides) if (chuteAt(map, map.slides[k])) errs.push(`미끄럼틀 ${k}→${map.slides[k]} 도착 칸이 장치 시작`);
    return errs;
  }
  /** 칸 번호 → 판 위 줄·칸 (아래에서 위로 지그재그, 10칸씩) */
  function cellXY(n, cols) {
    cols = cols || 10;
    const row = Math.floor((n - 1) / cols);
    const k = (n - 1) % cols;
    return { row, col: row % 2 === 0 ? k : cols - 1 - k };
  }

  // ---------- 판 만들기 ----------
  /**
   * opts: { mode: 100|200, seed, players: [{ name, trainer, adult, math, en }] }
   */
  function createGame(opts) {
    const map = MAPS[opts.mode];
    const s = {
      v: 1, mode: opts.mode, goal: map.goal, rng: (opts.seed >>> 0) || 1,
      round: 1, turn: 0, phase: "players", winner: null, rocketWon: false, quizzes: 0, captures: 0, solo: opts.players.length === 1,
      players: opts.players.map((p) => ({
        name: p.name, trainer: p.trainer, adult: !!p.adult, cpu: !!p.cpu,
        math: p.math || 3, en: p.en || 2,
        pos: 1, turns: 0, ability: [], held: null,
        st: { minus6: false, minus2: false, skip: false, safe: false },
        stamps: 0, quizCount: 0,
      })),
      rocket: { pos: map.rocketStart, skip: false, double: false, reverse: false },
      checkpoints: {}, deck: [], turnQuiz: false, lastRocket: null,
    };
    refillDeck(s);
    return s;
  }
  function refillDeck(s) {
    s.deck = shuffle(s, ALL_IDS.concat(ALL_IDS));
  }
  function drawFromDeck(s, exclude) {
    const skip = (exclude || []).concat(s.solo ? SOLO_SKIP : []);
    for (let guard = 0; guard < 200; guard++) {
      if (!s.deck.length) refillDeck(s);
      const id = s.deck.pop();
      if (!skip.includes(id)) return id;
    }
    return "E02";
  }
  const mapOf = (s) => MAPS[s.mode];
  const others = (s, pi) => s.players.map((_, i) => i).filter((i) => i !== pi);

  // ---------- 거리·위험 ----------
  function distance(s, pi) { return Math.abs(s.rocket.pos - s.players[pi].pos); }
  function danger(s, pi) {
    const d = distance(s, pi);
    if (d === 0) return "capture";
    if (d <= 3) return "danger";
    if (d <= 6) return "caution";
    return "safe";
  }
  /** 로켓단이 쫓는 사람: 숫자 거리 가장 작은 사람, 같으면 칸 번호 큰 사람 */
  function rocketTarget(s) {
    let best = -1;
    s.players.forEach((p, i) => {
      if (best < 0) { best = i; return; }
      const d = distance(s, i), bd = distance(s, best);
      if (d < bd || (d === bd && p.pos > s.players[best].pos)) best = i;
    });
    return best;
  }

  // ---------- 이동 ----------
  function clampPlayer(s, n) { return Math.max(1, Math.min(s.goal, n)); }
  function clampRocket(s, n) { return Math.max(1, Math.min(s.goal - 1, n)); }

  async function win(s, io, pi) {
    s.winner = pi;
    await io.show({ type: "win", who: pi });
  }

  /** 200칸·100칸 재합류: 선두가 체크포인트에 처음 들어갈 때 1회 */
  async function checkRegroup(s, io) {
    const lead = Math.max(...s.players.map((p) => p.pos));
    for (const cp of mapOf(s).checkpoints) {
      if (s.checkpoints[cp] || lead < cp) continue;
      s.checkpoints[cp] = true;
      if (s.rocket.pos < lead - RULES.regroupGap) {
        const from = s.rocket.pos;
        s.rocket.pos = clampRocket(s, lead - RULES.regroupBehind);
        await io.show({ type: "regroup", from, to: s.rocket.pos, cp });
      }
    }
  }

  /**
   * 말을 to 칸으로 옮긴다. o.via: dice|card|reward|penalty|swap
   *  o.chute(기본 true) 사다리·미끄럼틀 1회, o.capture(기본 true) 로켓단과 같은 칸이면 포획
   *  → { rode, captured }
   */
  /** 다른 캐릭터가 서 있는 칸인지 (출발 1번 칸·결승은 같이 있어도 된다) */
  function occupied(s, pi, n, ignore) {
    return n > 1 && n < s.goal && s.players.some((q, i) => i !== pi && i !== ignore && q.pos === n);
  }
  /** 밟기: 내가 멈춘 칸에 있던 캐릭터는 10칸 뒤로 (그 칸에도 누가 있으면 더 뒤 빈칸, 장치·포획 없음) */
  async function stomp(s, io, pi, ignore) {
    const p = s.players[pi];
    for (let vi = 0; vi < s.players.length; vi++) {
      const q = s.players[vi];
      if (vi === pi || vi === ignore || q.pos !== p.pos || p.pos <= 1 || p.pos >= s.goal) continue;
      const from = q.pos;
      let to = Math.max(1, from - RULES.stomp);
      while (to > 1 && s.players.some((x, i) => i !== vi && x.pos === to)) to--;
      q.pos = to;
      await io.show({ type: "stomp", who: pi, victim: vi, from, to });
    }
  }

  async function placePlayer(s, io, pi, to, o) {
    o = o || {};
    const p = s.players[pi];
    const from = p.pos;
    if (RULES.exactFinish && to > s.goal) {
      // 결승을 넘으면 못 들어가고 그 자리 (딱 맞아야 한다)
      await io.show({ type: "over", who: pi, need: s.goal - from, want: to - from });
      return { rode: false, captured: false, blocked: true };
    }
    p.pos = clampPlayer(s, to);
    await io.show({ type: "move", who: pi, from, to: p.pos, via: o.via || "card" });
    await stomp(s, io, pi, o.ignore);
    if (p.pos >= s.goal) { await win(s, io, pi); return { rode: false, captured: false }; }
    let rode = false;
    if (o.chute !== false) {
      const c = chuteAt(mapOf(s), p.pos);
      if (c) {
        const at = p.pos;
        p.pos = c.to;
        rode = true;
        await io.show({ type: "chute", who: pi, kind: c.kind, from: at, to: c.to });
        if (p.pos >= s.goal) { await win(s, io, pi); return { rode, captured: false }; }
        await stomp(s, io, pi, o.ignore); // 사다리·미끄럼틀 도착 칸에 누가 있어도 밟는다
      }
    }
    await checkRegroup(s, io);
    let captured = false;
    if (o.capture !== false && p.pos === s.rocket.pos) {
      captured = true;
      await captureGroup(s, io, [pi]);
    }
    return { rode, captured };
  }

  /** 로켓단 이동(주사위·출동·후퇴·혼란): 사다리·미끄럼틀 1회 → 같은 칸 사람 포획 */
  async function moveRocket(s, io, delta, o) {
    o = o || {};
    const r = s.rocket;
    const from = r.pos;
    if (r.pos + delta > s.goal) {
      // 로켓단도 딱 맞아야 도착 (넘치면 그 자리)
      await io.show({ type: "rocket-over", need: s.goal - from, want: delta });
      return [];
    }
    r.pos = Math.max(1, r.pos + delta);
    await io.show({ type: "rocket-move", from, to: r.pos, via: o.via || "card" });
    if (r.pos >= s.goal) { await rocketWins(s, io); return []; }
    const c = chuteAt(mapOf(s), r.pos);
    if (c) {
      const at = r.pos;
      r.pos = clampRocket(s, c.to);
      await io.show({ type: "rocket-chute", kind: c.kind, from: at, to: r.pos });
    }
    const hit = s.players.map((p, i) => (p.pos === r.pos ? i : -1)).filter((i) => i >= 0);
    if (hit.length) await captureGroup(s, io, hit);
    return hit;
  }
  /** 로켓단이 먼저 100칸에 도착 → 모두 진다 (승자 없음, 2026-10-17 사용자 요청) */
  async function rocketWins(s, io) {
    s.winner = -1;
    s.rocketWon = true;
    await io.show({ type: "rocket-win" });
  }
  /** 로켓단 순간 등장(급습·소환·재합류·튕겨내기): 장치·포획 없음 */
  async function teleportRocket(s, io, to, why) {
    const from = s.rocket.pos;
    s.rocket.pos = clampRocket(s, to);
    await io.show({ type: "rocket-warp", from, to: s.rocket.pos, why });
  }

  // ---------- 포획 ----------
  async function captureGroup(s, io, pis) {
    for (const pi of pis) {
      if (s.winner != null) return;
      await captureOne(s, io, pi);
    }
    // 연속 포획 방지: 로켓단 튕겨내기 (한 번만)
    await teleportRocket(s, io, s.rocket.pos - RULES.kick, "kick");
  }
  async function captureOne(s, io, pi) {
    const p = s.players[pi];
    s.captures++;
    await io.show({ type: "capture", who: pi });
    if (p.st.safe) {
      await io.show({ type: "capture-safe", who: pi });
      return "safe";
    }
    const defs = [];
    if (p.ability.includes("P03")) defs.push("P03");
    if (p.held === "R08") defs.push("R08");
    if (defs.length) {
      const d = await io.choose("defend", { who: pi, options: defs });
      if (d && defs.includes(d)) {
        consume(p, d);
        await io.show({ type: "defend", who: pi, card: d });
        return "defended";
      }
    }
    const res = await askQuiz(s, io, pi, "escape");
    if (res === "fail") {
      await io.show({ type: "escape-fail", who: pi });
      await placePlayer(s, io, pi, p.pos - RULES.capturePenalty, { via: "penalty", chute: false, capture: false });
      return "penalty";
    }
    await io.show({ type: "escaped", who: pi, res });
    return "escaped";
  }

  // ---------- 퀴즈 ----------
  async function askQuiz(s, io, pi, reason) {
    s.quizzes++;
    s.players[pi].quizCount++;
    if (pi === s.turn) s.turnQuiz = true;
    const res = await io.quiz(pi, { reason });
    if (res === "explained") s.players[pi].stamps++;
    return res;
  }
  /** 퀴즈 칸·보너스·퀴즈 도전 보상 */
  async function quizWithReward(s, io, pi, reason) {
    const res = await askQuiz(s, io, pi, reason);
    const p = s.players[pi];
    const step = async (n, why) => {
      await io.show({ type: "reward", who: pi, move: n, why });
      await placePlayer(s, io, pi, p.pos + n, { via: "reward" });
    };
    if (reason === "bonus") {
      if (res === "first" || res === "hint") await step(RULES.reward.bonus, "bonus");
    } else if (reason === "challenge") {
      if (res === "first" || res === "hint") await step(RULES.reward.challenge, "challenge");
      else await io.show({ type: "reward", who: pi, move: 0, why: "challenge-miss" });
    } else if (res === "first") {
      const pick = await io.choose("reward", { who: pi, move: RULES.reward.first });
      if (pick === "card") {
        const pool = abilityPool(s);
        const id = pool[rint(s, 0, pool.length - 1)];
        await io.show({ type: "draw", who: pi, card: id, from: "reward" });
        await gainCard(s, io, pi, id);
      } else await step(RULES.reward.first, "first");
    } else if (res === "hint") {
      await step(RULES.reward.hint, "hint");
    } else if (res === "explained") {
      await io.show({ type: "reward", who: pi, move: 0, why: "stamp" });
    }
    return res;
  }

  // ---------- 카드 보관 ----------
  function consume(p, id) {
    const k = p.ability.indexOf(id);
    if (k >= 0) p.ability.splice(k, 1);
    else if (p.held === id) p.held = null;
  }
  function cardsOf(p) { return p.ability.concat(p.held ? [p.held] : []); }

  /** 보관 카드 얻기 (가득 차면 버릴 카드를 고른다 — 자동 폐기 금지) */
  async function gainCard(s, io, pi, id) {
    const p = s.players[pi];
    const keep = CARDS[id].keep;
    if (keep === "ability") {
      if (p.ability.length < RULES.abilitySlots) { p.ability.push(id); return; }
      const drop = await io.choose("discard", { who: pi, have: p.ability.slice(), add: id });
      if (drop === id) return;
      const k = p.ability.indexOf(drop);
      p.ability.splice(k >= 0 ? k : 0, 1);
      p.ability.push(id);
    } else if (keep === "held") {
      if (!p.held) { p.held = id; return; }
      const drop = await io.choose("discard", { who: pi, have: [p.held], add: id });
      if (drop !== id) p.held = id;
    }
  }

  /** 카드 한 장 처리 (뽑기·고르기 결과). depth: 추가 추첨 깊이 */
  async function resolveCard(s, io, pi, id, depth) {
    const c = CARDS[id];
    const p = s.players[pi];
    if (c.keep !== "now") return gainCard(s, io, pi, id);
    await io.show({ type: "effect", who: pi, card: id });
    switch (id) {
      case "E02": await placePlayer(s, io, pi, p.pos + 10, { via: "card" }); break;
      case "E09": await placePlayer(s, io, pi, p.pos + 8, { via: "card" }); break;
      case "E05": await placePlayer(s, io, pi, p.pos - 5, { via: "card" }); break;
      case "E03": {
        if (!others(s, pi).length) { await io.show({ type: "nothing", who: pi, card: id }); break; }
        const t = await io.choose("target", { who: pi, card: id, options: others(s, pi) });
        const q = s.players[t];
        const a = p.pos, b = q.pos;
        await io.show({ type: "swap", who: pi, target: t });
        await placePlayer(s, io, pi, b, { via: "swap", ignore: t }); // 맞바꾸는 중엔 넘지 않음
        if (s.winner == null) await placePlayer(s, io, t, a, { via: "swap" });
        break;
      }
      case "E04": {
        const starts = Object.keys(mapOf(s).ladders).map(Number).filter((n) => n > p.pos).sort((x, y) => x - y);
        if (starts.length) await placePlayer(s, io, pi, starts[0], { via: "card" });
        else await io.show({ type: "nothing", who: pi, card: id });
        break;
      }
      case "E06": {
        const pool = abilityPool(s);
        const nid = pool[rint(s, 0, pool.length - 1)];
        await io.show({ type: "draw", who: pi, card: nid, from: "chest" });
        await gainCard(s, io, pi, nid);
        break;
      }
      case "E08": p.st.minus2 = true; break;
      case "E10": p.st.safe = true; break;
      case "E11": await quizWithReward(s, io, pi, "challenge"); break;
      case "E12": await pickOneOfTwo(s, io, pi, depth); break;
      case "R01": {
        const dir = await io.choose("direction", { who: pi, card: id, n: 6 });
        await moveRocket(s, io, (dir < 0 ? -1 : 1) * 6, { via: "card" });
        break;
      }
      case "R02": {
        const t = await io.choose("target", { who: pi, card: id, options: others(s, pi).length ? others(s, pi) : [pi] });
        const dir = await io.choose("direction", { who: pi, card: id, n: 3, target: t });
        await teleportRocket(s, io, s.players[t].pos + (dir < 0 ? -3 : 3), "ambush");
        break;
      }
      case "R03": s.rocket.double = true; break;
      case "R04": await moveRocket(s, io, -10, { via: "card" }); break;
      case "R05": s.rocket.skip = true; break;
      case "R06": {
        const r = s.rocket.pos;
        const cells = mapOf(s).rocket.slice().sort((x, y) => Math.abs(x - r) - Math.abs(y - r) || x - y);
        await teleportRocket(s, io, cells[0], "summon");
        break;
      }
      case "R07": s.rocket.reverse = true; break;
    }
  }

  /** 2장 보고 1장 (이브이 P07 · 운명의 선택 E12) — 추가 추첨 깊이 1 */
  async function pickOneOfTwo(s, io, pi, depth) {
    if ((depth || 0) >= 1) { await io.show({ type: "nothing", who: pi }); return; }
    const a = drawFromDeck(s, ["E12", "P07"]);
    const b = drawFromDeck(s, ["E12", "P07"]);
    const k = await io.choose("pick", { who: pi, cards: [a, b] });
    const id = k === 1 ? b : a;
    await io.show({ type: "draw", who: pi, card: id, from: "pick" });
    await resolveCard(s, io, pi, id, (depth || 0) + 1);
  }

  // ---------- 능동 카드 ----------
  /** 지금 쓸 수 있는 카드 목록: [{ id, ok, why, targets }] */
  function usableCards(s, pi) {
    const p = s.players[pi];
    const out = [];
    for (const id of cardsOf(p)) {
      const c = CARDS[id];
      let ok = true, why = "", targets = null;
      if (id === "P03" || id === "R08") { ok = false; why = "잡힐 때 써요"; }
      else if (id === "E01") { ok = false; why = "주사위를 굴린 뒤 써요"; }
      else if (c.target) {
        targets = others(s, pi).filter((t) => {
          const q = s.players[t];
          if (id === "P06" || id === "P09") return !q.st.minus6 && !q.st.skip;
          if (id === "P10") return cardsOf(q).length > 0;
          return true;
        });
        if (!targets.length) {
          ok = false;
          why = id === "P10" ? "카드를 가진 사람이 없어요" : "걸 수 있는 사람이 없어요";
        }
      }
      out.push({ id, ok, why, targets });
    }
    return out;
  }

  /** 능동 카드 사용 → { extraDie, lucky } */
  async function useCard(s, io, pi, id) {
    const p = s.players[pi];
    const u = usableCards(s, pi).find((x) => x.id === id);
    if (!u || !u.ok) return {};
    consume(p, id);
    await io.show({ type: "card-use", who: pi, card: id });
    const pickTarget = () => io.choose("target", { who: pi, card: id, options: u.targets });
    switch (id) {
      case "P01": await placePlayer(s, io, pi, p.pos + 6, { via: "card" }); return {};
      case "P02": return { extraDie: 1 };
      case "P04": {
        const t = await pickTarget();
        await placePlayer(s, io, t, s.players[t].pos - 3, { via: "card" });
        if (s.winner == null) await placePlayer(s, io, pi, p.pos + 3, { via: "card" });
        return {};
      }
      case "P05": {
        const to = await io.choose("cell", { who: pi, from: Math.min(s.goal, p.pos + 1), to: Math.min(s.goal, p.pos + 15) });
        const n = Math.max(p.pos + 1, Math.min(p.pos + 15, to | 0));
        await placePlayer(s, io, pi, n, { via: "card" });
        return {};
      }
      case "P06": {
        const t = await pickTarget();
        s.players[t].st.minus6 = true;
        await io.show({ type: "status", who: pi, target: t, st: "minus6" });
        return {};
      }
      case "P07": await pickOneOfTwo(s, io, pi, 0); return {};
      case "P08": {
        const n = rint(s, 1, 12);
        const dir = rnd(s) < 0.5 ? -1 : 1;
        await io.show({ type: "psyduck", n, dir });
        await moveRocket(s, io, dir * n, { via: "card" });
        return {};
      }
      case "P09": {
        const t = await pickTarget();
        const ok = rnd(s) < 0.5;
        if (ok) s.players[t].st.skip = true;
        await io.show({ type: "lullaby", who: pi, target: t, ok });
        return {};
      }
      case "P10": {
        const t = await pickTarget();
        const q = s.players[t];
        const pool = cardsOf(q);
        const got = pool[rint(s, 0, pool.length - 1)];
        consume(q, got);
        await io.show({ type: "steal", who: pi, target: t, card: got });
        await gainCard(s, io, pi, got);
        return {};
      }
      case "E07": {
        const v = await io.choose("lucky", { who: pi });
        return { lucky: Math.max(1, Math.min(RULES.spin, v | 0 || RULES.spin)) };
      }
    }
    return {};
  }

  // ---------- 주사위 ----------
  function rollDice(s, n, lucky) {
    const dice = [];
    for (let i = 0; i < n; i++) dice.push(spin(s));
    if (lucky) dice[0] = lucky;
    return dice;
  }
  function baseDice(s) { return MAPS[s.mode].dice; }
  /** 이번 차례 주사위 개수 (화면 미리보기용) */
  function diceFor() { return 1; } // 돌림판은 늘 한 번 (파이리 카드만 두 번)

  // ---------- 칸 이벤트 ----------
  async function cellEvent(s, io, pi) {
    const p = s.players[pi];
    const t = cellType(mapOf(s), p.pos);
    if (t === "quiz") {
      await io.show({ type: "cell", who: pi, cell: "quiz" });
      await quizWithReward(s, io, pi, "cell");
    } else if (t === "card") {
      await io.show({ type: "cell", who: pi, cell: "card" });
      const id = drawFromDeck(s);
      await io.show({ type: "draw", who: pi, card: id, from: "deck" });
      await resolveCard(s, io, pi, id, 0);
    } else if (t === "rocket") {
      await io.show({ type: "cell", who: pi, cell: "rocket" });
      const id = ROCKET_IDS[rint(s, 0, ROCKET_IDS.length - 1)];
      await io.show({ type: "draw", who: pi, card: id, from: "rocket" });
      await resolveCard(s, io, pi, id, 0);
    }
  }

  // ---------- 한 사람 턴 ----------
  async function playerTurn(s, io) {
    const pi = s.turn;
    const p = s.players[pi];
    p.turns++;
    s.turnQuiz = false;
    await io.show({ type: "turn", who: pi });
    if (p.st.skip) {
      p.st.skip = false;
      await io.show({ type: "skip", who: pi });
      return;
    }
    // 1) 능동 카드 최대 1장
    let extraDie = 0, lucky = null;
    const usable = usableCards(s, pi);
    // 카드가 없어도 묻는다 — 아이가 주사위 버튼을 직접 누른다
    const act = await io.choose("action", { who: pi, cards: usable });
    if (act && act !== "roll") {
      const r = await useCard(s, io, pi, act);
      if (s.winner != null) return;
      extraDie = r.extraDie || 0;
      lucky = r.lucky || null;
      await io.choose("spin", { who: pi }); // 카드를 쓴 뒤에도 아이가 돌림판을 직접 누른다
    }
    // 2) 주사위
    const n = baseDice(s) + extraDie;
    let dice = rollDice(s, n, lucky);
    await io.show({ type: "dice", who: pi, dice, lucky });
    if (p.held === "E01" && (await io.choose("reroll", { who: pi, dice }))) {
      consume(p, "E01");
      dice = rollDice(s, n, lucky);
      await io.show({ type: "dice", who: pi, dice, lucky, reroll: true });
    }
    // 3) 이동량
    let move = dice.reduce((a, b) => a + b, 0);
    const mods = [];
    if (p.st.minus6) { move -= 6; p.st.minus6 = false; mods.push("minus6"); }
    if (p.st.minus2) { move -= 2; p.st.minus2 = false; mods.push("minus2"); }
    if (mods.length) await io.show({ type: "modify", who: pi, mods, move });
    if (move === 0) {
      await io.show({ type: "stay", who: pi });
    } else {
      const res = await placePlayer(s, io, pi, p.pos + move, { via: "dice" });
      if (s.winner != null) return;
      // 주사위로 멈춘 칸만 이벤트 (사다리·미끄럼틀 도착 칸·포획 뒤에는 없음)
      if (!res.rode && !res.captured && !res.blocked) await cellEvent(s, io, pi);
    }
    if (s.winner != null) return;
    // 4) 정기 보너스 퀴즈
    if (p.turns % RULES.bonusEvery === 0 && !s.turnQuiz) {
      await io.show({ type: "bonus-quiz", who: pi });
      await quizWithReward(s, io, pi, "bonus");
    }
  }

  // ---------- 로켓단 턴 ----------
  async function rocketTurn(s, io) {
    const r = s.rocket;
    await io.show({ type: "rocket-turn" });
    if (r.skip) {
      r.skip = false;
      await io.show({ type: "rocket-rest" });
    } else {
      // 로켓단은 앞으로만 달린다 (2026-10-17 사용자 요청) — 방향 전환 카드를 맞았을 때만 한 번 뒤로
      const t = rocketTarget(s);
      let dir = 1;
      if (r.reverse) { dir = -1; r.reverse = false; }
      const rolls = r.double ? [rocketSpin(s), rocketSpin(s)] : [rocketSpin(s)];
      r.double = false;
      s.lastRocket = { target: t, dir, rolls };
      await io.show({ type: "rocket-dice", target: t, dir, dice: rolls });
      await moveRocket(s, io, dir * rolls.reduce((a, b) => a + b, 0), { via: "dice" });
    }
    // 안전지대(E10)는 이 로켓단 턴까지
    s.players.forEach((p) => { p.st.safe = false; });
  }

  /** 한 걸음: 사람 한 명의 턴 또는 로켓단 턴. 끝나면 다음 차례로 넘긴다. */
  async function step(s, io) {
    if (s.winner != null) return;
    if (s.phase === "players") {
      await playerTurn(s, io);
      if (s.winner != null) return;
      if (s.turn + 1 < s.players.length) s.turn++;
      else s.phase = "rocket";
    } else {
      await rocketTurn(s, io);
      if (s.winner != null) return;
      s.phase = "players";
      s.turn = 0;
      s.round++;
    }
  }

  const API = {
    TRAINERS, MAPS, REGION_NAMES, CARDS, ABILITY_IDS, ROCKET_IDS, ALL_IDS, RULES,
    cellType, chuteAt, validateMap, cellXY, createGame, distance, danger, rocketTarget,
    usableCards, cardsOf, step, diceFor, SOLO_SKIP, playerTurn, rocketTurn, placePlayer, moveRocket, teleportRocket,
    captureGroup, resolveCard, useCard, gainCard, cellEvent, rollDice, rnd, rint,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Rules = API;
})(typeof window !== "undefined" ? window : globalThis);
