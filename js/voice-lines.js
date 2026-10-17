/* 게임이 읽어 주는 한국어 말 — 전부 여기 모은다.
 * tools/gen-voice.py 가 이 파일 + 카드 이름 + 영어 문항을 Edge TTS 로 미리 녹음한다.
 * 말을 바꾸거나 새로 넣으면 python tools/gen-voice.py 를 다시 돌릴 것 (안 돌리면 그 말만 기기 목소리).
 * 이름처럼 바뀌는 값은 조각으로 따로: say(name, L.turn)
 */
(function (root) {
  "use strict";
  const L = {
    title: "포켓몬 사다리 대모험!",
    turn: "의 차례예요!",
    roll: "주사위를 굴려요!",
    skip: "쿨쿨… 이번 턴은 쉬어요.",
    ladder: "사다리다! 위로 올라가요!",
    slide: "미끄럼틀이다! 슈우욱!",
    stay: "제자리에 멈췄어요.",
    hop: "친구를 넘어서 한 칸 앞으로!",
    cellQuiz: "퀴즈 칸이에요!",
    cellCard: "카드 칸이에요! 카드를 뽑아요.",
    cellRocket: "로켓단 칸이에요!",
    bonus: "보너스 퀴즈 시간!",
    rocketTurn: "로켓단 차례다옹!",
    rocketChase: "로켓단이 쫓아간다옹!",
    rocketRest: "로켓단은 쿨쿨 쉬는 중이다옹…",
    rocketWarp: "펑! 로켓단이 나타났다옹!",
    regroup: "로켓단이 지름길로 따라왔다옹!",
    caught: "로켓단에게 잡혔다! 문제를 맞혀서 탈출해요!",
    caughtRocket: "잡았다옹! 포켓몬은 우리가 데려간다옹!",
    safe: "안전지대 덕분에 무사해요!",
    defend: "막았다! 로켓단은 꼼짝 못 해요!",
    escaped: "탈출 성공!",
    escapeFail: "아쉬워요. 다섯 칸 뒤로 가요.",
    kick: "로켓단은 또 당했다옹~!",
    correct: "정답이에요!",
    great: "우와, 한 번에 맞혔어요!",
    wrong: "다시 생각해 볼까요?",
    hint: "힌트를 보고 한 번 더!",
    explain: "같이 풀어 볼까요?",
    similar: "비슷한 문제로 다시 도전!",
    answerIs: "정답은 이거였어요. 다음엔 꼭 맞힐 수 있어요!",
    stamp: "별 도장을 받았어요!",
    rewardPick: "카드를 받을까요, 세 칸 갈까요?",
    cardGet: "카드를 얻었어요!",
    full: "카드가 가득 찼어요. 버릴 카드를 골라요.",
    pickTarget: "누구에게 쓸까요?",
    pickCell: "가고 싶은 칸을 눌러요!",
    pickDir: "어느 쪽으로 보낼까요?",
    pickTwo: "두 장 중에서 한 장을 골라요!",
    lucky: "주사위 눈을 골라요!",
    reroll: "한 번 더 굴릴까요?",
    defendAsk: "카드로 막을까요?",
    lullabyOk: "쿨쿨… 자장가 성공!",
    lullabyFail: "앗, 안 잠들었어요!",
    steal: "카드를 슬쩍 가져왔어요!",
    swap: "자리를 바꿨어요!",
    nothing: "아무 일도 없었어요.",
    minus6: "잠만보가 길을 막았어요! 여섯 칸 빼기!",
    minus2: "길이 막혔어요! 두 칸 빼기!",
    challengeMiss: "아쉽지만 이번엔 그대로예요.",
    win: "골인! 우승이에요!",
    winner: "우승!",
    newGame: "새 모험을 시작해요!",
    updateNew: "새 버전이 나왔어요!",
    listen: "잘 들어 봐요.",
  };
  // 이름 조각 (프로필에서 고를 수 있는 이름)
  const NAMES = ["지온이", "엄마", "아빠", "할머니", "할아버지", "이모", "삼촌", "친구", "형", "누나", "언니", "동생"];
  const API = { L, NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.VoiceLines = API;
})(typeof window !== "undefined" ? window : globalThis);
