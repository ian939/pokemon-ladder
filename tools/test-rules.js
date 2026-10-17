// 규칙 엔진 시험 — plan.md §15.2 최소 수용 기준 · §15.3 체크리스트
//   node tools/test-rules.js
const R = require("../js/rules.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log("❌ " + name); }
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)})`);

/** 스크립트 io: choices = { kind: 값 | 함수 }, quiz = 결과 배열 */
function makeIO(opt) {
  opt = opt || {};
  const log = [];
  const quiz = (opt.quiz || []).slice();
  return {
    log,
    async show(e) { log.push(e); },
    async choose(kind, data) {
      log.push({ type: "choose:" + kind, data });
      const c = opt.choices && opt.choices[kind];
      if (typeof c === "function") return c(data);
      if (c !== undefined) return c;
      if (kind === "action") return "roll";
      if (kind === "target") return data.options[0];
      if (kind === "direction") return 1;
      if (kind === "reward") return "move";
      if (kind === "pick") return 0;
      if (kind === "discard") return data.add;
      if (kind === "defend") return data.options[0];
      if (kind === "reroll") return false;
      if (kind === "cell") return data.to;
      if (kind === "lucky") return 6;
      return null;
    },
    async quiz(pi, ctx) { log.push({ type: "quiz", pi, ctx }); return quiz.length ? quiz.shift() : "first"; },
  };
}
const has = (io, type) => io.log.some((e) => e.type === type);
function game(mode, n) {
  const players = [];
  for (let i = 0; i < (n || 2); i++) players.push({ name: "P" + i, trainer: R.TRAINERS[i].id });
  const s = R.createGame({ mode, seed: 1234, players });
  s.rocket.pos = mode === 100 ? 99 : 199; // 방해 안 되게 멀리
  return s;
}

(async () => {
  // --- 맵 ---
  eq(R.validateMap(R.MAPS[100]), [], "100칸 맵 검사");
  eq(R.validateMap(R.MAPS[200]), [], "200칸 맵 검사");
  eq(R.cellXY(1), { row: 0, col: 0 }, "1번 칸 위치");
  eq(R.cellXY(11), { row: 1, col: 9 }, "11번 칸 지그재그");
  eq(R.RULES.spin, 12, "사람 돌림판 1~12 (사용자 요청)");
  eq(R.RULES.rocketSpin, 8, "로켓단 돌림판 1~8 (사용자 요청)");

  // --- 주사위 개수 ---
  for (const mode of [100, 200]) {
    const s = game(mode); s.players[0].pos = 50; s.rocket.pos = mode - 1;
    const io = makeIO(); await R.playerTurn(s, io);
    const d = io.log.find((e) => e.type === "dice");
    eq(d.dice.length, 1, mode + "칸 돌림판 한 번");
    ok(d.dice[0] >= 1 && d.dice[0] <= 12, "돌림판 1~12");
    const s2 = game(mode); s2.players.forEach((p) => (p.pos = 2)); s2.rocket.pos = 60;
    const io2 = makeIO(); await R.rocketTurn(s2, io2);
    eq(io2.log.find((e) => e.type === "rocket-dice").dice.length, 1, mode + "칸 로켓단 돌림판 한 번");
  }
  {
    const seen = new Set(), seenR = new Set();
    for (let i = 0; i < 3000; i++) {
      const s = game(100); s.rng = i * 31 + 7; s.players[0].pos = 30;
      const io = makeIO(); await R.playerTurn(s, io); seen.add(io.log.find((e) => e.type === "dice").dice[0]);
      const s2 = game(100); s2.rng = i * 17 + 3; s2.players.forEach((p) => (p.pos = 2)); s2.rocket.pos = 60;
      const io2 = makeIO(); await R.rocketTurn(s2, io2); seenR.add(io2.log.find((e) => e.type === "rocket-dice").dice[0]);
    }
    eq([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "사람 돌림판: 1~12 모두 나옴");
    eq([...seenR].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8], "로켓단 돌림판: 1~8 모두 나옴");
  }

  // --- 잠만보: 100칸 주사위 2 → -4 ---
  {
    const s = game(100); s.players[0].pos = 50; s.players[0].st.minus6 = true; s.force = [2];
    const io = makeIO(); await R.playerTurn(s, io);
    eq(s.players[0].pos, 46 === 46 ? R.MAPS[100].slides[46] : 46, "잠만보 100칸 합 2 → -4 (46은 미끄럼틀 → 29)");
    ok(io.log.some((e) => e.type === "move" && e.from === 50 && e.to === 46), "잠만보 -4 실제 뒤로 이동");
    ok(!s.players[0].st.minus6, "잠만보 상태 한 번만");
  }
  {
    const s = game(100); s.players[0].pos = 50; s.players[0].st.minus6 = true; s.force = [4];
    await R.playerTurn(s, makeIO()); eq(s.players[0].pos, 48, "잠만보 4 → -2");
    const s2 = game(100); s2.players[0].pos = 50; s2.players[0].st.minus6 = true; s2.force = [6];
    const io2 = makeIO(); await R.playerTurn(s2, io2); eq(s2.players[0].pos, 50, "잠만보 6 → 0");
    ok(has(io2, "stay"), "0칸이면 제자리");
    ok(!io2.log.some((e) => e.type === "cell"), "0칸이면 칸 이벤트 없음");
  }
  // 잠만보: 200칸 합 9 → +3, 합 12 → +6
  {
    const s = game(200); s.players[0].pos = 100; s.players[0].st.minus6 = true; s.force = [9];
    await R.playerTurn(s, makeIO()); eq(s.players[0].pos, 103 === 103 ? 103 : 0, "잠만보 200칸 합 9 → +3");
    const s2 = game(200); s2.players[0].pos = 100; s2.players[0].st.minus6 = true; s2.force = [12];
    await R.playerTurn(s2, makeIO()); eq(s2.players[0].pos, 106, "잠만보 200칸 합 12 → +6");
  }
  // 경계: 1 아래로 안 감
  {
    const s = game(100); s.players[0].pos = 2; s.players[0].st.minus6 = true; s.force = [1];
    await R.playerTurn(s, makeIO()); eq(s.players[0].pos, 1, "1번 칸 아래로 안 내려감");
  }

  // --- 푸린: 성공/실패 모두 카드 소모, 확률 50% ---
  {
    let okN = 0;
    for (let i = 0; i < 2000; i++) {
      const s = game(100); s.rng = i * 7919 + 1; s.players[0].pos = 30; s.players[0].ability = ["P09"];
      const io = makeIO({ choices: { action: "P09" } });
      s.force = [1];
      await R.playerTurn(s, io);
      ok(!s.players[0].ability.includes("P09"), "푸린 카드 소모");
      const l = io.log.find((e) => e.type === "lullaby");
      if (l.ok) { okN++; ok(s.players[1].st.skip, "푸린 성공 → 상대 쉬기"); }
      else ok(!s.players[1].st.skip, "푸린 실패 → 효과 없음");
    }
    ok(okN > 900 && okN < 1100, `푸린 성공률 약 50% (${okN}/2000)`);
    // 쉬기 턴 소비
    const s = game(100); s.players[0].st.skip = true; s.players[0].pos = 30;
    const io = makeIO(); await R.playerTurn(s, io);
    ok(has(io, "skip") && !has(io, "dice") && !s.players[0].st.skip, "쉬기 턴 1회 소비");
  }
  // 푸린·잠만보 중첩 금지
  {
    const s = game(100); s.players[1].st.minus6 = true; s.players[0].ability = ["P09", "P06"];
    const u = R.usableCards(s, 0);
    ok(u.every((x) => !x.ok), "이미 잠만보 걸린 상대에게 푸린·잠만보 금지");
  }

  // --- 이상해씨: 상대 -3, 나 +3 ---
  {
    const s = game(100); s.players[0].pos = 50; s.players[1].pos = 70; s.players[0].ability = ["P04"]; s.force = [0];
    const io = makeIO({ choices: { action: "P04" } });
    await R.useCard(s, io, 0, "P04");
    eq([s.players[0].pos, s.players[1].pos], [53, 67], "이상해씨 나 +3 · 상대 -3");
  }

  // --- 로켓단 사다리·미끄럼틀 (100칸 59→78, 79→58) ---
  {
    const s = game(100); s.rocket.pos = 55; s.players[0].pos = 90; s.players[1].pos = 95; s.force = [4];
    const io = makeIO(); await R.rocketTurn(s, io);
    eq(s.rocket.pos, 78, "로켓단 59번 사다리 → 78");
    const s2 = game(100); s2.rocket.pos = 75; s2.players[0].pos = 90; s2.players[1].pos = 95; s2.force = [4];
    await R.rocketTurn(s2, makeIO()); eq(s2.rocket.pos, 58, "로켓단 79번 미끄럼틀 → 58");
  }
  // --- 지나치기만 하면 포획 없음 ---
  {
    const s = game(100); s.rocket.pos = 20; s.players[0].pos = 22; s.players[1].pos = 80; s.force = [5];
    const io = makeIO(); await R.rocketTurn(s, io);
    eq(s.rocket.pos, 25, "로켓단 22 지나 25");
    ok(!has(io, "capture"), "지나치기만 하면 포획 없음");
  }
  // --- 같은 칸 멈추면 포획 + 탈출 퀴즈 + 튕겨내기 ---
  {
    const s = game(100); s.rocket.pos = 20; s.players[0].pos = 23; s.players[1].pos = 80; s.force = [3];
    const io = makeIO({ quiz: ["first"] }); await R.rocketTurn(s, io);
    ok(has(io, "capture"), "같은 칸 → 포획");
    ok(io.log.some((e) => e.type === "quiz" && e.ctx.reason === "escape"), "탈출 퀴즈");
    eq(s.players[0].pos, 23, "탈출 성공 → 제자리");
    eq(s.rocket.pos, 15, "포획 뒤 로켓단 8칸 튕겨내기");
  }
  {
    const s = game(100); s.rocket.pos = 20; s.players[0].pos = 23; s.players[1].pos = 80; s.force = [3];
    const io = makeIO({ quiz: ["fail"] }); await R.rocketTurn(s, io);
    eq(s.players[0].pos, 18, "탈출 실패 → 5칸 후퇴 (18, 장치·이벤트 없음)");
  }
  // 보호막 사용
  {
    const s = game(100); s.rocket.pos = 20; s.players[0].pos = 23; s.players[0].ability = ["P03"]; s.players[1].pos = 80; s.force = [3];
    const io = makeIO(); await R.rocketTurn(s, io);
    ok(has(io, "defend") && !s.players[0].ability.length && !io.log.some((e) => e.type === "quiz"), "꼬부기 보호막 → 퀴즈 없이 방어");
  }
  // 여러 명 같은 칸 → 각자 판정, 튕겨내기 한 번
  {
    const s = game(100, 3); s.rocket.pos = 20; s.players[0].pos = 23; s.players[1].pos = 23; s.players[2].pos = 80; s.force = [3];
    const io = makeIO(); await R.rocketTurn(s, io);
    eq(io.log.filter((e) => e.type === "capture").length, 2, "두 명 각자 포획 판정");
    eq(io.log.filter((e) => e.type === "rocket-warp" && e.why === "kick").length, 1, "튕겨내기 한 번");
  }
  // 순간 등장(급습)은 즉시 포획 금지
  {
    const s = game(100); s.players[0].pos = 30; s.players[1].pos = 40;
    const io = makeIO({ choices: { target: 1, direction: 1 } });
    await R.resolveCard(s, io, 0, "R02", 0);
    eq(s.rocket.pos, 43, "급습 → 상대 3칸 앞");
    ok(!has(io, "capture"), "급습 등장은 포획 없음");
  }

  // --- 카드 이동으로 사다리 시작 칸 → 사다리 ---
  {
    const s = game(100); s.players[0].pos = 7; // 7+6 = 13 → 31
    const io = makeIO(); await R.useCard(s, io, 0, "P01"); // 보유하지 않아 무시되는지 먼저
    eq(s.players[0].pos, 7, "없는 카드는 못 씀");
    s.players[0].ability = ["P01"]; await R.useCard(s, io, 0, "P01");
    eq(s.players[0].pos, 31, "피카츄 +6 → 13 사다리 → 31");
  }
  // 사다리 도착 칸은 연쇄·이벤트 없음 (4→16, 한 번만)
  {
    const s = game(100); s.players[0].pos = 1; s.force = [3];
    const io = makeIO(); await R.playerTurn(s, io);
    eq(s.players[0].pos, 16, "주사위 3 → 4 사다리 → 16");
    eq(io.log.filter((e) => e.type === "chute").length, 1, "사다리 1회");
    ok(!io.log.some((e) => e.type === "cell"), "사다리 도착 칸 이벤트 없음");
  }
  // 팬텀: 15칸 이내 고른 칸
  {
    const s = game(100); s.players[0].pos = 30; s.players[0].ability = ["P05"];
    const io = makeIO({ choices: { cell: 99 } }); await R.useCard(s, io, 0, "P05");
    eq(s.players[0].pos, 45, "팬텀은 15칸까지만");
  }
  // 나옹: 카드 없는 상대 선택 불가
  {
    const s = game(100); s.players[0].ability = ["P10"];
    ok(!R.usableCards(s, 0)[0].ok, "나옹: 카드 없는 상대만 → 사용 불가");
    s.players[1].held = "E01";
    const io = makeIO(); await R.useCard(s, io, 0, "P10");
    ok(s.players[0].held === "E01" && !s.players[1].held, "나옹으로 카드 가져옴");
  }
  // 파이리: 100칸 2개
  {
    const s = game(100); s.players[0].pos = 50; s.players[0].ability = ["P02"]; s.rocket.pos = 99;
    const io = makeIO({ choices: { action: "P02" } }); await R.playerTurn(s, io);
    eq(io.log.find((e) => e.type === "dice").dice.length, 2, "파이리 → 돌림판 두 번");
    const s2 = game(200); s2.players[0].pos = 50; s2.players[0].ability = ["P02"];
    const io2 = makeIO({ choices: { action: "P02" } }); await R.playerTurn(s2, io2);
    eq(io2.log.find((e) => e.type === "dice").dice.length, 2, "파이리 → 200칸도 두 번");
  }
  // 로켓단 폭주: 한 개씩 두 번
  {
    const s = game(100); s.rocket.double = true; s.rocket.pos = 2; s.players[0].pos = 60; s.players[1].pos = 70; s.force = [1, 2];
    const io = makeIO(); await R.rocketTurn(s, io);
    eq(io.log.find((e) => e.type === "rocket-dice").dice, [1, 2], "폭주 → 주사위 1개를 두 번");
  }
  // 로켓단 방향 전환 · 휴식
  {
    const s = game(100); s.rocket.reverse = true; s.rocket.pos = 30; s.players[0].pos = 60; s.players[1].pos = 70; s.force = [2];
    await R.rocketTurn(s, makeIO()); eq(s.rocket.pos, 28, "방향 전환 → 반대로");
    const s2 = game(100); s2.rocket.skip = true; s2.rocket.pos = 30;
    const io = makeIO(); await R.rocketTurn(s2, io); ok(has(io, "rocket-rest") && s2.rocket.pos === 30, "로켓단 휴식");
  }
  // 로켓단 추적: 가장 가까운 사람, 동률이면 큰 칸
  {
    const s = game(100); s.rocket.pos = 50; s.players[0].pos = 45; s.players[1].pos = 55;
    eq(R.rocketTarget(s), 1, "동률이면 칸 번호 큰 사람");
    s.players[0].pos = 48; eq(R.rocketTarget(s), 0, "가장 가까운 사람");
  }
  // 로켓단은 앞으로만 · 먼저 도착하면 모두 진다 (2026-10-17 사용자 요청)
  {
    const s = game(100); s.rocket.pos = 50; s.players[0].pos = 30; s.players[1].pos = 40; s.force = [3];
    await R.rocketTurn(s, makeIO()); eq(s.rocket.pos, 53, "사람이 뒤에 있어도 로켓단은 앞으로");
    const s2 = game(100); s2.rocket.pos = 97; s2.players[0].pos = 30; s2.players[1].pos = 40; s2.force = [6];
    const io2 = makeIO(); await R.rocketTurn(s2, io2);
    eq([s2.rocket.pos, s2.winner], [97, null], "로켓단도 넘치면 그 자리");
    ok(has(io2, "rocket-over"), "로켓단 넘침 안내");
    const s3 = game(100); s3.rocket.pos = 96; s3.players[0].pos = 30; s3.players[1].pos = 40; s3.force = [4];
    const io3 = makeIO(); await R.step(Object.assign(s3, { phase: "rocket" }), io3);
    eq([s3.winner, s3.rocketWon], [-1, true], "로켓단이 딱 100 → 모두 짐 (승자 없음)");
    ok(has(io3, "rocket-win"), "로켓단 도착 연출");
    let before = 0, fwd = 0;
    for (let i = 0; i < 500; i++) {
      const t = game(100); t.rng = i + 9; t.rocket.pos = 40; t.players[0].pos = 10; t.players[1].pos = 20;
      before = t.rocket.pos; await R.rocketTurn(t, makeIO({ quiz: ["first"] }));
      if (t.rocket.pos > before || t.rocket.pos < before - 8) fwd++;
    }
    eq(fwd, 500, "로켓단 돌림판 이동은 늘 앞으로 (미끄럼틀·튕겨내기 빼고)");
  }
  // 결승은 딱 맞아야 (2026-10-17 사용자 요청)
  {
    const s = game(100); s.players[0].pos = 98; s.force = [6];
    const io = makeIO(); await R.step(s, io);
    eq([s.winner, s.players[0].pos], [null, 98], "98에서 6 → 넘치니 그 자리");
    ok(has(io, "over"), "넘침 안내");
    const s2 = game(100); s2.players[0].pos = 98; s2.force = [2];
    await R.step(s2, makeIO()); eq([s2.winner, s2.players[0].pos], [0, 100], "딱 2 → 골인");
    const s3 = game(100); s3.players[0].pos = 99; s3.force = [1];
    await R.step(s3, makeIO()); eq(s3.winner, 0, "99에서 One → 골인");
    const s4 = game(100); s4.players[0].pos = 97; s4.players[0].ability = ["P01"];
    await R.useCard(s4, makeIO(), 0, "P01");
    eq([s4.players[0].pos, s4.winner], [97, null], "피카츄 +6 도 넘치면 못 감");
    const s5 = game(100); s5.players[0].pos = 94; s5.players[0].ability = ["P01"];
    await R.useCard(s5, makeIO(), 0, "P01"); eq(s5.winner, 0, "피카츄 +6 딱 100 → 골인");
  }
  // 재합류 (200칸 51)
  {
    const s = game(200); s.rocket.pos = 10; s.players[0].pos = 45; s.players[1].pos = 2; s.force = [6];
    const io = makeIO(); await R.playerTurn(s, io);
    ok(has(io, "regroup"), "재합류 발생");
    eq(s.rocket.pos, s.players[0].pos - 6, "선두 6칸 뒤로 재합류");
    ok(!has(io, "capture"), "재합류는 포획 없음");
    s.rocket.pos = 2; s.players[0].pos = 55; const io2 = makeIO(); s.force = [2];
    await R.playerTurn(s, io2); ok(!has(io2, "regroup"), "같은 체크포인트는 한 번만");
  }
  // 보관함 가득 → 버릴 카드 고르기
  {
    const s = game(100); s.players[0].ability = ["P01", "P02"];
    const io = makeIO({ choices: { discard: "P01" } });
    await R.gainCard(s, io, 0, "P05");
    eq(s.players[0].ability.sort(), ["P02", "P05"], "가득 차면 고른 카드 버림");
    ok(has(io, "choose:discard"), "자동 폐기 없이 물어봄");
  }
  // 운명의 선택·이브이 무한 추첨 없음 (깊이 1)
  {
    for (let i = 0; i < 300; i++) {
      const s = game(100); s.rng = i + 5; s.players[0].pos = 40;
      const io = makeIO();
      await R.resolveCard(s, io, 0, "E12", 0);
      ok(io.log.filter((e) => e.type === "choose:pick").length <= 1, "E12 추가 추첨 1번까지");
    }
  }
  // 퀴즈 보상
  {
    const s = game(100); s.players[0].pos = 1; s.force = [5]; // 6 퀴즈 칸
    const io = makeIO({ quiz: ["first"], choices: { reward: "card" } }); await R.playerTurn(s, io);
    ok(s.players[0].ability.length === 1, "힌트 없이 정답 → 능력 카드 선택");
    const s2 = game(100); s2.players[0].pos = 1; s2.force = [5];
    await R.playerTurn(s2, makeIO({ quiz: ["hint"] })); eq(s2.players[0].pos, 8, "힌트 후 정답 → +2");
    const s3 = game(100); s3.players[0].pos = 1; s3.force = [5];
    await R.playerTurn(s3, makeIO({ quiz: ["first"], choices: { reward: "move" } })); eq(s3.players[0].pos, 9, "정답 +3 (9 = 카드 칸이지만 이벤트 없음)");
  }
  // 보너스 퀴즈: 3번째 턴, 이미 퀴즈 했으면 건너뜀, 한 턴 최대 1문제
  {
    const s = game(100); s.players[0].pos = 49; s.players[0].turns = 2; s.force = [2]; // 51 일반 칸
    const io = makeIO(); await R.playerTurn(s, io);
    ok(io.log.some((e) => e.type === "quiz" && e.ctx.reason === "bonus"), "3번째 턴 보너스 퀴즈");
    const s2 = game(100); s2.players[0].pos = 1; s2.players[0].turns = 2; s2.force = [5]; // 6 퀴즈 칸
    const io2 = makeIO({ quiz: ["fail"] }); await R.playerTurn(s2, io2);
    eq(io2.log.filter((e) => e.type === "quiz").length, 1, "퀴즈 칸 턴엔 보너스 건너뜀");
  }

  // --- 밟기: 다른 캐릭터가 선 칸에 멈추면 밟힌 쪽이 10칸 뒤로 (2026-10-17 사용자 요청) ---
  {
    const s = game(100); s.players[0].pos = 50; s.players[1].pos = 53; s.force = [3];
    const io = makeIO(); await R.playerTurn(s, io);
    eq([s.players[0].pos, s.players[1].pos], [53, 43], "53에 멈춤 → 엄마는 43으로");
    ok(io.log.some((e) => e.type === "stomp" && e.victim === 1 && e.from === 53 && e.to === 43), "밟기 연출");
  }
  {
    const s = game(100, 3); s.players[0].pos = 50; s.players[1].pos = 53; s.players[2].pos = 43; s.force = [3];
    await R.playerTurn(s, makeIO());
    eq(s.players[1].pos, 42, "10칸 뒤에도 누가 있으면 그 뒤 빈칸 (43 → 42)");
  }
  {
    const s = game(100); s.players[0].pos = 50; s.players[1].pos = 54; s.force = [4];
    const io = makeIO(); await R.playerTurn(s, io);
    ok(io.log.some((e) => e.type === "cell" && e.cell === "card"), "밟은 사람은 그 칸(54 카드) 이벤트 그대로");
    const s2 = game(100); s2.players[0].pos = 39; s2.players[1].pos = 45; s2.force = [6];
    await R.playerTurn(s2, makeIO());
    eq(s2.players[1].pos, 35, "밟혀서 간 칸(35 사다리 시작)은 장치를 타지 않음");
  }
  {
    const s = game(100); s.players[0].pos = 10; s.players[1].pos = 31; s.force = [3];
    await R.playerTurn(s, makeIO());
    eq([s.players[0].pos, s.players[1].pos], [31, 21], "사다리 도착 칸(31)에 있던 상대도 밟힘");
  }
  {
    const s = game(100); s.players[0].pos = 1; s.players[1].pos = 1;
    eq(s.players.map((p) => p.pos), [1, 1], "출발 칸은 같이 있어도 됨");
    const s2 = game(100); s2.players[0].pos = 5; s2.players[1].pos = 7; s2.force = [2];
    await R.playerTurn(s2, makeIO()); eq(s2.players[1].pos, 1, "10칸 뒤가 1보다 작으면 출발 칸");
  }
  {
    const s = game(100); s.players[0].pos = 30; s.players[1].pos = 40;
    await R.resolveCard(s, makeIO({ choices: { target: 1 } }), 0, "E03", 0);
    eq([s.players[0].pos, s.players[1].pos], [40, 30], "자리 바꾸기는 밟지 않고 그대로 맞바꿈");
  }

  // --- 혼자하기 (2026-10-17 사용자 요청) ---
  {
    const s = R.createGame({ mode: 100, seed: 5, players: [{ name: "지온이", trainer: "ash" }] });
    ok(s.solo, "한 명이면 혼자하기");
    let bad = 0;
    const io = makeIO();
    for (let i = 0; i < 300; i++) { await R.cellEvent(Object.assign(s, { players: [Object.assign(s.players[0], { pos: 9, ability: [], held: null })] }), io, 0); }
    io.log.filter((e) => e.type === "draw").forEach((e) => { if (R.SOLO_SKIP.includes(e.card)) bad++; });
    eq(bad, 0, "혼자하기 카드 더미엔 상대에게 거는 카드 없음");
    const s2 = R.createGame({ mode: 100, seed: 6, players: [{ name: "지온이", trainer: "ash" }] }); s2.rocket.pos = 50;
    const io2 = makeIO(); await R.resolveCard(s2, io2, 0, "E03", 0);
    ok(has(io2, "nothing") && !has(io2, "choose:target"), "혼자하기 자리 바꾸기 → 아무 일 없음");
    const io3 = makeIO(); await R.resolveCard(s2, io3, 0, "R02", 0);
    ok(io3.log.find((e) => e.type === "choose:target").data.options.join() === "0", "혼자하기 급습 → 나에게");
    let done = 0;
    for (let g = 0; g < 300; g++) {
      const t = R.createGame({ mode: 100, seed: g + 1, players: [{ name: "지온이", trainer: "ash" }] });
      const tio = makeIO(); tio.quiz = async () => "first";
      let guard = 0;
      while (t.winner == null && guard++ < 2000) { await R.step(t, tio); tio.log.length = 0; }
      if ((t.winner === 0 && t.players[0].pos === 100) || (t.rocketWon && t.rocket.pos === 100)) done++;
    }
    eq(done, 300, "혼자하기 300판 모두 끝남 (딱 100 골인 또는 로켓단 도착)");
  }

  // --- 무작위 판 수천 개: 무한 루프·이상한 값 없음 ---
  for (const mode of [100, 200]) {
    let turns = 0, games = 0;
    for (let g = 0; g < 500; g++) {
      const s = R.createGame({ mode, seed: g * 31 + 7, players: [{ name: "a", trainer: "ash" }, { name: "b", trainer: "red" }, { name: "c", trainer: "misty" }] });
      const io = makeIO({ choices: {
        action: (d) => { const u = d.cards.filter((c) => c.ok); return u.length && g % 2 ? u[0].id : "roll"; },
        quiz: undefined,
      } });
      io.quiz = async () => ["first", "hint", "explained", "fail"][(g + turns) % 4];
      let guard = 0;
      while (s.winner == null && guard++ < 3000) {
        await R.step(s, io);
        for (const p of s.players) if (p.pos < 1 || p.pos > s.goal || p.ability.length > 2) throw new Error("이상한 값 " + JSON.stringify(p));
        const ps = s.players.map((p) => p.pos).filter((n) => n > 1 && n < s.goal);
        if (new Set(ps).size !== ps.length) throw new Error("같은 칸에 두 캐릭터 " + ps);
        if (s.rocket.pos < 1 || s.rocket.pos > s.goal || (s.rocket.pos === s.goal && !s.rocketWon)) throw new Error("로켓단 위치 " + s.rocket.pos);
        io.log.length = 0;
      }
      ok(s.winner != null, `${mode}칸 판 ${g} 끝남`);
      turns += s.round; games++;
    }
    console.log(`  ${mode}칸 500판 평균 ${(turns / games).toFixed(1)} 라운드`);
  }

  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
