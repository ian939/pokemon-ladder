/* 문제 고르기 · 학습 기록 (plan.md §9.2 · §10 · §12.4 · §12.5)
 *
 * - 수학·영어 번갈아 출제, 레벨은 사람마다 따로 (수학 2~4 · 영어 1~4).
 * - 레벨 = 그 사람의 "중심" 난이도. 실제 출제는 아래 섞기 표 + 최근 5문항으로 살짝 조절.
 * - 약점 개념(풀이를 보거나 못 푼 개념)은 다음 판에서 30% 확률로 다시 나온다 (같은 숫자 X, 새 문항).
 * - 기록은 이름별로 localStorage 에 (Learn.load/save 는 app.js 의 Store 가 넘겨준다).
 */
(function (root) {
  "use strict";
  const M = root.MathQ || (typeof require !== "undefined" ? require("./quiz-math.js") : null);
  const E = root.EnQ || (typeof require !== "undefined" ? require("./quiz-en.js") : null);

  // 레벨별 섞기 (plan §9.2 초기 수학 비중 30/45/25 = 수학 LV.3)
  // 한 단계 위 레벨은 최대 10% (2026-10-17 사용자 확정 B안)
  const MIX = {
    math: { 2: { 2: 90, 3: 10 }, 3: { 2: 30, 3: 60, 4: 10 }, 4: { 2: 15, 3: 40, 4: 45 } },
    en: { 1: { 1: 90, 2: 10 }, 2: { 1: 30, 2: 60, 3: 10 }, 3: { 1: 10, 2: 30, 3: 50, 4: 10 }, 4: { 2: 20, 3: 40, 4: 40 } },
  };
  const UP_STREAK = 3; // 한 번에 맞히기 3연속이면 한 단계 다시 올림 (설정 레벨까지만)
  const RANGE = { math: [2, 4], en: [1, 4] };

  function blank() { return { concepts: {}, recent: { math: [], en: [] }, total: 0, games: 0 }; }

  /** 최근 5문항으로 조절 (+1 어렵게 / -1 쉽게 / 0) */
  function bias(rec, subj) {
    const r = (rec && rec.recent[subj]) || [];
    if (r.length < 5) return 0;
    const last = r.slice(-5);
    const first = last.filter((x) => x === "first").length;
    const right = last.filter((x) => x === "first" || x === "hint").length;
    if (first >= 4) return 1;
    if (right <= 2) return -1;
    return 0;
  }
  function weightedLevel(subj, lv, b, r) {
    const [lo, hi] = RANGE[subj];
    let L = Math.max(lo, Math.min(hi, lv));
    let mix = Object.assign({}, MIX[subj][L]);
    // 조절은 섞기를 한 칸 옆 레벨 쪽으로 15% 옮기는 정도 (레벨을 5문제로 단정하지 않음)
    const keys = Object.keys(mix).map(Number).sort((a, c) => a - c);
    if (b > 0 && keys[0] < hi) { const from = keys[0]; const to = Math.min(hi, keys[keys.length - 1] + (mix[hi] ? 0 : 1)); mix[from] -= Math.min(15, mix[from]); mix[to] = (mix[to] || 0) + 15; }
    if (b < 0) { const from = keys[keys.length - 1]; const to = Math.max(lo, keys[0]); mix[from] -= Math.min(15, mix[from]); mix[to] = (mix[to] || 0) + 15; }
    let t = r() * Object.values(mix).reduce((a, c) => a + c, 0);
    for (const k of Object.keys(mix)) { t -= mix[k]; if (t < 0) return +k; }
    return L;
  }
  function weakConcepts(rec, subj) {
    if (!rec) return [];
    return Object.entries(rec.concepts)
      .filter(([c, v]) => (subj === "math" ? c[0] === "M" : c[0] === "E") && v.needReview)
      .map(([c]) => c);
  }

  /**
   * 다음 문제. player: { math, en, lastSubj } · rec: 그 이름의 기록 · used: Set(문항 id)
   * opt.subject 로 과목을 정할 수 있다.
   */
  function pick(player, rec, used, r, opt) {
    r = r || Math.random;
    opt = opt || {};
    const subj = opt.subject || (player.lastSubj === "math" ? "en" : "math");
    player.lastSubj = subj;
    const cur = subj === "math" ? player.math : player.en;
    const lv = weightedLevel(subj, cur, 0, r);
    // 약점 복습도 지금 레벨을 넘지 않게
    const weak = weakConcepts(rec, subj).filter((c) => (subj === "math" ? M.LEVEL[c] <= cur : E.byLevel(Math.min(cur, lv)).includes(c)));
    let concept;
    if (weak.length && r() < 0.3) concept = weak[Math.floor(r() * weak.length)];
    else {
      const pool = subj === "math" ? M.byLevel(lv) : E.byLevel(lv);
      concept = pool[Math.floor(r() * pool.length)];
    }
    for (let k = 0; k < 20; k++) {
      const q = subj === "math" ? M.make(concept, r) : E.make(concept, r, used, lv);
      if (!used || !used.has(q.id)) { if (used) used.add(q.id); return q; }
    }
    return subj === "math" ? M.make(concept, r) : E.make(concept, r, null, lv);
  }
  function similar(q, r, used) {
    const n = q.subject === "math" ? M.similar(q, r) : E.similar(q, r, used);
    if (used) used.add(n.id);
    return n;
  }

  /**
   * 레벨 오르내림 (2026-10-17 사용자 요청: 틀리면 레벨 다운)
   * 한 번에 못 맞히면(힌트·풀이·못 풂) 그 과목 -1, 한 번에 맞히기 3연속이면 +1 (판 시작 때 설정한 레벨까지만).
   * player.set = { math, en } 은 판 시작 때 설정값. → 바뀌었으면 { subject, from, to } 를 돌려준다
   */
  function adjust(player, subject, res) {
    const [lo] = RANGE[subject];
    player.set = player.set || { math: player.math, en: player.en };
    player.streak = player.streak || { math: 0, en: 0 };
    const from = player[subject];
    if (res === "first") {
      player.streak[subject]++;
      if (player.streak[subject] >= UP_STREAK && from < player.set[subject]) {
        player[subject] = from + 1;
        player.streak[subject] = 0;
      }
    } else {
      player.streak[subject] = 0;
      if (from > lo) player[subject] = from - 1;
    }
    return player[subject] !== from ? { subject, from, to: player[subject] } : null;
  }

  /** 결과 기록. res: first | hint | explained | fail */
  function record(rec, q, res) {
    rec = rec || blank();
    const c = (rec.concepts[q.concept] = rec.concepts[q.concept] || { n: 0, first: 0, hint: 0, explained: 0, fail: 0, needReview: false });
    c.n++; c[res]++;
    c.last = Date.now();
    // 바로 맞히면 복습 표시를 지우고, 풀이를 봤거나 못 풀면 복습 필요
    if (res === "first") c.needReview = false;
    else if (res === "explained" || res === "fail") c.needReview = true;
    const r = rec.recent[q.subject];
    r.push(res);
    if (r.length > 20) r.shift();
    rec.total++;
    return rec;
  }
  /** 이해가 부족한 개념 1~3개 (plan §12.5) */
  function weakList(rec, n) {
    if (!rec) return [];
    return Object.entries(rec.concepts)
      .filter(([, v]) => v.needReview || (v.n >= 3 && v.first / v.n < 0.5))
      .sort((a, b) => (b[1].fail + b[1].explained) - (a[1].fail + a[1].explained))
      .slice(0, n || 3)
      .map(([c]) => ({ concept: c, name: c[0] === "M" ? M.NAMES[c] : E.NAMES[c] }));
  }
  function conceptName(c) { return c[0] === "M" ? M.NAMES[c] : E.NAMES[c]; }

  const API = { pick, similar, record, adjust, blank, bias, weakList, weakConcepts, conceptName, MIX, UP_STREAK };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Learn = API;
})(typeof window !== "undefined" ? window : globalThis);
