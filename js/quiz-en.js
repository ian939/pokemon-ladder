/* 영어 문제 은행 — plan.md §9.3 영어 25유형 (LV.1~4)
 *
 * 사람이 고른 단어·문장으로 만든 "유한 문항 은행" (plan §12.3). 문항 하나 = 아래 BANK 의 한 줄.
 * EnQ.all() → 모든 문항 (문제 모양은 quiz-math.js 와 같다)
 *   + say    : 들려줄 영어 (Edge TTS 미리 녹음 — tools/gen-voice.py 가 여기서 읽는다)
 *   + choiceType : "text" | "emoji" | "swatch"
 * 정답이 하나뿐인지는 tools/test-quiz.js 가 검사한다.
 */
(function (root) {
  "use strict";

  // 단어: [그림, 뜻]
  const V = {
    cat: ["🐱", "고양이"], dog: ["🐶", "강아지"], fish: ["🐟", "물고기"], bird: ["🐦", "새"], cow: ["🐮", "소"],
    pig: ["🐷", "돼지"], duck: ["🦆", "오리"], frog: ["🐸", "개구리"], bear: ["🐻", "곰"], lion: ["🦁", "사자"],
    rabbit: ["🐰", "토끼"], horse: ["🐴", "말"], monkey: ["🐵", "원숭이"], tiger: ["🐯", "호랑이"], elephant: ["🐘", "코끼리"],
    apple: ["🍎", "사과"], banana: ["🍌", "바나나"], milk: ["🥛", "우유"], egg: ["🥚", "달걀"], bread: ["🍞", "빵"],
    cake: ["🍰", "케이크"], water: ["💧", "물"], grapes: ["🍇", "포도"], orange: ["🍊", "오렌지"], pizza: ["🍕", "피자"],
    ball: ["⚽", "공"], book: ["📕", "책"], car: ["🚗", "자동차"], bus: ["🚌", "버스"], hat: ["👒", "모자"],
    cup: ["🥤", "컵"], bag: ["🎒", "가방"], bed: ["🛏️", "침대"], box: ["📦", "상자"], key: ["🔑", "열쇠"],
    sun: ["☀️", "해"], moon: ["🌙", "달"], star: ["⭐", "별"], tree: ["🌳", "나무"], flower: ["🌸", "꽃"],
    house: ["🏠", "집"], pen: ["🖊️", "펜"], bike: ["🚲", "자전거"], ship: ["🚢", "배"], fox: ["🦊", "여우"],
  };
  const pic = (w) => V[w][0];
  const ko = (w) => V[w][1];

  const COLORS = { red: ["#e5484d", "빨간색"], blue: ["#2f6fd6", "파란색"], yellow: ["#f5c400", "노란색"], green: ["#2fa84f", "초록색"],
    pink: ["#f29ac2", "분홍색"], black: ["#222222", "검은색"], white: ["#ffffff", "흰색"], orange: ["#f08a24", "주황색"], purple: ["#8a4fd6", "보라색"], brown: ["#8a5a2b", "갈색"] };

  // 각 줄: [개념, 레벨, 자료...]
  const BANK = [];
  const add = (c, lv, d) => BANK.push(Object.assign({ c, lv }, d));

  // E01 알파벳 소리 — 세 단어를 듣고 첫 소리 글자
  [["B", ["ball", "bear", "bus"], ["D", "P", "V"]], ["C", ["cat", "car", "cake"], ["M", "G", "R"]], ["D", ["dog", "duck", "dog"], ["B", "T", "G"]],
   ["F", ["fish", "frog", "flower"], ["V", "P", "H"]], ["H", ["hat", "house", "horse"], ["A", "F", "K"]], ["M", ["milk", "moon", "monkey"], ["N", "W", "B"]],
   ["P", ["pig", "pizza", "pen"], ["B", "F", "T"]], ["S", ["sun", "star", "ship"], ["R", "Z", "T"]], ["T", ["tree", "tiger", "tiger"], ["D", "P", "C"]],
   ["B", ["bread", "bike", "bed"], ["P", "D", "V"]], ["E", ["egg", "elephant", "egg"], ["A", "I", "O"]], ["A", ["apple", "apple", "apple"], ["E", "O", "U"]]]
    .forEach(([L, ws, wrong]) => {
      const uniq = [...new Set(ws)];
      add("E01", 1, { kind: "choice", listen: true, say: uniq.join(". ") + ".", prompt: "잘 듣고, 어떤 글자로 시작하는지 골라요!",
        answer: L, choices: [L, ...wrong], hint: `첫 소리만 따라 해 봐요: ${uniq[0][0]}…`,
        explain: [`${uniq.map((w) => `${pic(w)} ${w}`).join(", ")}`, `모두 '${L}' 소리로 시작해요`] });
    });

  // E02 듣고 단어 고르기
  [["water", ["winter", "waiter", "watch"]], ["apple", ["ample", "able", "maple"]], ["book", ["look", "cook", "boot"]], ["cake", ["make", "lake", "cape"]],
   ["star", ["stair", "start", "car"]], ["bike", ["like", "bake", "hike"]], ["moon", ["noon", "mood", "spoon"]], ["fish", ["dish", "wish", "fist"]],
   ["tree", ["three", "free", "true"]], ["ship", ["sheep", "shop", "chip"]], ["house", ["mouse", "horse", "hose"]], ["milk", ["silk", "mill", "mile"]]]
    .forEach(([w, wrong]) => add("E02", 2, { kind: "choice", listen: true, say: w, prompt: "잘 듣고, 들린 단어를 골라요!", answer: w, choices: [w, ...wrong],
      hint: `첫 소리와 끝소리를 잘 들어 봐요.`, explain: [`${pic(w)} ${w} = ${ko(w)}`, `${w.split("").join("-")}`] }));

  // E03 그림 보고 단어
  [["cat", ["cup", "car", "hat"]], ["dog", ["duck", "doll", "frog"]], ["fish", ["dish", "fox", "ship"]], ["bird", ["bear", "bed", "bread"]],
   ["lion", ["tiger", "line", "lemon"]], ["rabbit", ["robot", "bus", "ribbon"]], ["banana", ["bread", "ball", "orange"]], ["egg", ["bag", "leg", "milk"]],
   ["sun", ["moon", "son", "star"]], ["tree", ["three", "flower", "house"]], ["key", ["kite", "bike", "cake"]], ["elephant", ["egg", "monkey", "pig"]]]
    .forEach(([w, wrong]) => add("E03", w.length <= 3 ? 1 : 2, { kind: "choice", picture: pic(w), say: w, sayAfter: true, prompt: "그림에 맞는 영어 단어는?",
      answer: w, choices: [w, ...wrong], hint: `'${ko(w)}'은(는) ${w[0].toUpperCase()} 소리로 시작해요.`, explain: [`${pic(w)} = ${w} (${ko(w)})`] }));

  // E04 듣고 그림 고르기
  [["dog", ["cat", "pig", "cow"]], ["cat", ["dog", "rabbit", "fox"]], ["apple", ["banana", "grapes", "orange"]], ["car", ["bus", "bike", "ship"]],
   ["duck", ["bird", "frog", "fish"]], ["moon", ["sun", "star", "tree"]], ["bear", ["lion", "monkey", "pig"]], ["ball", ["box", "bag", "book"]],
   ["milk", ["water", "egg", "bread"]], ["horse", ["cow", "house", "tiger"]], ["frog", ["fish", "fox", "duck"]], ["hat", ["bag", "cup", "bed"]]]
    .forEach(([w, wrong]) => add("E04", 1, { kind: "choice", listen: true, say: w, choiceType: "emoji", prompt: "잘 듣고, 맞는 그림을 골라요!",
      answer: pic(w), choices: [w, ...wrong].map(pic), hint: `'${w}'… 다시 들어 봐요. 동물인지 물건인지 생각해 봐요.`, explain: [`${w} = ${ko(w)} ${pic(w)}`] }));

  // E05 빠진 철자 (글자판 입력)
  [["cat", 1], ["dog", 1], ["pig", 1], ["sun", 1], ["bus", 1], ["hat", 1], ["bed", 1], ["cup", 1], ["fox", 1], ["pen", 1], ["box", 1], ["egg", 0]]
    .forEach(([w, k]) => add("E05", 2, { kind: "input", keypad: "letters", picture: pic(w), say: w, prompt: "빠진 글자를 넣어요!",
      expr: w.split("").map((ch, i) => (i === k ? "_" : ch.toUpperCase())).join(" "), answer: w[k].toUpperCase(),
      hint: `천천히 소리 내 봐요: ${w.split("").map((ch, i) => (i === k ? "?" : ch)).join("-")}`,
      explain: [`${pic(w)} ${w.toUpperCase()}`, `${w.split("").map((ch) => ch.toUpperCase()).join(" - ")}`, `빠진 글자는 ${w[k].toUpperCase()}`] }));

  // E06 철자 순서 (터치 배열)
  ["dog", "cat", "sun", "pig", "bus", "fish", "milk", "frog", "duck", "cake", "star", "book"]
    .forEach((w) => add("E06", 2, { kind: "order", picture: pic(w), say: w, prompt: "글자를 순서대로 눌러 단어를 만들어요!",
      tokens: w.toUpperCase().split(""), answer: w.toUpperCase().split(""),
      hint: `첫 글자는 ${w[0].toUpperCase()} 예요.`, explain: [`${pic(w)} ${w.toUpperCase().split("").join(" - ")}`] }));

  // E07 단어 뜻
  const MEAN = { happy: "기쁜", sad: "슬픈", big: "큰", small: "작은", hot: "뜨거운", cold: "차가운", fast: "빠른", slow: "느린",
    hungry: "배고픈", sleepy: "졸린", angry: "화난", kind: "친절한" };
  const MEAN_EMO = { happy: "😄", sad: "😢", big: "🐘", small: "🐜", hot: "🔥", cold: "🧊", fast: "🚀", slow: "🐢", hungry: "🤤", sleepy: "😴", angry: "😠", kind: "🤝" };
  Object.keys(MEAN).forEach((w, i, all) => {
    const wrong = all.filter((x) => x !== w && MEAN[x] !== MEAN[w]).slice(i % 6, (i % 6) + 3).map((x) => MEAN[x]);
    add("E07", 2, { kind: "choice", say: w, sayAfter: true, prompt: `'${w}' 의 뜻은?`, answer: MEAN[w], choices: [MEAN[w], ...wrong],
      hint: `이 그림을 떠올려 봐요: ${MEAN_EMO[w]}`, explain: [`${w} ${MEAN_EMO[w]} = ${MEAN[w]}`] });
  });

  // E08 색 (색 칸 고르기)
  Object.keys(COLORS).forEach((c, i, all) => {
    const wrong = all.filter((x) => x !== c).slice(i % 7, (i % 7) + 3);
    add("E08", i < 5 ? 1 : 2, { kind: "choice", listen: true, say: c, choiceType: "swatch", prompt: "잘 듣고, 맞는 색을 골라요!",
      answer: c, choices: [c, ...wrong], hint: "한 번 더 들어 봐요. 무지개 색을 떠올려 봐요.", explain: [`${c} = ${COLORS[c][1]}`] });
  });

  // E09 영어 숫자 → 숫자 입력
  [["three", 3], ["five", 5], ["seven", 7], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13],
   ["fifteen", 15], ["twenty", 20], ["eight", 8], ["fourteen", 14]]
    .forEach(([w, n]) => add("E09", n <= 10 ? 1 : 2, { kind: "input", keypad: "digits", say: w, sayAfter: true, prompt: `'${w}' 는 숫자로 몇일까요?`,
      answer: String(n), hint: n > 12 ? `'-teen' 은 10 보다 큰 수예요.` : `손가락으로 세어 봐요.`, explain: [`${w} = ${n}`] }));

  // E10 하나·여럿
  [["cat", 3], ["dog", 1], ["apple", 2], ["star", 4], ["ball", 1], ["duck", 3], ["car", 2], ["fish", 1], ["egg", 4], ["book", 1], ["pig", 2], ["bird", 1]]
    .forEach(([w, n]) => {
      const pl = w + "s";
      add("E10", 2, { kind: "choice", picture: pic(w).repeat(n), prompt: "그림에 맞는 말은?", answer: n > 1 ? pl : w, choices: [w, pl],
        sayAnswer: true, hint: "하나면 그대로, 두 개 이상이면 끝에 s!", explain: [`${pic(w)} 하나 = ${w}`, `${pic(w)}${pic(w)} 여럿 = ${pl}`] });
    });

  // E11 반대말
  [["big", "small"], ["hot", "cold"], ["fast", "slow"], ["happy", "sad"], ["tall", "short"], ["up", "down"], ["open", "close"], ["day", "night"],
   ["old", "new"], ["in", "out"], ["long", "short"], ["full", "empty"]]
    .forEach(([a, b], i, all) => {
      const pool = ["happy", "big", "hot", "up", "day", "new", "open", "fast", "full", "in", "cold", "night"].filter((x) => x !== a && x !== b);
      const wrong = pool.slice(i % 6, (i % 6) + 3);
      add("E11", 2, { kind: "choice", say: a, sayAfter: true, prompt: `'${a}' 의 반대말은?`, answer: b, choices: [b, ...wrong], sayAnswer: true,
        hint: "뜻을 먼저 떠올리고, 정반대를 찾아봐요.", explain: [`${a} ↔ ${b}`] });
    });

  // E12 동작 단어
  const ACT = { run: "🏃", swim: "🏊", sleep: "😴", eat: "😋", read: "📖", sing: "🎤", dance: "💃", cry: "😭", jump: "🦘", fly: "🕊️", climb: "🧗", draw: "🖍️" };
  Object.keys(ACT).forEach((w, i, all) => {
    const wrong = all.filter((x) => x !== w).slice(i % 8, (i % 8) + 3);
    add("E12", 2, { kind: "choice", picture: ACT[w], prompt: "그림이 하는 동작은?", answer: w, choices: [w, ...wrong], sayAnswer: true,
      hint: "그림처럼 몸을 움직여 봐요!", explain: [`${ACT[w]} = ${w}`] });
  });

  // E13 대명사
  [["👦", "he", "남자아이 한 명"], ["👧", "she", "여자아이 한 명"], ["🐶", "it", "동물·물건 하나"], ["👫", "they", "여럿"], ["👨", "he", "남자 한 명"],
   ["👩", "she", "여자 한 명"], ["⚽", "it", "물건 하나"], ["🐱🐱", "they", "여럿"], ["👴", "he", "할아버지 한 명"], ["👵", "she", "할머니 한 명"],
   ["🚗", "it", "물건 하나"], ["👦👧", "they", "여럿"]]
    .forEach(([p, a, why]) => add("E13", 3, { kind: "choice", picture: p, prompt: "그림을 가리키는 말은?", answer: a, choices: ["he", "she", "it", "they"],
      sayAnswer: true, hint: "남자? 여자? 동물·물건? 여럿?", explain: [`${p} : ${why} → ${a}`, "he 남자 · she 여자 · it 동물·물건 · they 여럿"] }));

  // E14 a / an
  [["apple", "an"], ["egg", "an"], ["elephant", "an"], ["orange", "an"], ["cat", "a"], ["dog", "a"], ["ball", "a"], ["banana", "a"], ["owl", "an"],
   ["bike", "a"], ["umbrella", "an"], ["car", "a"]]
    .forEach(([w, a]) => add("E14", 3, { kind: "choice", picture: V[w] ? pic(w) : w === "owl" ? "🦉" : "☂️", prompt: `빈칸에 알맞은 말은?`,
      expr: `___ ${w}`, say: `${a} ${w}`, sayAfter: true, answer: a, choices: ["a", "an"],
      hint: "a, e, i, o, u 소리로 시작하면 an!", explain: [`${w} 는 '${w[0]}' 소리로 시작 → ${a} ${w}`] }));

  // E15 복수형 만들기
  [["cat", "cats"], ["dog", "dogs"], ["box", "boxes"], ["bus", "buses"], ["fox", "foxes"], ["cup", "cups"], ["dish", "dishes"], ["book", "books"],
   ["baby", "babies"], ["star", "stars"], ["watch", "watches"], ["pen", "pens"]]
    .forEach(([w, pl]) => {
      const wrong = [w + "s", w + "es", w.replace(/y$/, "ies"), w + "z"].filter((x) => x !== pl);
      add("E15", /(x|s|sh|ch|y)$/.test(w) ? 4 : 3, { kind: "choice", picture: V[w] ? pic(w).repeat(2) : "", prompt: `'${w}' 가 여러 개면?`,
        answer: pl, choices: [pl, ...[...new Set(wrong)].slice(0, 3)], sayAnswer: true,
        hint: /(x|s|sh|ch)$/.test(w) ? "s, x, sh, ch 로 끝나면 es 를 붙여요." : /y$/.test(w) ? "y 로 끝나면 y 를 i 로 바꾸고 es!" : "보통은 끝에 s 만 붙여요.",
        explain: [`${w} → ${pl}`] });
    });

  // E16 is / are / am
  [["They", "are", "happy"], ["The cat", "is", "small"], ["I", "am", "hungry"], ["We", "are", "friends"], ["She", "is", "tall"], ["The dogs", "are", "big"],
   ["He", "is", "sleepy"], ["You", "are", "kind"], ["It", "is", "hot"], ["The apples", "are", "red"], ["My mom", "is", "home"], ["Tom and Ann", "are", "here"]]
    .forEach(([s, v, c]) => add("E16", 3, { kind: "choice", prompt: "빈칸에 알맞은 말은?", expr: `${s} ___ ${c}.`, say: `${s} ${v} ${c}.`, sayAfter: true,
      answer: v, choices: ["is", "are", "am"], hint: "I 는 am, 하나는 is, 여럿·you 는 are!",
      explain: [`${s} → ${v}`, `${s} ${v} ${c}.`] }));

  // E17 진행형
  [["The dog is", "running", "run", "runs", "🐶🏃"], ["The bird is", "flying", "fly", "flies", "🐦🕊️"], ["The baby is", "sleeping", "sleep", "sleeps", "👶😴"],
   ["The fish is", "swimming", "swim", "swims", "🐟🌊"], ["She is", "singing", "sing", "sings", "👧🎤"], ["He is", "eating", "eat", "eats", "👦😋"],
   ["The cat is", "jumping", "jump", "jumps", "🐱⬆️"], ["I am", "reading", "read", "reads", "📖"], ["They are", "dancing", "dance", "dances", "👫💃"],
   ["Mom is", "cooking", "cook", "cooks", "👩🍳"], ["The boy is", "crying", "cry", "cries", "👦😭"], ["We are", "playing", "play", "plays", "⚽👫"]]
    .forEach(([s, ing, base, third, p]) => add("E17", 3, { kind: "choice", picture: p, prompt: "빈칸에 알맞은 말은?", expr: `${s} ___.`, say: `${s} ${ing}.`, sayAfter: true,
      answer: ing, choices: [ing, base, third], hint: "is / are / am 뒤에서 '~하고 있다'는 -ing!", explain: [`${s} ${ing}. = 지금 하고 있어요`] }));

  // E18 문장 터치 배열
  [["I", "like", "apples."], ["I", "have", "a", "dog."], ["She", "is", "happy."], ["The", "cat", "is", "small."], ["I", "can", "swim."],
   ["He", "likes", "milk."], ["We", "are", "friends."], ["I", "see", "a", "bird."], ["It", "is", "red."], ["They", "can", "run."],
   ["I", "love", "my", "mom."], ["The", "sun", "is", "hot."]]
    .forEach((ws) => add("E18", 3, { kind: "order", say: ws.join(" "), sayAfter: true, prompt: "단어를 순서대로 눌러 문장을 만들어요!", tokens: ws.slice(), answer: ws.slice(),
      hint: `누가(${ws[0]}) → 무엇을 한다 순서예요.`, explain: [ws.join(" "), "누가 → 한다/이다 → 무엇"] }));

  // E19 문장 듣고 그림
  [["The cat is sleeping.", "🐱😴", ["🐱🏃", "🐶😴", "🐱😋"]], ["The dog is running.", "🐶🏃", ["🐶😴", "🐱🏃", "🐶🏊"]],
   ["The bird is flying.", "🐦🕊️", ["🐦😴", "🐟🌊", "🐦😋"]], ["The fish is swimming.", "🐟🌊", ["🐟😴", "🐦🕊️", "🐸🌊"]],
   ["The baby is crying.", "👶😭", ["👶😄", "👶😴", "👦😭"]], ["The boy is eating.", "👦😋", ["👦😴", "👧😋", "👦🏃"]],
   ["The girl is singing.", "👧🎤", ["👦🎤", "👧📖", "👧😴"]], ["The frog is jumping.", "🐸⬆️", ["🐸😴", "🐰⬆️", "🐸🌊"]],
   ["Two cats are playing.", "🐱🐱⚽", ["🐱⚽", "🐶🐶⚽", "🐱🐱😴"]], ["The sun is hot.", "☀️🔥", ["🌙🧊", "☀️🧊", "⭐🔥"]],
   ["The bear is eating.", "🐻😋", ["🐻😴", "🐶😋", "🐻🏃"]], ["The man is reading.", "👨📖", ["👨😴", "👩📖", "👨🏃"]]]
    .forEach(([s, a, wrong]) => add("E19", 3, { kind: "choice", listen: true, say: s, choiceType: "emoji", prompt: "문장을 잘 듣고, 맞는 그림을 골라요!",
      answer: a, choices: [a, ...wrong], hint: "누가? 무엇을 하고 있나요? 두 가지를 다 들어 봐요.", explain: [`${s}`, `→ ${a}`] }));

  // E20 위치 표현 (그림은 화면에서 그린다)
  [["in", "box"], ["on", "box"], ["under", "box"], ["next to", "box"], ["in", "bag"], ["on", "bed"], ["under", "bed"], ["next to", "tree"],
   ["on", "table"], ["under", "table"], ["in", "cup"], ["behind", "box"]]
    .forEach(([prep, thing], i) => {
      const obj = ["ball", "cat", "apple", "duck"][i % 4];
      add("E20", 3, { kind: "choice", visual: { type: "place", prep, obj: V[obj][0], thing: thing === "table" ? "🪑" : V[thing] ? pic(thing) : "📦" },
        prompt: "빈칸에 알맞은 말은?", expr: `The ${obj} is ___ the ${thing}.`, say: `The ${obj} is ${prep} the ${thing}.`, sayAfter: true,
        answer: prep, choices: [prep, ...["in", "on", "under", "next to", "behind"].filter((x) => x !== prep).slice(i % 2, (i % 2) + 3)],
        hint: "in 안 · on 위 · under 아래 · next to 옆 · behind 뒤", explain: [`The ${obj} is ${prep} the ${thing}.`, { in: "안에", on: "위에", under: "아래에", "next to": "옆에", behind: "뒤에" }[prep]] });
    });

  // E21 질문·대답
  [["What color is it?", "🍎", "It is red.", ["It is blue.", "It is a cat.", "I am six."]], ["What color is it?", "🍌", "It is yellow.", ["It is green.", "It is a dog.", "Yes, it is."]],
   ["What is it?", "🐶", "It is a dog.", ["It is a cat.", "It is red.", "I am fine."]], ["What is it?", "⚽", "It is a ball.", ["It is a book.", "It is blue.", "No, thanks."]],
   ["How many apples?", "🍎🍎🍎", "Three apples.", ["Two apples.", "Five apples.", "It is red."]], ["How many cats?", "🐱🐱", "Two cats.", ["One cat.", "Three cats.", "It is a dog."]],
   ["Is it a cat?", "🐱", "Yes, it is.", ["No, it isn't.", "It is red.", "I am a cat."]], ["Is it a dog?", "🐱", "No, it isn't.", ["Yes, it is.", "It is blue.", "Two dogs."]],
   ["What color is it?", "🌳", "It is green.", ["It is pink.", "It is a tree.", "I like it."]], ["What is it?", "🚗", "It is a car.", ["It is a bus.", "It is red.", "Yes, it is."]],
   ["How old are you?", "🎂", "I am eight.", ["I am fine.", "It is a cake.", "Thank you."]], ["What is your name?", "👦", "My name is Jion.", ["I am eight.", "It is a boy.", "Yes, I do."]]]
    .forEach(([q, p, a, wrong]) => add("E21", q.startsWith("How old") || q.startsWith("What is your") ? 4 : 3, { kind: "choice", listen: true, picture: p, say: q,
      prompt: "질문을 듣고, 알맞은 대답을 골라요!", expr: q, answer: a, choices: [a, ...wrong], sayAnswer: true,
      hint: q.startsWith("What color") ? "색을 물어봐요." : q.startsWith("How many") ? "개수를 물어봐요." : q.startsWith("Is it") ? "Yes 또는 No 로 대답해요." : "무엇인지 물어봐요.",
      explain: [`${q} → ${a}`] }));

  // E22 문장 의미 → 그림
  [["I have three apples.", "🍎🍎🍎", ["🍎🍎", "🍌🍌🍌", "🍎"]], ["I have two dogs.", "🐶🐶", ["🐶", "🐱🐱", "🐶🐶🐶"]],
   ["I see a big elephant.", "🐘", ["🐜", "🐭", "🐘🐘"]], ["She has a red hat.", "👧❤️👒", ["👦❤️👒", "👧💙👒", "👧❤️🎒"]],
   ["There are four stars.", "⭐⭐⭐⭐", ["⭐⭐⭐", "🌙🌙🌙🌙", "⭐⭐"]], ["I like bananas.", "😋🍌", ["😖🍌", "😋🍎", "😋🍇"]],
   ["I have two balls.", "⚽⚽", ["⚽", "⚽⚽⚽", "🏀🏀"]], ["I have one cat and one dog.", "🐱🐶", ["🐱🐱", "🐶🐶", "🐱🐶🐶"]],
   ["It is raining.", "🌧️", ["☀️", "❄️", "🌈"]], ["It is snowing.", "❄️", ["🌧️", "☀️", "🌪️"]],
   ["The boy is tall.", "👦🦒", ["👦🐜", "👧🦒", "👴🦒"]], ["I have five fish.", "🐟🐟🐟🐟🐟", ["🐟🐟🐟🐟", "🐦🐦🐦🐦🐦", "🐟🐟🐟"]]]
    .forEach(([s, a, wrong]) => add("E22", 4, { kind: "choice", say: s, sayAfter: true, choiceType: "emoji", prompt: "문장에 맞는 그림을 골라요!", expr: s,
      answer: a, choices: [a, ...wrong], hint: "숫자·색·크기 같은 단어를 찾아봐요.", explain: [s, `→ ${a}`] }));

  // E23 부정 표현 → 뜻
  [["I do not like milk.", "나는 우유를 좋아하지 않아요.", ["나는 우유를 좋아해요.", "나는 물을 좋아하지 않아요.", "우유가 없어요."]],
   ["I do not have a cat.", "나는 고양이가 없어요.", ["나는 고양이가 있어요.", "나는 강아지가 없어요.", "고양이가 좋아요."]],
   ["It is not big.", "그것은 크지 않아요.", ["그것은 커요.", "그것은 빨갛지 않아요.", "그것은 작지 않아요."]],
   ["She is not sad.", "그녀는 슬프지 않아요.", ["그녀는 슬퍼요.", "그는 슬프지 않아요.", "그녀는 기쁘지 않아요."]],
   ["I can not swim.", "나는 수영을 못 해요.", ["나는 수영을 할 수 있어요.", "나는 달리기를 못 해요.", "수영장이 없어요."]],
   ["We do not run here.", "우리는 여기서 뛰지 않아요.", ["우리는 여기서 뛰어요.", "우리는 여기서 걷지 않아요.", "여기는 우리 집이에요."]],
   ["He is not hungry.", "그는 배고프지 않아요.", ["그는 배고파요.", "그녀는 배고프지 않아요.", "그는 졸리지 않아요."]],
   ["I do not like rain.", "나는 비를 좋아하지 않아요.", ["나는 비를 좋아해요.", "나는 눈을 좋아하지 않아요.", "비가 와요."]],
   ["This is not my bag.", "이건 내 가방이 아니에요.", ["이건 내 가방이에요.", "이건 내 모자가 아니에요.", "가방이 커요."]],
   ["The dog is not small.", "그 강아지는 작지 않아요.", ["그 강아지는 작아요.", "그 고양이는 작지 않아요.", "강아지가 없어요."]],
   ["I do not want cake.", "나는 케이크를 원하지 않아요.", ["나는 케이크를 원해요.", "나는 빵을 원하지 않아요.", "케이크가 맛있어요."]],
   ["They are not here.", "그들은 여기 없어요.", ["그들은 여기 있어요.", "우리는 여기 없어요.", "그들은 행복해요."]]]
    .forEach(([s, a, wrong]) => add("E23", 4, { kind: "choice", say: s, sayAfter: true, prompt: "문장의 뜻을 골라요!", expr: s, answer: a, choices: [a, ...wrong],
      hint: "not 이 있으면 '~아니에요 / ~않아요'!", explain: [s, `not → ${a}`] }));

  // E24 상황 표현
  [["친구가 선물을 줬어요! 🎁", "Thank you."], ["친구 발을 실수로 밟았어요. 😣", "I'm sorry."], ["아침에 선생님을 만났어요. ☀️", "Good morning."],
   ["밤에 자러 가요. 🌙", "Good night."], ["친구와 헤어져요. 👋", "Goodbye."], ["처음 만난 친구에게 인사해요. 🙂", "Nice to meet you."],
   ["친구가 '고마워' 라고 했어요. 🙏", "You're welcome."], ["생일인 친구에게 말해요. 🎂", "Happy birthday!"], ["친구가 넘어졌어요. 🤕", "Are you okay?"],
   ["밥을 먹기 전이에요. 🍚", "Let's eat!"], ["물을 더 받고 싶어요. 💧", "More water, please."], ["친구가 상을 받았어요. 🏆", "Good job!"]]
    .forEach(([sit, a], i, all) => {
      const pool = all.map((x) => x[1]).filter((x) => x !== a);
      add("E24", 4, { kind: "choice", prompt: `${sit}\n뭐라고 말할까요?`, answer: a, choices: [a, ...pool.slice(i % 8, (i % 8) + 3)], sayAnswer: true,
        hint: "그 사람의 기분을 생각해 봐요.", explain: [`${sit.split("\n")[0]} → ${a}`] });
    });

  // E25 대화 완성
  [["How are you?", "I'm fine, thank you.", ["I'm eight.", "It's a dog.", "Goodbye."]], ["What's your name?", "My name is Jion.", ["I'm fine.", "Yes, I am.", "It's red."]],
   ["Do you like pizza?", "Yes, I do.", ["Yes, I am.", "It is pizza.", "Thank you."]], ["Can you swim?", "Yes, I can.", ["Yes, I do.", "I am fish.", "Good night."]],
   ["Thank you!", "You're welcome.", ["Thank you.", "I'm sorry.", "Good morning."]], ["Nice to meet you.", "Nice to meet you, too.", ["Goodbye.", "I'm sorry.", "Yes, I can."]],
   ["Where is the cat?", "It's under the table.", ["It's a cat.", "It's red.", "Yes, it is."]], ["What do you want?", "I want some water.", ["I am water.", "Yes, I do.", "It is hot."]],
   ["Are you hungry?", "Yes, I am.", ["Yes, I do.", "I'm eating.", "It's a cake."]], ["Let's play!", "Okay!", ["Thank you.", "Good night.", "I'm eight."]],
   ["Good morning!", "Good morning!", ["Good night!", "Goodbye!", "I'm sorry!"]], ["What time is it?", "It's three o'clock.", ["It's Monday.", "I'm three.", "It's a clock."]]]
    .forEach(([q, a, wrong]) => add("E25", 4, { kind: "choice", listen: true, say: q, prompt: "친구가 말해요. 알맞은 대답은?", expr: q, answer: a, choices: [a, ...wrong], sayAnswer: true,
      hint: "질문에 나온 말(do, can, am…)을 잘 봐요.", explain: [`${q}`, `→ ${a}`] }));

  const NAMES = {
    E01: "알파벳 소리", E02: "단어 듣기", E03: "그림→단어", E04: "듣고 그림", E05: "빠진 철자", E06: "철자 순서", E07: "단어 뜻",
    E08: "색", E09: "영어 숫자", E10: "하나·여럿", E11: "반대말", E12: "동작 단어", E13: "he/she/it", E14: "a/an", E15: "복수형",
    E16: "is/are", E17: "-ing", E18: "문장 만들기", E19: "문장 듣기", E20: "위치 표현", E21: "질문·대답", E22: "문장 의미",
    E23: "not", E24: "상황 표현", E25: "대화 완성",
  };

  function shuffle(r, arr) {
    arr = arr.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** BANK 한 줄 → 문제 (보기·조각은 섞는다) */
  function build(row, idx, r) {
    r = r || Math.random;
    const q = Object.assign({}, row);
    q.subject = "en"; q.concept = row.c; q.level = row.lv; q.name = NAMES[row.c];
    q.id = `${row.c}#${idx}`;
    if (q.choices) q.choices = shuffle(r, q.choices);
    if (q.tokens) {
      // 같은 순서로 섞이면 다시
      let t = shuffle(r, q.tokens);
      for (let k = 0; k < 5 && t.join() === q.answer.join(); k++) t = shuffle(r, q.tokens);
      q.tokens = t;
    }
    if (!q.choiceType) q.choiceType = "text";
    return q;
  }
  const all = (r) => BANK.map((row, i) => build(row, i, r));
  const byConcept = (c) => BANK.map((row, i) => [row, i]).filter(([row]) => row.c === c);
  function make(concept, r, used, lv) {
    let rows = byConcept(concept);
    if (lv && rows.some(([row]) => row.lv === lv)) rows = rows.filter(([row]) => row.lv === lv);
    const list = rows.filter(([, i]) => !used || !used.has(`${concept}#${i}`));
    const pool = list.length ? list : rows;
    const [row, i] = pool[Math.floor((r || Math.random)() * pool.length)];
    return build(row, i, r);
  }
  function similar(q, r, used) {
    const u = new Set(used || []);
    u.add(q.id);
    return make(q.concept, r, u, q.level);
  }
  const CONCEPTS = Object.keys(NAMES);
  const LEVELS = {};
  CONCEPTS.forEach((c) => { LEVELS[c] = byConcept(c).map(([row]) => row.lv); });
  /** 그 레벨 문항이 있는 개념 */
  const byLevel = (lv) => CONCEPTS.filter((c) => LEVELS[c].includes(lv));
  /** 녹음할 영어 문장 전부 */
  function speechTexts() {
    const out = new Set();
    BANK.forEach((row) => {
      if (row.say) out.add(row.say);
      if (row.sayAnswer) out.add(row.answer);
    });
    return [...out];
  }

  const API = { BANK, V, COLORS, NAMES, CONCEPTS, all, make, similar, byLevel, build, speechTexts };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.EnQ = API;
})(typeof window !== "undefined" ? window : globalThis);
