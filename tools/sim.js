// 밸런스 시뮬레이션 — plan.md §15.1 (판 길이 · 퀴즈 수 · 포획 빈도)
//   node tools/sim.js [판 수]
// 아이 정답률 가정: 바로 60% · 힌트 후 20% · 풀이 후 10% · 못 풂 10% / 카드는 쓸 수 있으면 쓴다
const R = require("../js/rules.js");
const N = +process.argv[2] || 3000;

function bot(s, rnd) {
  return {
    async show() {},
    async choose(kind, d) {
      if (kind === "action") { const u = d.cards.filter((c) => c.ok); return u.length ? u[0].id : "roll"; }
      if (kind === "target") return d.options[Math.floor(rnd() * d.options.length)];
      if (kind === "direction") return rnd() < 0.5 ? -1 : 1;
      if (kind === "cell") return d.to;
      if (kind === "pick") return 0;
      if (kind === "discard") return d.add;
      if (kind === "reward") return rnd() < 0.5 ? "card" : "move";
      if (kind === "reroll") return false;
      if (kind === "lucky") return 6;
      if (kind === "defend") return d.options[0];
      return null;
    },
    async quiz() { const x = rnd(); return x < 0.6 ? "first" : x < 0.8 ? "hint" : x < 0.9 ? "explained" : "fail"; },
  };
}
function mulberry(seed) {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * p)];
(async () => {
  for (const mode of [100]) { // 200칸은 숨김
    for (const np of [1, 2, 3, 4]) {
      const rounds = [], quizPP = [], caps = [], firstWin = [0, 0]; let rocketWon = 0;
      for (let g = 0; g < N; g++) {
        const players = R.TRAINERS.slice(0, np).map((t) => ({ name: t.name, trainer: t.id }));
        const s = R.createGame({ mode, seed: g * 7919 + np, players });
        const io = bot(s, mulberry(g + 1));
        while (s.winner == null && s.round < 400) await R.step(s, io);
        rounds.push(s.round);
        quizPP.push(s.quizzes / np);
        caps.push(s.captures);
        firstWin[s.winner === 0 ? 0 : 1]++; if (s.rocketWon) rocketWon++;
      }
      const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
      // 시간 어림: 사람 한 차례 약 15초 + 퀴즈 1문제 약 40초 + 로켓단 차례 약 6초
      const mins = (+avg(rounds) * (np * 15 + 6) + +avg(quizPP) * np * 40) / 60; // v2: 차례 안내를 기다리지 않음 (한 차례 약 15초)
      console.log(`${mode}칸 ${np}명: 라운드 평균 ${avg(rounds)} (10%~90%: ${pct(rounds, 0.1)}~${pct(rounds, 0.9)}) · 1인 퀴즈 ${avg(quizPP)}문제 · 포획 ${avg(caps)}번/판 · 1P 승률 ${(firstWin[0] / N * 100).toFixed(0)}% · 로켓단 도착 ${(rocketWon / N * 100).toFixed(0)}% · 예상 ${mins.toFixed(0)}분`);
    }
  }
})();
