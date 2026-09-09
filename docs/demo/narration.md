# 제출 영상 내레이션 — 4분 05초

3~5분 규정 안. 컷은 `scripts/record_video.sh`가 만들고, 이 대본이 그 위에 얹힙니다.

**녹음 방법**: 조용한 방, 입에서 20~30cm, 한 번에 쭉 읽되 틀리면 그 문장만 다시. 파일은
`docs/demo/voice/` 아래에 두면 됩니다. 아래 **[REF]** 표시된 첫 블록은 음성 복제의 레퍼런스로도
쓰이므로 특히 또박또박, 잡음 없이.

---

## 1 · 문제 — 0:00–0:45

### [REF] 0:00–0:12 · 타이틀

> A truck sitting at a loading dock is burning two clocks at once, and the industry only watches one of them.
> I'm Junsu, and this is DockRisk — a detention and hours-of-service exception desk for city dispatch in Southern Ontario.

### 0:12–0:27 · 두 손해

> The first clock is money. Past the two hours of free time in the contract, detention starts accruing — but nobody wrote down the in and out times, so the carrier eats it.
> The second clock is the law. Waiting at a dock is on-duty time, so the driver's legal hours are draining while the truck sits still.

### 0:27–0:45 · 37분

> Here is what that means. In our demo scenario the driver's next load becomes legally impossible at 12:53. The free time does not run out until 13:30.
> Thirty-seven minutes. Every detention product on the market starts paying attention at 13:30 — by then the load is gone, and the only question left is who eats it.

---

## 2 · 데모 — 0:45–3:45

### 0:45–1:05 · 보드

> This is the dispatcher's board, running on the organizers' own TruckMate export. Eight trucks, ranked by urgency — not by arrival.
> The columns are deadlines first: time until detention is billable, hours until a legal stop, and how long the truck has been waiting.

### 1:05–1:25 · 세 시계

> Driver84 is at a London distribution centre. Billable in thirty-seven minutes. One hour two minutes until he has to stop driving legally. Two hours three minutes waited so far.
> Both clocks on one time axis, which is the whole idea.

### 1:25–1:45 · 기사 체크인

> The driver confirms on the companion app. That tap is not decoration — it is evidence.
> The billing clock starts at the later of check-in and appointment, and the tap time is kept separately in the ledger, so the charge can be defended later.

### 1:45–2:15 · 시계 충돌

> Now watch the verdict change. The wait has already made the next load infeasible.
> At arrival there was an hour and fourteen minutes of margin. If they released him this second, it is minus forty-nine. After the predicted wait, minus fifty-five.
> And a live Ontario 511 event on the 401 is adding road minutes to the same forward check. Two things ate this driver's day — a dock and a highway — and the engine puts both in one calculation.

### 2:15–2:40 · 구조

> So dispatch finds a relief driver. Candidates are ranked with explicit reasons, not an optimizer score: deadhead distance and ETA against the pickup window, trailer type, hours-of-service for the whole plan, and each candidate pays for the road delay on its own route.
> Drivers who cannot make it are blocked, with the reason written out.

### 2:40–3:00 · 오퍼와 수락

> One offer goes to the driver. He accepts on his phone. The exception resolves, and the original stop keeps every piece of its detention evidence.

### 3:00–3:20 · 과금

> When Driver84 is finally released, a draft charge appears. Qualifying dwell of one hundred thirty-five minutes, fifteen billable minutes at the fifteen-minute floor, eighteen dollars seventy-five, billed to the consignee.

### 3:20–3:45 · 증거 패킷

> And this is what turns a calculation into money a customer will actually pay. The amount first, then the arithmetic with each rule written out in words, then the event ledger — every transition, who reported it, and when it was received.
> When the evidence is thin, we do not bill quietly. The charge is drafted and flagged for review, and the packet says exactly why.

---

## 3 · 마무리 — 3:45–4:05

### 3:45–3:55 · 안 만든 것

> We also named what we did not build. Axle-weight compliance is not possible from a Trucks sheet with one column. This is not a certified ELD. And we say exposure, never unbilled — the export has no billing records.

### 3:55–4:05 · 닫기

> Replayed across the carrier's own fifty-six days, that is about thirty-one thousand dollars a month of exposure, and a hundred and fifteen of the hundred and twenty-six stops that went past free time were flagged before billing even started.
> Watch the clock that runs out first.

---

## 발음 주의

| 단어 | 발음 |
|---|---|
| detention | 디텐션 |
| consignee | 컨사이니 |
| deadhead | 데드헤드 |
| infeasible | 인피저블 |
| qualifying dwell | 퀄리파잉 드웰 |
| TruckMate | 트럭메이트 |
