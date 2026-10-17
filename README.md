# 포켓몬 사다리 대모험

트레이너(지우·웅·이슬·블루·레드)와 파트너 포켓몬이 100칸 또는 200칸을 달리는 가족용 사다리 게임.
사다리·미끄럼틀, 로켓단 추격, 능력 카드 30종, 수학·영어 퀴즈(객관식·듣기·직접 입력·터치 배열)로 승부가 뒤집힌다.
아이패드 가로 화면 기준, 2~4명이 한 기기로 번갈아 한다.

▶ 플레이: https://ian939.github.io/pokemon-ladder/

## 구성

| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 틀 · `APP_VERSION` (배포할 때마다 올리고 `?v=` 도 같이) |
| `js/rules.js` | 규칙 엔진 (판·주사위·사다리·미끄럼틀·로켓단·카드 30종). 화면과 분리, Node 에서도 돈다 |
| `js/quiz-math.js` | 수학 25유형 문제 생성기 (LV.2~4, 정답·힌트·풀이를 같은 숫자로 계산) |
| `js/quiz-en.js` | 영어 25유형 문항 은행 (298문항) |
| `js/learn.js` | 사람별 난이도 · 문제 고르기 · 학습 기록 · 약점 복습 |
| `js/app.js` | 판 그리기 · 연출 · 퀴즈 화면 · 결과 · 부모 화면 · 새 버전 감지 |
| `js/voice-lines.js` | 게임이 읽어 주는 한국어 말 전부 |
| `js/lock.js`, `css/lock.css` | 패드 확대·복사 잠금 |
| `plan.md` | 기획서 (§0 = 구현 확정 사항) |

## 도구

```bash
node tools/test-rules.js        # 규칙 (plan §15 체크리스트 + 무작위 1,000판)
node tools/test-quiz.js         # 문제 은행 (정답 유일성 · 풀이 검산 · 곱셈 그림)
node tools/sim.js               # 밸런스 시뮬레이션
PYTHONUTF8=1 python tools/test-ui.py        # 화면 (Playwright, 판을 끝까지 둔다)
python tools/gen-voice.py       # 목소리 녹음 (말을 바꾸면 다시)
python tools/gen-art.py         # Codex 도트 그림 (art-src/gen, git 제외)
python tools/postprocess.py     # 그림 다듬기 → assets/
```

## 그림·소리

- 판·사다리·미끄럼틀·카드 틀·아이콘·배경: Codex(GPT 이미지) 도트 그림 (`tools/art-prompts.json`)
- 트레이너: Pokémon Showdown 트레이너 도트, 포켓몬: PokeAPI 5세대 도트
- 목소리: Microsoft Edge TTS 미리 녹음 (한국어 선희 · 로켓단 인준 · 영어 Ana)
- 글꼴: 갈무리11 (OFL)

## 저작권

포켓몬·로켓단 이름, 캐릭터, 이미지는 Nintendo · Creatures · GAME FREAK · The Pokémon Company 의 지식재산이다.
이 게임은 가족이 집에서 쓰려고 만든 **비공식 팬 프로젝트**이며 판매·상업 이용을 하지 않는다.
