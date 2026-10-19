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
    // 틀린 답 직후 다음 문제가 그려지기 전의 짧은 틈이면 다음에 다시
    if ([...body.querySelectorAll('[data-k=tok]')].some(t => t.disabled)) return 'busy';
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
                if r == "busy":
                    pg.wait_for_timeout(30)
                    continue
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
        rb = pg.locator("#rollBtn.ready")
        if rb.count():
            try:
                rb.click(timeout=1500)
            except Exception:
                continue
            seen["roll"] += 1
            d = pg.evaluate("() => document.querySelectorAll('#wheelDisc .wedge').length")
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
        check(pg.locator("text=200칸").count() == 0, "200칸은 숨김 (100칸만)")
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
        check(seen["dice"] == {12}, f"사람 돌림판 12칸 ({seen['dice']})")
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
        pg.goto(base + "/index.html?test&seed=11&200")
        pg.click("text=새 모험")
        pg.click("[data-a=mode][data-v='200']")
        pg.click("text=한 명 더")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#board .cell")
        check(pg.locator("#board .cell").count() == 200, "200칸 판에 칸 200개")
        check(pg.locator(".region").count() == 4, "200칸 지역 바닥 4개")
        sc = pg.evaluate("() => { const v = document.querySelector('#boardView'); return [v.scrollHeight, v.clientHeight]; }")
        check(sc[0] > sc[1] * 1.5, f"200칸은 판이 화면보다 길다 → 카메라가 따라감 ({sc})")
        seen = play(pg, "g200")
        check(pg.locator(".screen-result").count() == 1, f"200칸 판 끝까지 ({seen['sec']}초, 주사위 {seen['roll']}번, 퀴즈 {seen['quiz']}문제)")
        check(seen["dice"] == {12}, f"200칸도 돌림판 12칸 ({seen['dice']})")
        kinds = {k.split(':')[0] for k in seen["kinds"]}
        check({"choice", "input"} <= kinds, f"퀴즈 형식 여러 가지 ({sorted(seen['kinds'])}) — 배열은 3번에서 따로")
        pg.screenshot(path=str(OUT / "05-result200.png"))
        pg.close()

        # ---------- 3. 퀴즈 흐름: 오답 → 힌트 → 오답 → 풀이 → 비슷한 문제 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=3")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#rollBtn.ready")
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
        lv = pg.evaluate("() => [window.__T.G.s.players[0].math, document.querySelector('#msgText').textContent]")
        check(lv[0] == 2 and "LV.3 → LV.2" in lv[1], f"틀리면 레벨 다운: 수학 LV.3 → LV.2 + 안내 ({lv})")

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
        check(pg.evaluate("() => [window.__T.G.s.players[0].pos, window.__T.G.s.players[1].pos]") == [53, 43], "화면: 엄마 칸(53)에 멈추면 엄마는 43으로")
        check(any("엄마를 밟았다" in m for m in pg.evaluate("() => window.__msgs")), "화면: 밟기 안내 글 (지온이가 엄마를 밟았다)")

        # 퀴즈 보상 +1~+3 이 화면에 보인다 (2026-10-17 사용자 요청)
        pg.evaluate("""() => { window.__msgs = []; window.__rp = null; const o = window.setMsg; window.setMsg = (t) => { window.__msgs.push(t); o(t); };
          new MutationObserver(() => { const w = document.querySelector('.rp.win'); if (w) window.__rp = [w.textContent, document.querySelector('#rpRes').textContent]; })
            .observe(document.body, { subtree: true, childList: true, attributes: true });
          window.__done = 0; window.__T.IO.show({ type: 'reward', who: 0, move: 2, why: 'hint' }).then(() => window.__done = 1); }""")
        pg.wait_for_function("() => window.__done")
        rp = pg.evaluate("() => window.__rp")
        check(rp and rp[0] == "+2" and "+2칸" in rp[1] and "Two" in rp[1], f"퀴즈 보상: +1·+2·+3 중 +2 에 멈추고 '+2칸! Two!' 표시 ({rp})")

        pg.close()
        # 로켓단 탈출 퀴즈 = LV.4 한 번 (2026-10-19 사용자 요청) — 새 페이지 (앞에서 Learn.pick 을 바꿔치기했음)
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=5")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#rollBtn.ready")
        lv4 = pg.evaluate("""() => { const out = []; const p = window.__T.G.s.players[0];
          for (let i = 0; i < 40; i++) out.push(Learn.pick(p, Learn.blank(), null, Math.random, { level: 4 }).level); return out; }""")
        check(set(lv4) == {4}, f"탈출 퀴즈 문제는 LV.4 만 ({sorted(set(lv4))})")
        pg.close()

        # ---------- 4. 이어하기 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=21")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        play(pg, "resume", max_steps=14, shots=False)
        pg.wait_for_selector("#rollBtn.ready")
        st = pg.evaluate("""() => { const w = document.querySelector('#wheelStage'); const s = window.__T.G.s;
          return [w.classList.contains('hidden'), w.classList.contains('rocket'), document.querySelectorAll('#wheelDisc .wedge').length,
            document.querySelector('#wheelBadge').textContent.includes(s.players[s.turn].name), s.round, document.querySelector('#spinResult b').textContent]; }""")
        check(not st[0] and not st[1] and st[2] == 12 and st[3] and st[4] > 1 and st[5] == "?", f"로켓단 차례 뒤 내 차례: 판 가운데 12칸 돌림판 + 왼쪽 위에 내 이름 + 결과 '?' ({st})")
        words = pg.eval_on_selector_all("#wheelDisc .wword", "els => els.map(e => e.textContent)")
        check(words == ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"], "돌림판 글자 = One~Twelve")
        before = pg.evaluate("() => { const s = window.__T.G.s; return [s.turn, s.round, s.players.map(p => p.pos), s.rocket.pos]; }")
        pg.goto(base + "/index.html?test&seed=21")
        check(pg.locator("text=이어하기").count() == 1, "새로고침 뒤 처음 화면에 '이어하기'")
        pg.click("text=이어하기")
        pg.wait_for_selector("#rollBtn.ready")
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
            vis = pg.evaluate("() => { const r = document.querySelector('#rollBtn').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0 && r.width >= 44; }")
            check(vis, f"{nm}: 돌림판 가운데 버튼이 화면 안")
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

        # ---------- 8. 카드 잔뜩: 매 차례 능력 카드를 쥐여 주고 쓰게 한다 (길막기 에러 같은 화면 연결 실수 잡기) ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=31")
        pg.click("text=새 모험")
        pg.click("text=한 명 더")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#board .cell")
        pg.evaluate("""() => {
          const T = window.__T, ids = Rules.ALL_IDS; let k = 0; window.__used = {};
          T.auto = (kind, d) => {
            const s = T.G.s;
            if (kind === 'action') {
              s.players.forEach(p => { while (p.ability.length < 2) p.ability.push(Rules.ABILITY_IDS[(k++) % 10]); if (!p.held) p.held = ['E01','E07','R08'][k % 3]; });
              const u = d.cards.filter(c => c.ok); if (u.length) { const c = u[k % u.length].id; window.__used[c] = 1; return c; } return 'roll';
            }
            if (kind === 'target') return d.options[k % d.options.length];
            if (kind === 'direction') return k % 2 ? 1 : -1;
            if (kind === 'cell') return d.to;
            if (kind === 'pick') return k % 2;
            if (kind === 'discard') return d.add;
            if (kind === 'reward') return k % 2 ? 'card' : 'move';
            if (kind === 'reroll') return true;
            if (kind === 'lucky') return 3;
            if (kind === 'defend') return d.options[0];
            return null;
          };
          T.autoQuiz = async () => ['first', 'hint', 'explained', 'fail'][(k++) % 4];
        }""")
        n0 = len(errors)
        pg.click("#rollBtn")  # 자동 조작을 켜기 전에 이미 기다리던 첫 차례
        pg.wait_for_selector(".screen-result", timeout=240000)
        used = pg.evaluate("() => Object.keys(window.__used).sort()")
        check(len(errors) == n0, f"카드를 계속 쓰는 판: 화면 오류 없이 끝까지 ({errors[n0:n0 + 2]})")
        check({"P01", "P02", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "E07"} <= set(used), f"능동 카드 10종 + 행운의 숫자 모두 써 봄 ({used})")
        pg.close()

        # ---------- 9. 혼자하기 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=41")
        pg.click("text=새 모험")
        pg.click("text=혼자 하기")
        check(pg.locator(".pl").count() == 1 and pg.locator("text=한 명 더").count() == 0, "혼자 하기 → 한 명만")
        pg.screenshot(path=str(OUT / "10-solo-setup.png"))
        pg.click("text=모험 출발")
        seen = play(pg, "solo", shots=False)
        check(pg.locator(".screen-result").count() == 1 and "골인" in pg.inner_text(".champ h1"), f"혼자하기 끝까지 → 골인 화면 ({seen['sec']}초, 주사위 {seen['roll']}번)")
        pg.screenshot(path=str(OUT / "11-solo-result.png"))
        pg.click("text=처음으로")
        pg.click("text=새 모험")
        pg.click("text=같이 하기")
        check(pg.locator(".pl").count() >= 2, "같이 하기로 돌아오면 2명 이상")
        pg.close()

        # ---------- 10. 혼자하기 + 컴퓨터 친구 (관장) ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=51")
        pg.click("text=새 모험")
        pg.click("text=혼자 하기")
        cpu_btns = pg.locator("[data-a=cpu]")
        check(cpu_btns.count() == 4, f"컴퓨터 친구 후보 = 내 캐릭터 빼고 4명 ({cpu_btns.count()})")
        for k in range(3):
            pg.locator("[data-a=cpu]").nth(k).click()
        check(pg.locator("[data-a=cpu].on").count() == 3 and pg.locator("[data-a=cpu][disabled]").count() == 1, "컴퓨터 친구는 3명까지")
        pg.locator("[data-a=cpu].on").nth(2).click()
        pg.screenshot(path=str(OUT / "12-cpu-setup.png"))
        pg.click("text=모험 출발")
        pg.wait_for_selector("#board .cell")
        info = pg.evaluate("() => window.__T.G.s.players.map(p => [p.name, !!p.cpu])")
        check(len(info) == 3 and [c for _, c in info] == [False, True, True], f"나 + 컴퓨터 2명 ({info})")
        n0 = len(errors)
        seen = play(pg, "cpu", shots=False)
        check(pg.locator(".screen-result").count() == 1, f"컴퓨터 친구와 한 판 끝까지 ({seen['sec']}초, 내 돌림판 {seen['roll']}번)")
        check(len(errors) == n0, "컴퓨터 친구 판 오류 없음")
        pg.screenshot(path=str(OUT / "13-cpu-result.png"))
        st = pg.evaluate("() => window.__T.Store.data")
        cpu_learn = [n for n in st["learn"] if n in ("웅", "이슬", "블루", "레드")]
        check(not cpu_learn, f"컴퓨터 퀴즈는 학습 기록에 안 들어감 ({cpu_learn})")
        pg.close()

        # 같이 → 혼자 → 같이 로 판을 바꿔도 돌림판이 그려진다 (투명 돌림판 버그)
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=71")
        wedges = []
        for mode in ("같이 하기", "혼자 하기", "같이 하기"):
            if pg.locator("[data-p=home]").count():
                pg.click("[data-p=home]")
            pg.click("text=새 모험")
            pg.click("text=" + mode)
            pg.click("text=모험 출발")
            pg.wait_for_selector("#rollBtn.ready")
            wedges.append(pg.evaluate("() => document.querySelectorAll('#wheelDisc .wedge').length"))
        check(wedges == [12, 12, 12], f"같이→혼자→같이 로 바꿔도 돌림판 12칸이 그려짐 ({wedges})")
        pg.close()

        # ---------- 11. 로켓단이 먼저 도착 → 승자 없음 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=61")
        pg.click("text=새 모험")
        pg.click("text=혼자 하기")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#rollBtn.ready")
        pg.evaluate("() => { const s = window.__T.G.s; s.players[0].pos = 10; s.rocket.pos = 96; s.force = [2, 4]; }")
        pg.click("#rollBtn")
        pg.wait_for_selector(".screen-result", timeout=60000)
        txt = pg.inner_text(".champ")
        check("로켓단이 먼저 도착" in txt and "승자가 없어요" in txt, "로켓단 도착 → 결과 화면에 승자 없음")
        st = pg.evaluate("() => window.__T.Store.data.history[0].winner")
        check("로켓단" in st, f"판 기록에도 로켓단 ({st})")
        pg.screenshot(path=str(OUT / "14-rocket-win.png"))
        pg.close()

        # ---------- 12. 판 끝 복습 · 다 풀면 바로 · 도장 (시험: 60초) · 영어 차례 안내 ----------
        pg = page(1180, 820)
        pg.goto(base + "/index.html?test&seed=81&review=60000")
        pg.click("text=새 모험")
        pg.click("text=모험 출발")
        pg.wait_for_selector("#rollBtn.ready")
        check("Jion's turn!" in pg.inner_text("#turnBanner") or "Jion's turn!" in pg.inner_text("#msgText"), "차례 안내 영어: Jion's turn!")
        check(pg.evaluate("() => window.__T.enName('엄마')") == "Mom" and pg.evaluate("() => window.__T.enName('다온')") == "Daon", "영어 이름: 엄마 → Mom, 직접 쓴 이름 다온 → Daon")
        seen = play(pg, "review", shots=False, wrong_every=2)
        pg.wait_for_selector(".layer.review", timeout=10000)
        n_items = pg.evaluate("() => window.__T.Store.data.review.items.length")
        check(n_items > 0 and pg.locator(".rv-card").count() == n_items, f"복습 창: 이번 판 문제 {n_items}개 = 카드 수")
        check(pg.locator("#rvDone").is_disabled(), "다 풀기 전·2분 전에는 '다음 게임' 잠김")
        pg.screenshot(path=str(OUT / "15-review.png"))
        n_wrong = pg.locator("[data-retry]").count()
        for k in range(n_wrong):
            pg.locator("[data-retry]").first.click()
            pg.wait_for_selector(".practice #qzBody [data-k]")
            pg.evaluate(ANSWER_JS, False)
            pg.wait_for_function(f"() => document.querySelectorAll('.rv-card.fixed').length >= {k + 1}", timeout=8000)
        stamps = pg.evaluate("() => window.__T.Store.data.stamps")
        check(sum(stamps.values()) == n_wrong, f"다시 맞힌 만큼 도장 ({stamps}, {n_wrong}문제)")
        check(not pg.locator("#rvDone").is_disabled(), "다시 볼 문제를 모두 다시 맞히면 2분 전이라도 '다음 게임' 열림")
        pg.screenshot(path=str(OUT / "16-review-done.png"))
        pg.click("#rvDone")
        check(pg.locator(".layer.review").count() == 0, "'다음 게임' 누르면 닫힘")
        # 도장 3개 이상인 사람은 다음 판을 능력 카드 들고 출발
        before = pg.evaluate("() => Object.assign({}, window.__T.Store.data.stamps)")
        pg.click("text=한 판 더")
        pg.wait_for_selector("#board .cell")
        after = pg.evaluate("() => [window.__T.Store.data.stamps, window.__T.G.s.players.map(p => [p.name, p.ability.length])]")
        for name, cards in after[1]:
            if before.get(name, 0) >= 3:
                check(cards == 1 and after[0][name] == before[name] - 3, f"{name}: 도장 3개 → 능력 카드 1장 들고 출발 (도장 {before[name]} → {after[0][name]})")
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
