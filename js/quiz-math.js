/* 수학 문제 생성기 — plan.md §9.3 수학 25유형 (LV.2~4, LV.1 은 없음)
 *
 * MathQ.make(concept, r) → 문제 하나. r = () => 0..1 난수.
 * 문제 모양 (영어와 같음):
 *   { id, subject:"math", concept, level, kind:"choice"|"input"|"order",
 *     prompt, visual?, choices?, tokens?, answer, hint, explain:[...], explainVisual? }
 *   - input  : answer 는 숫자 글자, keypad:"digits"
 *   - choice : choices 중 answer 하나만 정답 (보기는 섞어 둔다)
 *   - order  : tokens 를 순서대로 눌러 answer(배열)를 만든다
 * 풀이(explain)는 반드시 문제에 쓴 숫자로 다시 계산한 값이다 → tools/test-quiz.js 가 검산.
 */
(function (root) {
  "use strict";

  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) {
    arr = arr.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** 정답 + 겹치지 않는 오답으로 보기 4개 */
  function choicesWith(r, answer, wrongs, n) {
    n = n || 4;
    const out = [String(answer)];
    for (const w of wrongs) {
      const s = String(w);
      if (out.length >= n) break;
      if (!out.includes(s) && s !== "" && !(typeof w === "number" && w < 0)) out.push(s);
    }
    return shuffle(r, out);
  }
  const near = (x) => [x + 1, x - 1, x + 10, x - 10, x + 2, x - 2, x + 5];

  const ITEMS = [
    { emoji: "🍒", name: "나무열매" },
    { emoji: "⚪", name: "몬스터볼", img: "poke-ball" },
    { emoji: "⭐", name: "별" },
    { emoji: "🍬", name: "사탕" },
  ];
  const WHO = ["피카츄", "이브이", "꼬부기", "파이리", "푸린"];

  const LEVEL = {
    M01: 2, M02: 3, M03: 2, M04: 3, M05: 3, M06: 3, M07: 2, M08: 2, M09: 2, M10: 2,
    M11: 2, M12: 3, M13: 4, M14: 3, M15: 2, M16: 3, M17: 3, M18: 2, M19: 3, M20: 2,
    M21: 2, M22: 3, M23: 4, M24: 4, M25: 4,
  };
  const NAMES = {
    M01: "받아올림 없는 덧셈", M02: "받아올림 있는 덧셈", M03: "받아내림 없는 뺄셈", M04: "받아내림 있는 뺄셈",
    M05: "덧셈 빈칸", M06: "뺄셈 빈칸", M07: "수 비교", M08: "수 배열", M09: "자릿값", M10: "수 가르기·모으기",
    M11: "일정한 규칙", M12: "번갈아 규칙", M13: "규칙 찾기", M14: "두 단계 문장제", M15: "차이 비교",
    M16: "늘어난 수", M17: "돈 계산", M18: "시각 읽기", M19: "시간 계산", M20: "도형",
    M21: "위치·방향", M22: "길이 단위", M23: "곱셈 묶음", M24: "반복 덧셈→곱셈", M25: "곱셈 문장제",
  };

  /** 받침에 맞는 조사: jo("푸린", "이", "가") → "푸린이" */
  function jo(w, a, b) {
    const c = String(w).charCodeAt(String(w).length - 1);
    const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
    return w + (has ? a : b);
  }
  /** 숫자 + 이/가 (끝자리 읽기: 일·삼·육·칠·팔·영·십은 받침) */
  const numJo = (n) => n + ("013678".includes(String(n).slice(-1)) ? "이" : "가");
  const T = Math.floor;
  const tens = (n) => T(n / 10), ones = (n) => n % 10;

  // ---------- 덧셈·뺄셈 ----------
  function addQ(r, carry) {
    let a, b;
    for (;;) {
      a = ri(r, 11, 79); b = ri(r, 11, 89 - a > 11 ? 89 - a : 11);
      const c = ones(a) + ones(b) >= 10;
      if (a + b < 100 && c === carry && ones(a) && ones(b)) break;
    }
    const it = pick(r, ITEMS);
    const sum = a + b, os = ones(a) + ones(b);
    const explain = carry
      ? [`일의 자리끼리: ${ones(a)} + ${ones(b)} = ${os}`,
         `${os}는 10이 넘어요 → 10을 십 묶음 1개로 바꿔 올려요 (일의 자리에는 ${os - 10})`,
         `십의 자리끼리: ${tens(a)} + ${tens(b)} + 올린 1 = ${tens(a) + tens(b) + 1}`,
         `그래서 ${a} + ${b} = ${sum}`]
      : [`일의 자리끼리: ${ones(a)} + ${ones(b)} = ${os}`,
         `십의 자리끼리: ${tens(a)} + ${tens(b)} = ${tens(a) + tens(b)}`,
         `그래서 ${a} + ${b} = ${sum}`];
    return {
      concept: carry ? "M02" : "M01", kind: "input", keypad: "digits",
      prompt: `${it.name} ${a}개에 ${b}개를 더 모았어요. 모두 몇 개일까요?`,
      expr: `${a} + ${b} = ?`, answer: String(sum),
      hint: carry ? `일의 자리 ${ones(a)} + ${ones(b)} 가 10보다 커요. 10은 십 묶음 하나로!` : `일의 자리끼리, 십의 자리끼리 따로 더해 봐요.`,
      explain, explainVisual: { type: "blocks", a, b, op: "+" },
    };
  }
  function subQ(r, borrow) {
    let a, b;
    for (;;) {
      a = ri(r, 31, 98); b = ri(r, 11, a - 10);
      const need = ones(a) < ones(b);
      if (need === borrow && a - b >= 5 && ones(b)) break;
    }
    const it = pick(r, ITEMS);
    const d = a - b;
    const explain = borrow
      ? [`일의 자리 ${ones(a)}에서 ${ones(b)}를 뺄 수 없어요`,
         `십 묶음 1개를 낱개 10개로 바꿔요 → ${a} = ${tens(a) - 1}십 + ${ones(a) + 10}`,
         `일의 자리: ${ones(a) + 10} - ${ones(b)} = ${ones(a) + 10 - ones(b)}`,
         `십의 자리: ${tens(a) - 1} - ${tens(b)} = ${tens(a) - 1 - tens(b)}`,
         `그래서 ${a} - ${b} = ${d}`]
      : [`일의 자리끼리: ${ones(a)} - ${ones(b)} = ${ones(a) - ones(b)}`,
         `십의 자리끼리: ${tens(a)} - ${tens(b)} = ${tens(a) - tens(b)}`,
         `그래서 ${a} - ${b} = ${d}`];
    return {
      concept: borrow ? "M04" : "M03", kind: "input", keypad: "digits",
      prompt: `${it.name} ${a}개 중에서 ${b}개를 썼어요. 몇 개 남았을까요?`,
      expr: `${a} - ${b} = ?`, answer: String(d),
      hint: borrow ? `${ones(a)}에서 ${ones(b)}를 못 빼요. 십 묶음 하나를 낱개 10개로 바꿔 봐요.` : `일의 자리끼리, 십의 자리끼리 따로 빼 봐요.`,
      explain, explainVisual: { type: "blocks", a, b, op: "-" },
    };
  }

  const GEN = {
    M01: (r) => addQ(r, false),
    M02: (r) => addQ(r, true),
    M03: (r) => subQ(r, false),
    M04: (r) => subQ(r, true),
    M05: (r) => {
      let a, b;
      do { a = ri(r, 11, 49); b = ri(r, 5, 39); } while (a === b);
      const c = a + b;
      return { kind: "input", keypad: "digits", prompt: "빈칸에 알맞은 수는?", expr: `${a} + □ = ${c}`, answer: String(b),
        hint: `${c}에서 ${a}를 빼면 □가 나와요.`,
        explain: [`□는 ${a}에 더해서 ${c}가 되는 수`, `${c} - ${a} = ${b}`, `확인: ${a} + ${b} = ${c}`] };
    },
    M06: (r) => {
      let a, b;
      do { a = ri(r, 30, 95); b = ri(r, 5, a - 10); } while (b === a - b);
      const c = a - b;
      return { kind: "input", keypad: "digits", prompt: "빈칸에 알맞은 수는?", expr: `${a} - □ = ${c}`, answer: String(b),
        hint: `${a}에서 얼마를 빼야 ${c}가 될까요? ${a} - ${c} 를 해 봐요.`,
        explain: [`□는 ${a}에서 빼서 ${c}가 남는 수`, `${a} - ${c} = ${b}`, `확인: ${a} - ${b} = ${c}`] };
    },
    M07: (r) => {
      let x, y;
      do { x = ri(r, 1, 9); y = ri(r, 1, 9); } while (x === y);
      const a = x * 10 + y, b = y * 10 + x, big = Math.max(a, b);
      return { kind: "choice", prompt: "더 큰 수를 골라요!", answer: String(big), choices: shuffle(r, [String(a), String(b)]),
        hint: "십의 자리 숫자를 먼저 비교해 봐요.",
        explain: [`${a}의 십의 자리는 ${tens(a)}, ${b}의 십의 자리는 ${tens(b)}`, `십의 자리가 큰 ${big}가 더 커요`] };
    },
    M08: (r) => {
      const set = new Set();
      while (set.size < 3) set.add(ri(r, 12, 98));
      const nums = [...set];
      const sorted = nums.slice().sort((a, b) => a - b);
      return { kind: "order", prompt: "작은 수부터 차례로 눌러요!", tokens: shuffle(r, nums.map(String)), answer: sorted.map(String),
        hint: "십의 자리가 가장 작은 수부터 찾아봐요.",
        explain: [`십의 자리를 비교: ${nums.map((n) => `${n}→${tens(n)}`).join(", ")}`, `작은 수부터: ${sorted.join(" < ")}`] };
    },
    M09: (r) => {
      const n = ri(r, 21, 98), which = r() < 0.5 ? "십" : "일";
      const ans = which === "십" ? tens(n) : ones(n);
      return { kind: "choice", prompt: `${n}에서 ${which}의 자리 숫자는?`, answer: String(ans),
        choices: choicesWith(r, ans, [which === "십" ? ones(n) : tens(n), ans * 10, ans + 1, n]),
        hint: "오른쪽 끝이 일의 자리, 그 왼쪽이 십의 자리예요.",
        explain: [`${n} = ${tens(n)}0 + ${ones(n)}`, `십의 자리 ${tens(n)}, 일의 자리 ${ones(n)}`, `${which}의 자리 숫자는 ${ans}`] };
    },
    M10: (r) => {
      const t = ri(r, 2, 9), o = ri(r, 1, 9), n = t * 10 + o;
      if (r() < 0.5) {
        return { kind: "input", keypad: "digits", prompt: `${t * 10}과 ${o}을 모으면?`, expr: `${t * 10} + ${o} = ?`, answer: String(n),
          hint: "십 묶음 개수와 낱개를 붙여 써 봐요.", explain: [`십 묶음 ${t}개 = ${t * 10}`, `낱개 ${o}개`, `모으면 ${n}`] };
      }
      return { kind: "input", keypad: "digits", prompt: "빈칸에 알맞은 수는?", expr: `${n} = ${t * 10} + □`, answer: String(o),
        hint: `${n}의 일의 자리를 보세요.`, explain: [`${n}은 십 묶음 ${t}개와 낱개 ${o}개`, `${n} = ${t * 10} + ${o}`] };
    },
    M11: (r) => {
      const st = ri(r, 2, 5), a = ri(r, 1, 20), seq = [0, 1, 2, 3].map((k) => a + st * k), ans = a + st * 4;
      return { kind: "choice", prompt: "규칙을 찾아 ? 에 들어갈 수를 골라요.", expr: `${seq.join(", ")}, ?`, answer: String(ans),
        choices: choicesWith(r, ans, [ans + 1, ans - 1, ans + st, ans - st, ans + 2]),
        hint: "옆 수와 얼마씩 차이 나는지 봐요.",
        explain: [`${seq[0]} → ${seq[1]} : +${st}`, `매번 ${st}씩 커져요`, `${seq[3]} + ${st} = ${ans}`] };
    },
    M12: (r) => {
      const a = ri(r, 1, 5), b = a + ri(r, 2, 4), st = ri(r, 1, 2);
      const seq = [a, b, a + st, b + st, a + 2 * st, b + 2 * st];
      const ans = a + 3 * st;
      return { kind: "choice", prompt: "규칙을 찾아 ? 에 들어갈 수를 골라요.", expr: `${seq.join(", ")}, ?`, answer: String(ans),
        choices: choicesWith(r, ans, [b + 3 * st, ans + 1, seq[5] + 1, ans - 1]),
        hint: "한 칸씩 건너뛰어 보세요. 두 줄이 번갈아 나와요.",
        explain: [`홀수 번째: ${a}, ${a + st}, ${a + 2 * st} → ${st}씩 커져요`, `짝수 번째: ${b}, ${b + st}, ${b + 2 * st}`, `? 는 홀수 번째 → ${a + 2 * st} + ${st} = ${ans}`] };
    },
    M13: (r) => {
      const a = ri(r, 2, 5), seq = [a, a * 2, a * 4, a * 8], ans = a * 16;
      return { kind: "choice", prompt: "규칙을 찾아 ? 에 들어갈 수를 골라요.", expr: `${seq.join(", ")}, ?`, answer: String(ans),
        choices: choicesWith(r, ans, [a * 8 + a * 4, a * 8 + 4, ans + 2, a * 12]),
        hint: "더하는 수가 같지 않아요. 몇 배가 되는지 봐요.",
        explain: [`${seq[0]} → ${seq[1]} → ${seq[2]} : 매번 2배`, `${seq[3]}의 2배 = ${seq[3]} + ${seq[3]} = ${ans}`] };
    },
    M14: (r) => {
      const a = ri(r, 10, 20), b = ri(r, 2, a - 3), c = ri(r, 3, 9), w = pick(r, WHO), it = pick(r, ITEMS);
      const m = a - b, ans = m + c;
      return { kind: "input", keypad: "digits",
        prompt: `${jo(w, "이", "가")} ${it.name} ${a}개를 가지고 있었어요. ${b}개를 먹고, 다시 ${c}개를 주웠어요. 지금 몇 개일까요?`,
        expr: `${a} - ${b} + ${c} = ?`, answer: String(ans),
        hint: "이야기 순서대로 하나씩 계산해요. 먼저 먹은 것부터!",
        explain: [`처음 ${a}개`, `${b}개 먹음 → ${a} - ${b} = ${m}`, `${c}개 주움 → ${m} + ${c} = ${ans}`],
        explainVisual: { type: "story", steps: [a, -b, c] } };
    },
    M15: (r) => {
      const a = ri(r, 10, 30), b = ri(r, 3, a - 2), d = a - b, x = pick(r, WHO), y = pick(r, WHO.filter((q) => q !== x));
      return { kind: "input", keypad: "digits", prompt: `${jo(x, "은", "는")} 별 ${a}개, ${jo(y, "은", "는")} 별 ${b}개를 모았어요. 누가 몇 개 더 많을까요? (차이를 써요)`,
        expr: `${a} - ${b} = ?`, answer: String(d), hint: "큰 수에서 작은 수를 빼면 차이예요.",
        explain: [`${a}와 ${b}의 차이`, `${a} - ${b} = ${d}`, `${jo(x, "이", "가")} ${d}개 더 많아요`] };
    },
    M16: (r) => {
      const a = ri(r, 10, 40), d = ri(r, 5, 25), b = a + d;
      return { kind: "input", keypad: "digits", prompt: `몬스터볼이 ${a}개였는데 지금은 ${b}개예요. 몇 개 늘었을까요?`,
        expr: `${a} + □ = ${b}`, answer: String(d), hint: `나중 수에서 처음 수를 빼 봐요.`,
        explain: [`늘어난 수 = 나중 - 처음`, `${b} - ${a} = ${d}`, `확인: ${a} + ${d} = ${b}`] };
    },
    M17: (r) => {
      const f = ri(r, 1, 3), h = ri(r, 1, 5), tot = 500 * f + 100 * h;
      return { kind: "input", keypad: "digits", prompt: `500원짜리 ${f}개, 100원짜리 ${h}개. 모두 얼마일까요?`,
        visual: { type: "coins", c500: f, c100: h }, answer: String(tot), unit: "원",
        hint: "500원끼리 먼저 더하고, 100원을 더해요.",
        explain: [`500원 × ${f} = ${500 * f}원`, `100원 × ${h} = ${100 * h}원`, `${500 * f} + ${100 * h} = ${tot}원`] };
    },
    M18: (r) => {
      const h = ri(r, 1, 12), m = pick(r, [0, 30]);
      const say = (hh, mm) => `${hh}시${mm ? " 30분" : ""}`;
      const ans = say(h, m);
      const h2 = (h % 12) + 1, h0 = h === 1 ? 12 : h - 1;
      return { kind: "choice", prompt: "시계가 가리키는 시각은?", visual: { type: "clock", h, m }, answer: ans,
        choices: choicesWith(r, ans, [say(h, m ? 0 : 30), say(h2, m), m ? say(h0 === h ? h2 : h, 0) : say(h0, 30), say(h0, m)]),
        hint: "짧은 바늘은 '시', 긴 바늘은 '분'이에요.",
        explain: [`짧은 바늘이 ${h}${m ? "와 " + h2 + " 사이" : ""}를 가리켜요 → ${h}시`, m ? "긴 바늘이 6 → 30분" : "긴 바늘이 12 → 정각", `${ans}`] };
    },
    M19: (r) => {
      const h = ri(r, 1, 8), d = ri(r, 1, 4), e = h + d;
      const ans = `${e}시`;
      return { kind: "choice", prompt: `지금은 ${h}시예요. ${d}시간 뒤에는 몇 시일까요?`, visual: { type: "clock", h, m: 0 }, answer: ans,
        choices: choicesWith(r, ans, [`${e + 1}시`, `${e - 1}시`, `${e}시 30분`, `${h}시 ${d}0분`]),
        hint: "짧은 바늘을 한 시간에 한 칸씩 옮겨 봐요.",
        explain: [`${h}시에서 1시간씩 ${d}번`, `${Array.from({ length: d + 1 }, (_, k) => h + k + "시").join(" → ")}`, ans] };
    },
    M20: (r) => {
      const shapes = [["삼각형", 3], ["사각형", 4], ["오각형", 5], ["육각형", 6]];
      const [nm, k] = pick(r, shapes), what = pick(r, ["꼭짓점", "변"]);
      return { kind: "choice", prompt: `이 ${nm}의 ${what}은 몇 개일까요?`, visual: { type: "shape", n: k }, answer: String(k),
        choices: choicesWith(r, k, [k + 1, k - 1, k + 2, k * 2]),
        hint: what === "꼭짓점" ? "뾰족한 곳을 하나씩 세어 봐요." : "곧은 선을 하나씩 세어 봐요.",
        explain: [`${nm}은 ${what}이 ${k}개`, `하나씩 짚으며 세면 1부터 ${k}까지`] };
    },
    M21: (r) => {
      const row = shuffle(r, ["🍎", "🍌", "🍇", "🍊", "🍓"]);
      const side = pick(r, ["왼쪽", "오른쪽"]), k = ri(r, 2, 4);
      const ans = side === "왼쪽" ? row[k - 1] : row[row.length - k];
      return { kind: "choice", prompt: `${side}에서 ${k}번째에 있는 것은?`, visual: { type: "row", items: row }, answer: ans,
        choices: shuffle(r, [ans].concat(shuffle(r, row.filter((x) => x !== ans)).slice(0, 3))),
        choiceType: "emoji",
        hint: `${side} 끝에서부터 손가락으로 1, 2, 3… 세어 봐요.`,
        explain: [`${side}부터 세면: ${(side === "왼쪽" ? row : row.slice().reverse()).map((x, i) => `${i + 1}번째 ${x}`).join(", ")}`, `${k}번째는 ${ans}`] };
    },
    M22: (r) => {
      if (r() < 0.5) {
        const cm = pick(r, [80, 90, 95, 99, 110, 120, 105]);
        const ans = cm > 100 ? `${cm}cm` : "1m";
        return { kind: "choice", prompt: `1m 와 ${cm}cm 중 더 긴 것은?`, answer: ans, choices: shuffle(r, ["1m", `${cm}cm`]),
          hint: "1미터는 100센티미터와 같아요.",
          explain: ["1m = 100cm", `100cm 와 ${cm}cm 비교`, `더 긴 것은 ${ans}`] };
      }
      const m = ri(r, 1, 3), c = ri(r, 1, 9) * 10;
      return { kind: "input", keypad: "digits", prompt: `${m}m ${c}cm 는 몇 cm 일까요?`, answer: String(m * 100 + c), unit: "cm",
        hint: "1m 는 100cm 예요.", explain: [`${m}m = ${m * 100}cm`, `${m * 100} + ${c} = ${m * 100 + c}cm`] };
    },
    M23: (r) => {
      const a = ri(r, 2, 9), b = ri(r, 2, 5), it = pick(r, ITEMS);
      return mulExplain({ kind: "input", keypad: "digits",
        prompt: `${jo(it.name, "이", "가")} ${a}개씩 든 상자가 ${b}개 있어요. 모두 몇 개일까요?`,
        visual: { type: "groups", a, b, item: it, hideCount: false }, expr: `${a}개씩 ${b}묶음 = ?`, answer: String(a * b),
        hint: `${a}개씩 묶음이 ${b}개! ${a}를 ${b}번 더해 봐요.` }, a, b, it);
    },
    M24: (r) => {
      const a = ri(r, 2, 9), b = ri(r, 2, 5);
      let wrong = ri(r, 2, 9);
      while (wrong === a || wrong === b) wrong = ri(r, 2, 9);
      return mulExplain({ kind: "order", prompt: "덧셈을 곱셈으로 바꿔요. 순서대로 눌러요!",
        expr: `${Array(b).fill(a).join(" + ")} = □ × □`, tokens: shuffle(r, [String(a), String(b), "×", String(wrong)]),
        answer: [String(a), "×", String(b)],
        hint: `같은 수 ${a}가 몇 번 더해졌는지 세어 봐요.` }, a, b, ITEMS[2], true);
    },
    M25: (r) => {
      const a = ri(r, 2, 8), b = ri(r, 2, 5), w = pick(r, WHO), it = pick(r, ITEMS);
      return mulExplain({ kind: "input", keypad: "digits",
        prompt: `${jo(w, "이", "가")} ${jo(it.name, "을", "를")} 한 상자에 ${a}개씩, ${b}상자에 담았어요. 모두 몇 개일까요?`,
        answer: String(a * b), hint: `한 상자에 ${a}개, 상자는 ${b}개예요.` }, a, b, it);
    },
  };

  /** 곱셈 오답 템플릿 (plan §10.2): 의미 → 묶음 하나씩 → 누적 → 반복 덧셈 → 곱셈 */
  function mulExplain(q, a, b, it, orderForm) {
    const acc = Array.from({ length: b }, (_, k) => a * (k + 1));
    q.explain = [
      `${a}개가 들어 있는 상자 ${b}개`,
      `상자를 하나씩 세면: ${acc.join(" → ")}`,
      `${Array(b).fill(a).join(" + ")} = ${a * b}`,
      `${numJo(a)} ${b}번 더해졌으니 ${a} × ${b} = ${a * b}`,
    ];
    q.explainVisual = { type: "groups", a, b, item: it, acc };
    q.mul = { a, b };
    if (orderForm) q.explain[3] = `${numJo(a)} ${b}번 → ${a} × ${b}`;
    return q;
  }

  let seq = 0;
  function make(concept, r) {
    r = r || Math.random;
    const q = GEN[concept](r);
    q.concept = q.concept || concept;
    q.subject = "math";
    q.level = LEVEL[q.concept];
    q.name = NAMES[q.concept];
    q.id = `${q.concept}:${q.expr || q.prompt}|${JSON.stringify(q.visual || "")}|${q.answer}`;
    q.uid = ++seq;
    return q;
  }
  /** 같은 개념, 다른 숫자 (plan §10.1-5) */
  function similar(q, r) {
    for (let i = 0; i < 30; i++) {
      const n = make(q.concept, r);
      if (n.id !== q.id && JSON.stringify(n.answer) !== JSON.stringify(q.answer)) return n;
    }
    return make(q.concept, r);
  }
  const CONCEPTS = Object.keys(GEN);
  const byLevel = (lv) => CONCEPTS.filter((c) => LEVEL[c] === lv);

  const API = { make, similar, CONCEPTS, LEVEL, NAMES, byLevel, ITEMS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.MathQ = API;
})(typeof window !== "undefined" ? window : globalThis);
