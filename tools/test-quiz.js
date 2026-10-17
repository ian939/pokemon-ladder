// 문제 은행 검사 — plan.md §12.2 품질 규칙
//   node tools/test-quiz.js
const M = require("../js/quiz-math.js");
const E = require("../js/quiz-en.js");
const L = require("../js/learn.js");

let pass = 0, fail = 0;
const bad = {};
function ok(c, name) {
  if (c) pass++;
  else { fail++; if (!bad[name]) console.log("❌ " + name); bad[name] = (bad[name] || 0) + 1; }
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)})`);
function mulberry(seed) {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 식을 직접 계산해서 정답과 맞는지 (□ 는 정답으로 채운다)
function evalExpr(expr, ans) {
  const e = expr.replace("□", ans).replace(/×/g, "*");
  const [l, rr] = e.split("=").map((x) => x.trim());
  if (rr === "?") return null;
  // eslint-disable-next-line no-new-func
  return Function(`return (${l}) === (${rr})`)();
}

function common(q, tag) {
  ok(q.prompt && q.prompt.length > 3, `${tag} 문제 글`);
  ok(q.hint && q.hint.length > 3, `${tag} 힌트`);
  ok(Array.isArray(q.explain) && q.explain.length >= 1, `${tag} 풀이`);
  if (q.kind === "choice") {
    ok(new Set(q.choices).size === q.choices.length, `${tag} 보기 중복 없음`);
    ok(q.choices.filter((c) => c === q.answer).length === 1, `${tag} 정답이 보기에 정확히 하나`);
    ok(q.choices.length >= 2 && q.choices.length <= 4, `${tag} 보기 2~4개`);
  } else if (q.kind === "order") {
    ok(JSON.stringify(q.answer.slice().sort()) === JSON.stringify(q.tokens.filter((t) => q.answer.includes(t)).sort()) || q.tokens.length > q.answer.length, `${tag} 조각으로 정답을 만들 수 있음`);
    ok(q.answer.every((a) => q.tokens.includes(a)), `${tag} 정답 조각이 다 있음`);
  } else if (q.kind === "input") {
    ok(q.keypad === "digits" ? /^\d+$/.test(q.answer) : /^[A-Z]+$/.test(q.answer), `${tag} 입력 정답 형식`);
  }
  // 힌트가 정답을 그대로 말하지 않음 (숫자 정답은 단어 경계로)
  const listsAll = q.choices && q.choices.filter((c) => q.hint.includes(c)).length >= 2;
  if (q.kind !== "order" && q.answer.length > 1 && !listsAll) ok(!new RegExp(`(^|[^0-9a-z])${q.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^0-9a-z])`, "i").test(q.hint), `${tag} 힌트에 정답 유출 없음`);
}

// ---------- 수학 ----------
for (const c of M.CONCEPTS) {
  const r = mulberry(c.charCodeAt(1) * 100 + +c.slice(1));
  for (let i = 0; i < 400; i++) {
    const q = M.make(c, r);
    const tag = `수학 ${c}`;
    common(q, tag);
    ok(q.level >= 2 && q.level <= 4, `${tag} LV.1 없음`);
    if (q.expr && q.expr.includes("=") && q.kind === "input") {
      const v = evalExpr(q.expr, q.answer);
      if (v !== null) ok(v, `${tag} 식 검산 ${q.expr} / ${q.answer}`);
      else {
        const l = q.expr.split("=")[0].replace(/×/g, "*").replace(/개씩.*묶음/, "");
        if (!q.expr.includes("개씩") && /^[\d\s+\-*]+$/.test(l)) ok(Function(`return ${l}`)() === +q.answer, `${tag} 식 계산 ${q.expr} = ${q.answer}`);
      }
    }
    // 풀이 마지막 줄에 정답이 들어 있다
    const lastLine = q.explain[q.explain.length - 1];
    const ansText = Array.isArray(q.answer) ? q.answer.join(" ") : q.answer;
    if (q.kind !== "order") ok(lastLine.includes(ansText) || q.explain.join(" ").includes(ansText), `${tag} 풀이에 정답 (${ansText} / ${lastLine})`);
    if (q.mul) {
      const { a, b } = q.mul;
      const v = q.explainVisual;
      ok(v.type === "groups" && v.a === a && v.b === b, `${tag} 곱셈 그림 = 묶음 크기·개수`);
      ok(JSON.stringify(v.acc) === JSON.stringify(Array.from({ length: b }, (_, k) => a * (k + 1))), `${tag} 누적값 ${v.acc}`);
      ok(q.explain.join(" ").includes(Array(b).fill(a).join(" + ") + " = " + a * b), `${tag} 반복 덧셈 식`);
      if (q.kind === "input") ok(+q.answer === a * b, `${tag} 곱셈 정답`);
      if (q.kind === "order") ok(q.answer.join("") === `${a}×${b}`, `${tag} 곱셈 배열 정답`);
      ok(a * b <= 45 && b <= 5, `${tag} 한 화면 과밀 방지`);
    }
    if (c === "M17") ok(+q.answer === 500 * q.visual.c500 + 100 * q.visual.c100, `${tag} 돈 계산`);
    if (c === "M18") { const { h, m } = q.visual; ok(q.answer === `${h}시${m ? " 30분" : ""}`, `${tag} 시각`); }
    if (c === "M19") ok(+q.answer.replace("시", "") <= 12, `${tag} 12시 넘지 않음`);
    if (c === "M20") ok(+q.answer === q.visual.n, `${tag} 도형`);
    if (c === "M08") ok(q.answer.map(Number).every((v, k, arr) => !k || arr[k - 1] < v), `${tag} 오름차순`);
    // 유사 문제 = 같은 개념, 다른 문항
    const s = M.similar(q, r);
    ok(s.concept === q.concept && s.id !== q.id, `${tag} 유사 문제`);
  }
}
// 7×4 예시 (plan §10.2)
{
  let q;
  const r = mulberry(7);
  for (let i = 0; i < 5000 && !(q && q.mul && q.mul.a === 7 && q.mul.b === 4); i++) q = M.make("M23", r);
  ok(q.mul.a === 7 && q.mul.b === 4, "7×4 문제 생성");
  ok(q.explain[0] === "7개가 들어 있는 상자 4개", "7×4 의미 문장");
  ok(q.explain[1].includes("7 → 14 → 21 → 28"), "7×4 누적 7·14·21·28");
  ok(q.explain[2] === "7 + 7 + 7 + 7 = 28", "7×4 반복 덧셈");
  ok(q.explain[3].includes("7 × 4 = 28"), "7×4 곱셈 연결");
}

// ---------- 영어 ----------
const all = E.all(mulberry(3));
ok(all.length >= 250, `영어 문항 250개 이상 (${all.length})`);
const per = {};
for (const q of all) {
  per[q.concept] = (per[q.concept] || 0) + 1;
  const tag = `영어 ${q.id}`;
  common(q, tag);
  ok(q.level >= 1 && q.level <= 4, `${tag} 레벨`);
  if (q.listen) ok(!!q.say, `${tag} 듣기 문장`);
  if (q.choiceType === "swatch") ok(q.choices.every((c) => E.COLORS[c]), `${tag} 색 보기`);
  const s = E.similar(q, mulberry(9));
  ok(s.concept === q.concept && s.id !== q.id, `${tag} 유사 문항`);
}
ok(Object.keys(per).length === 25, "영어 25유형 모두");
for (const c of E.CONCEPTS) ok(per[c] >= 10, `영어 ${c} 문항 10개 이상 (${per[c]})`);

// ---------- 고르기·기록 ----------
{
  const r = mulberry(11);
  const used = new Set();
  const p = { math: 3, en: 2 };
  let rec = L.blank();
  const subj = [];
  for (let i = 0; i < 60; i++) {
    const q = L.pick(p, rec, used, r);
    subj.push(q.subject);
    if (q.subject === "math") ok(q.level >= 2, "아이 수학 LV.1 없음");
    rec = L.record(rec, q, "first");
  }
  ok(subj.filter((x) => x === "math").length === 30, "수학·영어 번갈아");
  ok(used.size >= 58, `한 판 같은 문항 중복 없음 (${used.size})`);
  // 약점 복습
  const rec2 = L.blank();
  L.record(rec2, M.make("M04", r), "explained");
  ok(L.weakConcepts(rec2, "math").includes("M04"), "풀이 본 개념 → 복습 표시");
  let hit = 0;
  for (let i = 0; i < 300; i++) { const q = L.pick({ math: 3, en: 2, lastSubj: "en" }, rec2, null, r); if (q.concept === "M04") hit++; }
  ok(hit > 50, `약점 개념 다시 출제 (${hit}/300)`);
  ok(L.weakList(rec2).length === 1, "학습 리포트 약점 목록");
}

// ---------- 레벨: 위 레벨 10% 이하 · 틀리면 다운 · 3연속이면 업 (2026-10-17 사용자 확정) ----------
{
  for (const [subj, sets] of [["math", [2, 3, 4]], ["en", [1, 2, 3, 4]]]) {
    for (const lv of sets) {
      const r = mulberry(lv * 7 + subj.length);
      let above = 0, n = 3000;
      for (let i = 0; i < n; i++) {
        const p = { math: subj === "math" ? lv : 3, en: subj === "en" ? lv : 2 };
        const q = L.pick(p, L.blank(), null, r, { subject: subj });
        if (q.level > lv) above++;
      }
      ok(above / n <= 0.115, `${subj} LV.${lv}: 위 레벨 10% 이하 (${(above / n * 100).toFixed(1)}%)`);
    }
  }
  const p = { math: 3, en: 2 };
  eq(L.adjust(p, "math", "hint"), { subject: "math", from: 3, to: 2 }, "힌트 보고 맞힘 → 수학 3 → 2");
  eq(L.adjust(p, "math", "fail"), null, "수학은 LV.2 밑으로 안 내려감");
  eq(p.math, 2, "수학 LV.2 유지");
  L.adjust(p, "math", "first"); L.adjust(p, "math", "first");
  eq(L.adjust(p, "math", "first"), { subject: "math", from: 2, to: 3 }, "한 번에 3연속 → 3으로 다시 올림");
  for (let i = 0; i < 6; i++) L.adjust(p, "math", "first");
  eq(p.math, 3, "설정 레벨(3)보다는 안 올라감");
  eq(L.adjust(p, "en", "explained"), { subject: "en", from: 2, to: 1 }, "영어도 틀리면 2 → 1");
  eq(L.adjust(p, "en", "fail"), null, "영어는 LV.1 밑으로 안 내려감");
  // 약점 복습도 지금 레벨을 넘지 않는다
  const rec = L.blank();
  L.record(rec, M.make("M23"), "explained");
  let over = 0;
  const r = mulberry(99);
  for (let i = 0; i < 500; i++) { const q = L.pick({ math: 2, en: 2, lastSubj: "en" }, rec, null, r); if (q.level > 3) over++; }
  eq(over, 0, "수학 LV.2 이면 LV.4 곱셈 복습은 안 나옴");
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
