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
  eq(R.MAPS[100].dice, 1, "100칸 주사위 1개");
  eq(R.MAPS[200].dice, 2, "200칸 주사위 2개");

  // --- 주사위 개수 ---
  for (const mode of [100, 200]) {
    const s = game(mode); s.players[0].pos = 50; s.rocket.pos = mode - 1;
    const io = makeIO(); await R.playerTurn(s, io);
    const d = io.log.find((e) => e.type === "dice");
    eq(d.dice.length, mode === 100 ? 1 : 2, mode + "칸 플레이어 주사위 수");
    const s2 = game(mode); s2.players.forEach((p) => (p.pos = 2)); s2.rocket.pos = 60;
    const io2 = makeIO(); await R.rocketTurn(s2, io2);
    eq(io2.log.find((e) => e.type === "rocket-dice").dice.length, 1, mode + "칸 로켓단 주사위 1개");
  }

  // --- 잠만보: 100칸 주사위 2 → -4 ---
  {
    const s = game(100); s.players[0].pos = 50; s.players[0].st.minus6 = true; s.force = [2];
    const io = makeIO(); await R.playerTurn(s, io);
    eq(s.players[0].pos, 46 === 46 ? R.MAPS[100].slides[46] : 46, "잠만보 100칸 2 → -4 (46은 미끄럼틀 → 29)");
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
    const s = game(200); s.players[0].pos = 100; s.players[0].st.minus6 = true; s.force = [4, 5];
    await R.playerTurn(s, makeIO()); eq(s.players[0].pos, 103 === 103 ? 103 : 0, "잠만보 200칸 합 9 → +3");
    const s2 = game(200); s2.players[0].pos = 100; s2.players[0].st.minus6 = true; s2.force = [6, 6];
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
    eq(io.log.find((e) => e.type === "dice").dice.length, 2, "파이리 → 100칸 주사위 2개");
    const s2 = game(200); s2.players[0].pos = 50; s2.players[0].ability = ["P02"];
    const io2 = makeIO({ choices: { action: "P02" } }); await R.playerTurn(s2, io2);
    eq(io2.log.find((e) => e.type === "dice").dice.length, 3, "파이리 → 200칸 주사위 3개");
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
  // 로켓단은 결승 못 넘음
  {
    const s = game(100); s.rocket.pos = 97; s.players[0].pos = 98; s.players[1].pos = 98; s.force = [6];
    await R.rocketTurn(s, makeIO()); ok(s.rocket.pos <= 99, "로켓단은 99번까지");
  }
  // 승리: 결승 초과도 승리
  {
    const s = game(100); s.players[0].pos = 98; s.force = [6];
    await R.step(s, makeIO()); eq(s.winner, 0, "결승 초과 → 승리");
    eq(s.players[0].pos, 100, "결승칸에 멈춤");
  }
  // 재합류 (200칸 51)
  {
    const s = game(200); s.rocket.pos = 10; s.players[0].pos = 45; s.players[1].pos = 2; s.force = [3, 3];
    const io = makeIO(); await R.playerTurn(s, io);
    ok(has(io, "regroup"), "재합류 발생");
    eq(s.rocket.pos, s.players[0].pos - 6, "선두 6칸 뒤로 재합류");
    ok(!has(io, "capture"), "재합류는 포획 없음");
    s.rocket.pos = 2; s.players[0].pos = 55; const io2 = makeIO(); s.force = [1, 1];
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
    const s = game(100); s.players[0].pos = 50; s.players[0].turns = 2; s.force = [1]; // 51 일반 칸
    const io = makeIO(); await R.playerTurn(s, io);
    ok(io.log.some((e) => e.type === "quiz" && e.ctx.reason === "bonus"), "3번째 턴 보너스 퀴즈");
    const s2 = game(100); s2.players[0].pos = 1; s2.players[0].turns = 2; s2.force = [5]; // 6 퀴즈 칸
    const io2 = makeIO({ quiz: ["fail"] }); await R.playerTurn(s2, io2);
    eq(io2.log.filter((e) => e.type === "quiz").length, 1, "퀴즈 칸 턴엔 보너스 건너뜀");
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
        if (s.rocket.pos < 1 || s.rocket.pos >= s.goal) throw new Error("로켓단 위치 " + s.rocket.pos);
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
