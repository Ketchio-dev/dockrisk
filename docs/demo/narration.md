# 제출 영상 내레이션 — 3분 40초

세 번째 판. 두 번째 판은 제품이 뭘 *보여주는지* 말했고, 이건 제품이 뭘 *시키는지* 말합니다.
왜 바꿨는지는 맨 아래.

**녹음**: 조용한 방, 입에서 20 cm 안쪽, 블록 사이 1~2초 쉬기. `docs/demo/voice/`에 넣으면 됩니다.
**[REF]** 블록은 음성 복제 레퍼런스로도 쓰이니 특히 또박또박.

---

## 1 · 정체 — 0:00–0:12

### [REF] 0:00–0:12

> Hi, I'm Junsu. This is Dock Risk, built for the RoadStar Hackathon.
> It tells a dispatcher which truck to move, while there's still time to move it.

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

### 0:35–0:48 · 보드

> So here's the desk. Eight trucks, ranked by which one is about to become a problem.
> The first two columns are the two clocks.

### 0:48–1:02 · 세 시계

> Open Driver84. He's been waiting two hours.
> Detention starts in forty-three minutes. He has fifty-four minutes to reach a legal stop.

### 1:02–1:22 · 명령

> And here is the part that matters. [pause]
> It doesn't tell you the load is at risk. It tells you what to do.
> **Reassign four-one-one-nine-oh-two now.** The wait has already made it impossible.
> Release him this second and he is still forty-six minutes short.

### 1:22–1:36 · 기사 앱

> The driver confirms his check-in. One tap.
> That tap is evidence. It sets when the billing clock starts, and it's kept with who reported it.

### 1:36–1:56 · 구조

> So you find a relief driver.
> Candidates come back with reasons, not scores. Distance, arrival time, trailer type, and whether his hours cover the whole trip.
> Drivers who can't make it are blocked, and it says why.

### 1:56–2:10 · 수락

> One offer goes out. The driver accepts on his phone.
> The load is saved. The original stop keeps every piece of its evidence.

### 2:10–2:24 · 과금

> Now Driver84 is released, and the charge writes itself.
> Fifteen billable minutes. Eighteen seventy-five. Billed to the consignee.

### 2:24–2:45 · 증거 패킷

> This is what makes it collectable. [pause]
> The amount, then the arithmetic with every rule spelled out, then the ledger — each event and who reported it.
> When the evidence is thin, we don't bill. It's drafted, flagged, and the packet says exactly why.

---

## 4 · 시각 — 2:45–3:05

### 2:45–3:05 · 몇 시에 보내느냐

> One more thing, and it's the one a dispatcher can act on tomorrow morning. [pause]
> The hour you send a truck changes the odds.
> In their own data, a truck arriving at seven in the morning runs over the two-hour line three times as often as one arriving at seven at night.
> Same docks. Same customers. So the desk stops saying "this dock is slow" and starts saying "don't book this dock before noon."

---

## 5 · 증명과 한계 — 3:05–3:25

### 3:05–3:25 · 재생과 한계

> We replayed the organizers' own export. Fifty-six days of real dock timestamps.
> About thirty-one thousand dollars a month of exposure, and the warning caught a hundred and fifteen of the hundred and twenty-six stops that went over.
> We trained on the first four weeks and scored on the last four.
> We also named what we couldn't build. Axle weight isn't possible — that sheet has one column. And we say exposure, not unbilled, because the file has no billing records.

---

## 6 · 닫기 — 3:25–3:40

### 3:25–3:40

> Detention timers are table stakes. [pause]
> Telling a dispatcher which truck to move, early enough to move it. [pause]
> That is Dock. Risk.
> Watch the clock that runs out first.

---

## 왜 세 번째 판인가

두 번째 판은 방송 문체는 맞았는데 **제품이 하는 일을 잘못 말하고 있었습니다.**

받은 피드백이 정확했습니다 — *"정보만 전달하는 거야? So what? 그래서 차를 배차해 말어?"* 그리고
*"그냥 있는 정보를 시각화만 하는 것보다… 상황이 이러하니 너 지금 뭐 해야 할껄, 하고 알려주는 것이 필요할 듯."*

그 지적대로 **제품을 고쳤고**, 대본도 따라갑니다.

| | 두 번째 판 | 이 판 |
|---|---|---|
| 1:02 블록 | *"And there's the verdict. The next load is already impossible."* | *"It doesn't tell you the load is at risk. **It tells you what to do. Reassign 411902 now.**"* |
| 시각대 | 없음 | **전용 20초 블록** |
| 오프닝 한 줄 | *"catches the moment a dock delay kills a load"* | *"tells a dispatcher **which truck to move, while there's still time to move it**"* |

**시각대 블록을 새로 넣은 이유**는 두 가지입니다. 하나, 같은 피드백의 *"출발 시간이 새벽·아침·저녁·공휴일별로 소요시간도 다를 텐데, 이런 정보가 있으면 의사결정할 때 도움이 된다"*가 데이터로 확인됐습니다. 둘, 이게 심사 기준의 *Innovation*에 가장 직접 닿습니다 — 남들이 시설 평균을 낼 때 우리는 시각대를 봅니다.

숫자는 검증된 것만 씁니다. 5,904건 기준 07시 도착 24.7% 대 19시 도착 7.5%, 즉 **3.3배**입니다.

## 발음 주의

| 단어 | 발음 |
|---|---|
| Dock Risk | **닥 리스크** — 두 단어로 끊어서 |
| four-one-one-nine-oh-two | 숫자를 하나씩 |
| detention | 디텐션 |
| consignee | 컨사이니 |
