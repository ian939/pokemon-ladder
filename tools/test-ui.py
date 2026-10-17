"""화면 검사 (Playwright + Chromium). 로컬 HTTP 서버를 스스로 띄워 실제 버튼을 눌러 판을 끝까지 둔다.

    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/test-ui.py [스크린샷 폴더]

확인하는 것
  1. 100칸 2명: 처음 → 준비 → 판 끝까지 (주사위 버튼·카드·고르기 창·퀴즈 4형식을 실제로 누른다) → 우승 화면
  2. 200칸 3명: 끝까지 (주사위 2개 확인)
  3. 퀴즈 흐름: 오답 → 힌트 → 오답 → 풀이(곱셈 7개씩 4묶음 그림·누적) → 비슷한 문제
  4. 이어하기: 판 중간 새로고침 → 같은 차례·같은 위치
  5. 새 버전 감지: 서버 파일의 APP_VERSION 이 다르면 알림
  6. 누르는 것 44×44px 이상 · 가로 스크롤 없음 (가로 패드 3크기 · 세로 패드 · 폰)
  7. 부모 화면 잠금(곱셈) · 학습 기록 · '초기화' 글자 입력
  8. 콘솔 오류 0개
"""
import functools
import http.server
import pathlib
import re
import sys
import threading
import time

from playwright.sync_api import sync_playwright

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = pathlib.Path(_args[0]) if _args else ROOT / "art-src" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
fails = []
FAKE_VER = {"on": False}


def check(cond, msg):
    print(("✅ " if cond else "❌ ") + msg)
    if not cond:
        fails.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        # 새 버전 감지 시험: 서빙하는 index.html 의 APP_VERSION 만 바꿔치기
        if FAKE_VER["on"] and self.path.split("?")[0] in ("/", "/index.html"):
            body = (ROOT / "index.html").read_text(encoding="utf-8")
            body = re.sub(r'APP_VERSION = "[^"]+"', 'APP_VERSION = "2099-01-01z"', body).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def serve():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


# 퀴즈 자동 풀이 — wrong=True 면 일부러 틀린다
ANSWER_JS = """(wrong) => {
  const q = window.__T.G.lastQ; const body = document.querySelector('#qzBody');
  if (!q || !body) return 'none';
  const ans = q.answer;
  if (q.kind === 'choice') {
    const bs = [...body.querySelectorAll('[data-k=choice]')];
    const b = wrong ? bs.find(x => x.dataset.v !== ans) : bs.find(x => x.dataset.v === ans);
    b.click(); return 'choice';
  }
  if (q.kind === 'input') {
    const v = wrong ? (q.keypad === 'letters' ? (ans === 'Z' ? 'Q' : 'Z') : String(+ans + 1)) : String(ans);
    for (const ch of v.toUpperCase()) body.querySelector(`[data-k=key][data-v="${ch}"]`).click();
    body.querySelector('[data-k=key][data-v=ok]').click(); return 'input';
  }
  if (q.kind === 'order') {
    const want = wrong ? ans.slice().reverse() : ans;
    if (wrong && want.join() === ans.join()) { want.push(want.shift()); }
    for (const w of want) {
      const t = [...body.querySelectorAll('[data-k=tok]')].find(x => !x.disabled && x.textContent === w);
      t.click();
    }
    body.querySelector('[data-k=check]').click(); return 'order';
  }
  return 'unknown';
}"""


def play(pg, label, max_steps=6000, wrong_every=4, shots=True):
    """화면을 보고 할 일을 한다: 주사위 · 고르기 창 · 퀴즈 · 칸 고르기"""
    seen = {"quiz": 0, "wrong": 0, "modal": 0, "roll": 0, "cell": 0, "kinds": set(), "dice": set()}
    t0 = time.time()
    shot_quiz = shot_modal = False
    for step in range(max_steps):
        if pg.locator(".screen-result").count():
            break
        if pg.locator(".quiz-layer #qzBody [data-k]").count() and not pg.locator("#qzBody .qz-explain").count():
            if not pg.locator("#qzBody.ok, #qzBody.no").count():
                q = pg.evaluate("() => { const q = window.__T.G.lastQ; return q ? q.kind + ':' + q.subject : '' }")
                seen["kinds"].add(q)
                wrong = (seen["quiz"] % wrong_every == wrong_every - 1)
                if shots and not shot_quiz:
                    pg.screenshot(path=str(OUT / f"{label}-quiz.png"))
                    shot_quiz = True
                r = pg.evaluate(ANSWER_JS, wrong)
                seen["quiz"] += 1
                if wrong:
                    seen["wrong"] += 1
                pg.wait_for_timeout(30)
                continue
        if pg.locator(".layer.modal [data-v]").count():
            if shots and not shot_modal:
                pg.screenshot(path=str(OUT / f"{label}-modal.png"))
                shot_modal = True
            btns = pg.locator(".layer.modal [data-v]:not([disabled])")
            if btns.count():
                try:
                    btns.first.click(timeout=1500)
                    seen["modal"] += 1
                except Exception:
                    pass  # 시험 모드에서 저절로 닫히는 창
            pg.wait_for_timeout(20)
            continue
        if pg.locator(".cell.selectable").count():
            pg.locator(".cell.selectable").last.click()
            seen["cell"] += 1
            continue
        rb = pg.locator("#rollBtn:not([disabled])")
        if rb.count():
            try:
                rb.click(timeout=1500)
            except Exception:
                continue
            seen["roll"] += 1
            d = pg.evaluate("() => document.querySelectorAll('#dice .die3d').length")
            seen["dice"].add(d)
            continue
        pg.wait_for_timeout(25)
    seen["sec"] = round(time.time() - t0)
    return seen


def touch_targets(pg, where):
    bad = pg.evaluate("""() => [...document.querySelectorAll('button, .btn, [data-k], [data-v]')]
      .filter(b => b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
      .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 12) || b.className, Math.round(r.width), Math.round(r.height)]; })
      .filter(([, w, h]) => w > 0 && (w < 44 || h < 44))""")
    check(not bad, f"{where}: 누르는 것 44px 이상" + (f" — 작음 {bad[:5]}" if bad else ""))
    hs = pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(hs <= 0, f"{where}: 가로 스크롤 없음 ({hs})")


def main():
    srv, base = serve()
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--mute-audio"])

        def page(w, h):
            pg = br.new_page(viewport={"width": w, "height": h}, has_touch=True)
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            return pg

        # ---------- 1. 100칸 2명 끝까지 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=7")
        pg.screenshot(path=str(OUT / "01-title.png"))
        touch_targets(pg, "처음 화면")
        pg.click("text=새 모험")
        pg.screenshot(path=str(OUT / "02-setup.png"))
        touch_targets(pg, "준비 화면")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#board .cell")
        check(pg.locator("#board .cell").count() == 100, "100칸 판에 칸 100개")
        check(pg.locator(".chutes g.ladder").count() == 8 and pg.locator(".chutes g.slide").count() == 6, "사다리 8 · 무지개 미끄럼틀 6 그림")
        check(pg.locator(".nums .num").count() == 100, "칸 숫자 100개 (미끄럼틀 위층)")
        pg.screenshot(path=str(OUT / "03-board100.png"))
        touch_targets(pg, "판 화면 1180×820")
        seen = play(pg, "g100")
        check(pg.locator(".screen-result").count() == 1, f"100칸 판 끝까지 → 우승 화면 ({seen['sec']}초, 주사위 {seen['roll']}번, 퀴즈 {seen['quiz']}문제, 고르기 {seen['modal']}번)")
        check(seen["dice"] == {2}, f"100칸 주사위 2개 화면 ({seen['dice']})")
        check(seen["wrong"] > 0, "틀린 답 경로도 지나감")
        pg.screenshot(path=str(OUT / "04-result100.png"))
        touch_targets(pg, "우승 화면")
        st = pg.evaluate("() => window.__T.Store.data")
        check(st["game"] is None and len(st["history"]) == 1, "판 기록 저장 · 하던 판 지움")
        solved = sum(p["qs"]["n"] for p in st["history"][0]["players"])
        check(sum(v["total"] for v in st["learn"].values()) == solved and solved > 0, f"학습 기록 = 판에서 푼 문제 수 ({solved})")
        pg.close()

        # ---------- 2. 200칸 3명 ----------
        pg = page(1366, 1024)
        pg.goto(base + "/index.html?test&seed=11")
        pg.click("text=새 모험")
        pg.click("text=200칸")
        pg.click("text=한 명 더")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#board .cell")
        check(pg.locator("#board .cell").count() == 200, "200칸 판에 칸 200개")
        check(pg.locator(".region").count() == 4, "200칸 지역 바닥 4개")
        sc = pg.evaluate("() => { const v = document.querySelector('#boardView'); return [v.scrollHeight, v.clientHeight]; }")
        check(sc[0] > sc[1] * 1.5, f"200칸은 판이 화면보다 길다 → 카메라가 따라감 ({sc})")
        seen = play(pg, "g200")
        check(pg.locator(".screen-result").count() == 1, f"200칸 판 끝까지 ({seen['sec']}초, 주사위 {seen['roll']}번, 퀴즈 {seen['quiz']}문제)")
        check(2 in seen["dice"], f"200칸 주사위 2개 화면 ({seen['dice']})")
        kinds = {k.split(':')[0] for k in seen["kinds"]}
        check({"choice", "input", "order"} <= kinds, f"퀴즈 형식 여러 가지 ({sorted(seen['kinds'])})")
        pg.screenshot(path=str(OUT / "05-result200.png"))
        pg.close()

        # ---------- 3. 퀴즈 흐름: 오답 → 힌트 → 오답 → 풀이 → 비슷한 문제 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=3")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#rollBtn:not([disabled])")
        pg.evaluate("""() => { let made = false; Learn.pick = (pl, rec, used, r) => { for (;;) { const q = MathQ.make('M23', r); if (q.mul.a === 7 && q.mul.b === 4) return q; } };
          window.__TEST_SLOW_EXPLAIN = true; window.__T.Quiz.run(0, { reason: 'cell' }).then(r => window.__qres = r); }""")
        pg.wait_for_selector("#qzBody [data-k=key]")
        pg.evaluate(ANSWER_JS, True)
        pg.wait_for_selector(".qz-hint")
        check("7개씩 묶음이 4개" in pg.inner_text(".qz-hint"), "첫 오답 → 힌트 (정답은 아직 안 보임)")
        check("28" not in pg.inner_text(".qz-hint"), "힌트에 정답 28 없음")
        pg.screenshot(path=str(OUT / "06-hint.png"))
        pg.evaluate(ANSWER_JS, True)
        pg.wait_for_selector(".qz-explain")
        pg.wait_for_timeout(300)
        txt = pg.inner_text(".qz-explain")
        check("7개가 들어 있는 상자 4개" in txt and "7 → 14 → 21 → 28" in txt and "7 + 7 + 7 + 7 = 28" in txt and "7 × 4 = 28" in txt,
              "곱셈 풀이: 7개씩 4묶음 · 누적 · 반복 덧셈 · 곱셈")
        check(pg.locator(".qz-explain .grp").count() == 4 and pg.locator(".qz-explain .grp").first.locator(".it").count() == 7, "풀이 그림: 7개 든 상자 4개")
        acc = pg.eval_on_selector_all(".qz-explain .acc", "els => els.map(e => e.textContent)")
        check(acc == ["7", "14", "21", "28"], f"상자마다 누적 수 {acc}")
        pg.screenshot(path=str(OUT / "07-explain.png"))
        pg.click(".qz-explain [data-v=next]")
        pg.wait_for_selector("#qzBody [data-k=key]")
        sub = pg.inner_text("#qzSub")
        check("비슷한 문제" in sub, "풀이 뒤 비슷한 문제")
        q2 = pg.evaluate("() => window.__T.G.lastQ.mul")
        check(q2 and not (q2["a"] == 7 and q2["b"] == 4), f"비슷한 문제는 다른 숫자 ({q2})")
        pg.evaluate(ANSWER_JS, False)
        pg.wait_for_function("() => window.__qres")
        check(pg.evaluate("() => window.__qres") == "explained", "풀이 후 정답 = 'explained' 기록")
        rec = pg.evaluate("() => window.__T.Store.data.learn['지온이'].concepts.M23")
        check(rec["explained"] == 1 and rec["needReview"], "학습 기록: 곱셈 묶음 복습 필요")

        # 듣기 다시 재생 여러 번 · 문장 배열 되돌리기
        pg.evaluate("() => { Learn.pick = (pl, rec, used, r) => EnQ.make('E18', r, null); window.__qres = null; window.__T.Quiz.run(0, { reason: 'bonus' }).then(r => window.__qres = r); }")
        pg.wait_for_selector("#qzBody [data-k=tok]")
        toks = pg.locator("#qzBody [data-k=tok]")
        toks.nth(0).click(); toks.nth(1).click()
        check(pg.locator("#qzLine .tok").count() == 2, "배열: 누른 순서대로 줄에 들어감")
        pg.click("[data-k=undo]")
        check(pg.locator("#qzLine .tok").count() == 1 and pg.locator("#qzBody [data-k=tok]:not([disabled])").count() >= 2, "배열: 되돌리기")
        pg.locator("#qzLine .tok").first.click()
        check(pg.locator("#qzLine .tok").count() == 0, "배열: 줄의 블록을 눌러 빼기")
        check(pg.locator("[data-k=listen]").count() == 0, "문장 배열엔 정답을 읽어 주는 버튼 없음")
        pg.evaluate(ANSWER_JS, False)
        pg.wait_for_function("() => window.__qres")
        pg.evaluate("() => { Learn.pick = (pl, rec, used, r) => EnQ.make('E02', r, null); window.__qres = null; window.__T.Quiz.run(0, { reason: 'bonus' }).then(r => window.__qres = r); }")
        pg.wait_for_selector("[data-k=listen]")
        for _ in range(5):
            pg.click("[data-k=listen]")
        check(pg.locator("#qzBody [data-k=choice]").count() == 4, "듣기 버튼 여러 번 눌러도 문제 그대로")
        pg.evaluate(ANSWER_JS, False)
        pg.wait_for_function("() => window.__qres")
        check(pg.locator(".quiz-layer").count() == 0, "퀴즈 창이 한 번만 열리고 닫힘")
        # 카드 공개 창: 뒤집힌 카드가 버튼을 가리지 않는다 (진짜 클릭)
        pg.evaluate("() => { window.__rv = 0; revealCard(0, 'P01', 'reward').then(() => window.__rv = 1); }")
        pg.wait_for_timeout(700)
        try:
            pg.click(".reveal [data-v=ok]", timeout=3000)
        except Exception:
            pass
        pg.wait_for_timeout(200)
        check(pg.evaluate("() => window.__rv") == 1, "카드 공개 창 '좋아!' 버튼이 눌림")
        # 같은 칸이면 넘어서 한 칸 앞으로 (화면)
        pg.evaluate("""() => { const s = window.__T.G.s; s.players[0].pos = 50; s.players[1].pos = 53; s.force = [3];
          window.__msgs = []; const o = window.setMsg; window.setMsg = (t) => { window.__msgs.push(t); o(t); };
          window.__hop = 0; Rules.placePlayer(s, window.__T.IO, 0, 53, { via: 'dice' }).then(() => window.__hop = 1); }""")
        pg.wait_for_function("() => window.__hop")
        check(pg.evaluate("() => window.__T.G.s.players[0].pos") == 54, "화면: 친구 칸(53)에 오면 넘어서 54")
        check(any("엄마를 넘어서 한 칸 앞으로" in m for m in pg.evaluate("() => window.__msgs")), "화면: 넘기 안내 글 (엄마를 넘어서…)")
        pg.close()

        # ---------- 4. 이어하기 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=21")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        play(pg, "resume", max_steps=60, shots=False)
        pg.wait_for_selector("#rollBtn:not([disabled])")
        before = pg.evaluate("() => { const s = window.__T.G.s; return [s.turn, s.round, s.players.map(p => p.pos), s.rocket.pos]; }")
        pg.goto(base + "/index.html?test&seed=21")
        check(pg.locator("text=이어하기").count() == 1, "새로고침 뒤 처음 화면에 '이어하기'")
        pg.click("text=이어하기")
        pg.wait_for_selector("#rollBtn:not([disabled])")
        after = pg.evaluate("() => { const s = window.__T.G.s; return [s.turn, s.round, s.players.map(p => p.pos), s.rocket.pos]; }")
        check(before == after, f"이어하기 = 같은 차례·위치 ({before} / {after})")
        # 크기별 화면
        for (w, h, nm) in [(1024, 768, "가로 1024×768"), (1366, 1024, "가로 1366×1024"), (820, 1180, "세로 820×1180"), (390, 844, "폰 390×844")]:
            pg.set_viewport_size({"width": w, "height": h})
            pg.wait_for_timeout(150)
            pg.evaluate("() => window.dispatchEvent(new Event('resize'))")
            pg.wait_for_timeout(150)
            pg.screenshot(path=str(OUT / f"08-size-{w}x{h}.png"))
            touch_targets(pg, nm)
            vis = pg.evaluate("() => { const r = document.querySelector('#rollBtn').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; }")
            check(vis or w < 500, f"{nm}: 굴리기 버튼이 화면 안")
        pg.close()

        # ---------- 5. 새 버전 감지 ----------
        # 패드는 옛 파일을 들고 있고, 서버에는 새 버전이 올라간 상황
        pg = page(1180, 820)
        pg.goto(base + "/index.html")
        pg.wait_for_selector(".title-menu")
        FAKE_VER["on"] = True
        pg.evaluate("() => checkUpdate(true)")
        pg.wait_for_selector("text=새 버전이 나왔어요", timeout=5000)
        check(True, "새 버전 감지 알림 (처음 화면)")
        check("2099-01-01z" in pg.inner_text(".layer.modal"), "알림에 새 버전 번호")
        FAKE_VER["on"] = False
        pg.click("text=나중에")
        check(pg.locator(".btn.upd").count() == 1, "'나중에' 뒤에도 처음 화면에 새 버전 버튼")
        pg.close()

        # ---------- 6. 부모 화면 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test")
        pg.evaluate("() => { window.__T.Store.data.learn = { '지온이': Learn.record(Learn.blank(), MathQ.make('M04'), 'fail') }; window.__T.Store.save(); }")
        pg.click("text=부모")
        q = pg.inner_text(".gate b")
        a, b = map(int, re.findall(r"\d+", q))
        for ch in "1":
            pg.click(f".gate .key[data-v='{ch}']")
        pg.click(".gate .key.ok")
        check(pg.locator(".screen-parent").count() == 0, "틀린 곱셈으로는 부모 화면 안 열림")
        for ch in str(a * b):
            pg.click(f".gate .key[data-v='{ch}']")
        pg.click(".gate .key.ok")
        pg.wait_for_selector(".screen-parent")
        check("받아내림 있는 뺄셈" in pg.inner_text("#app"), "부모 화면: 이해가 더 필요한 개념")
        pg.screenshot(path=str(OUT / "09-parent.png"))
        pg.click("[data-a=wipe]")
        check(pg.locator(".pr").count() == 1, "'초기화' 안 쓰면 안 지워짐")
        pg.fill("#wipeIn", "초기화")
        pg.click("[data-a=wipe]")
        check(pg.locator(".pr").count() == 0, "'초기화' 쓰면 지워짐")
        pg.close()

        # ---------- 7. 목소리 녹음 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test")
        miss = pg.evaluate("""() => {
          const want = [...Object.values(VoiceLines.L), ...Object.values(Rules.CARDS).map(c => c.name), ...EnQ.speechTexts(), ...VoiceLines.NAMES];
          return want.filter(t => !window.VOICE[Voice.key(t)]);
        }""")
        check(not miss, f"안내·카드·영어 문장이 모두 녹음됨 (없음 {len(miss)}: {miss[:4]})")
        f = pg.evaluate("() => window.VOICE[Voice.key('The cat is sleeping.')]")
        r = pg.request.get(base + "/assets/voice/" + str(f))
        check(r.ok and int(r.headers.get("content-length", "0")) > 1000, "녹음 파일 열림 (The cat is sleeping.)")
        pg.close()

        br.close()
    srv.shutdown()
    check(not errors, f"콘솔 오류 0개 ({errors[:3]})")
    print(f"\n실패 {len(fails)}개")
    for f in fails:
        print("  - " + f)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
