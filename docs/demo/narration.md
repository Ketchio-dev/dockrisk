# 제출 영상 내레이션 — 3분 50초

두 번째 판. 첫 판은 글로 썼고 이건 말로 씁니다. 왜 바꿨는지는 맨 아래.

**녹음**: 조용한 방, 입에서 20 cm 안쪽, 블록 사이 1~2초 쉬기. `docs/demo/voice/`에 넣으면 됩니다.
**[REF]** 블록은 음성 복제 레퍼런스로도 쓰이니 특히 또박또박.

---

## 1 · 정체 — 0:00–0:12

### [REF] 0:00–0:12

> Hi, I'm Junsu. This is Dock Risk, built for the RoadStar Hackathon.
> It catches the moment a dock delay kills a driver's next load — while dispatch can still do something about it.

---

## 2 · 문제 — 0:12–0:35

### 0:12–0:24 · 두 시계

> A truck waits at a dock. Two clocks are running.
> One is money. Past two hours, detention starts billing.
> The other is the law. Waiting counts as on-duty time, so his legal hours drain while he sits still.

### 0:24–0:35 · 격차

> Here's the part nobody watches. [pause]
> The second clock runs out first.
> In this scenario the next load dies at 12:53. Free time doesn't end until 13:30.
> Thirty-seven minutes. [pause] Every detention tool on the market wakes up at 13:30.

---

## 3 · 작동하는 제품 — 0:35–2:45

### 0:35–0:50 · 보드

> So here's the desk. Eight trucks, ranked by which one is about to become a problem.
> The first two columns are the two clocks. Time until detention bills, hours until he has to stop driving.

### 0:50–1:05 · 세 시계

> Open Driver84. He's been waiting two hours.
> Detention starts in thirty-seven minutes. He has one hour left to reach a legal stop.

### 1:05–1:20 · 판정

> And there's the verdict. [pause] The next load is already impossible.
> Release him right now and he's still forty-nine minutes short.
> A live 401 closure is adding road time to the same check.

### 1:20–1:35 · 기사 앱

> The driver confirms his check-in. One tap.
> That tap is evidence. It sets when the billing clock starts, and it's kept with who reported it.

### 1:35–1:55 · 구조

> Dispatch looks for a relief driver.
> Candidates come back with reasons, not scores. Distance, arrival time, trailer type, and whether his hours cover the whole trip.
> Drivers who can't make it are blocked, and it says why.

### 1:55–2:10 · 수락

> One offer goes out. The driver accepts on his phone.
> The load is saved. The original stop keeps every piece of its evidence.

### 2:10–2:25 · 과금

> Now Driver84 is released, and the charge writes itself.
> Fifteen billable minutes. Eighteen seventy-five. Billed to the consignee.

### 2:25–2:45 · 증거 패킷

> This is what makes it collectable. [pause]
> The amount, then the arithmetic with every rule spelled out, then the ledger — each event and who reported it.
> When the evidence is thin, we don't bill. It's drafted, flagged, and the packet says exactly why.

---

## 4 · 증명 — 2:45–3:25

### 2:45–3:05 · 재생

> We replayed the organizers' own export. Fifty-six days, ten thousand legs, real dock timestamps.
> About thirty-one thousand dollars a month of exposure. [pause]
> And the thirty-minute warning caught a hundred and fifteen of the hundred and twenty-six stops that went over.

### 3:05–3:25 · 한계

> We trained on the first four weeks and scored on the last four, so that number is out of sample.
> We also named what we couldn't build. Axle weight isn't possible — that sheet has one column.
> This isn't a certified ELD. And we say exposure, not unbilled, because the file has no billing records.

---

## 5 · 닫기 — 3:25–3:50

### 3:25–3:50

> Detention timers are table stakes. [pause]
> Connecting the dock clock to the next dispatch decision, early enough to act — that's Dock Risk.
> Watch the clock that runs out first.

---

## 왜 다시 썼나

첫 판을 심사 현장 기준으로 다시 재봤습니다. 근거는 Devpost 심사위원 인터뷰와 방송 문체 지침입니다.

**Devpost 심사위원 Richard Moot (Square):**
> *"I watch the video to get context and then I use that for testing the submission."*
> *"The video becomes crucial in giving us our first indicator of how much time was invested."*

영상은 광고가 아니라 **제품 테스트 설명서**입니다. 그런데 첫 판은 45초 동안 슬라이드만 보여줬습니다. "나쁜 demo video의 흔한 실수" 1번이 정확히 그것 — 문제를 오래 말하고 제품을 늦게 보여주기.

| | 첫 판 | 이 판 |
|---|---|---|
| 제품 첫 등장 | 0:45 | **0:35** |
| 평균 문장 길이 | 24단어 | **14단어** |
| 최장 문장 | 38단어 | 24단어 |
| 사용자 행동 시점 | 3인칭 서술 | 현재형·능동 |
| 한 문장 속 숫자 | 최대 4개 | **1개** |
| 명시적 pause | 없음 | 6곳 |

방송 문체 기준(University of Arkansas): 문장당 20단어 이하, 한 문장에 한 생각, 능동태, 현재형, 완성 후 소리 내어 읽기.

숫자는 반올림하고 하나씩 말합니다. `$57,638`은 안 쓰고 "about thirty-one thousand a month"만 씁니다. 화면에 이미 보이는 건 읽지 않습니다.

## 발음 주의

| 단어 | 발음 |
|---|---|
| Dock Risk | **닥 리스크** — 두 단어로 끊어서 |
| detention | 디텐션 |
| consignee | 컨사이니 |
| ELD | 이-엘-디 |
