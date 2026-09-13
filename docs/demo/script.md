# 발표 대본 — 읽을 것은 영어, 볼 것은 한국어

무대에서 손에 들고 보는 물건입니다. 규칙은 하나입니다.

- **굵은 영어 줄** = 입으로 내는 말. 그대로 읽으면 됩니다.
- 한국어 = 나만 보는 것. 무엇을 클릭하고, 화면 어디를 가리키고, 왜 이 장면이 있는지.

배정 시간은 10~15분입니다. 아래는 10분짜리라 질문 시간이 남습니다. 서두르지 마세요.

준비: `scripts/demo.sh 60` · 탭 두 개(`/` 와 `/driver/Driver8`) · 속도 ×120 · 질문 오면 일시정지.

---

## 시작 · 0:00–0:30

> 아직 아무것도 클릭하지 마세요. 화면은 `/data`를 띄워두고, 사람을 보고 말합니다.
> 첫 두 문장이 전부입니다. 이것만 외우세요.

**A truck waiting at a dock loses its next load before it earns a detention charge.**

**DockRisk catches that moment, and tells the dispatcher which truck to move.**

> 한 박자 쉬고 화면으로 넘어갑니다.

---

## 1 · 발견 — `/data` · 0:30–1:30

> `/data` 페이지. 맨 위 큰 숫자를 가리킵니다.
> 이 페이지를 먼저 여는 이유가 있습니다. 우리가 만든 화면이 아니라 **우리가 찾아낸 것**이고,
> 심사 배점에서 "제공 데이터 사용"이 15퍼센트입니다.

**This is the carrier's own fifty-six days, replayed through our rules.**

**Thirty-two to forty-three thousand dollars a month of detention exposure.**

> 여기서 멈추지 말고 **바로 한계를 말하세요.** 먼저 말하면 정직해지고, 나중에 지적당하면 변명이 됩니다.

**This is exposure, not recovered money. The export has no billing records.**

> 이제 아래 그래프를 가리킵니다.

**Most waits end inside an hour. The money is in the thin tail past the free-time line.**

**That tail is exactly what manual logging misses.**

---

## 2 · 트럭 한 대 — `/` · 1:30–2:30

> 배차 데스크로 넘어갑니다. 오른쪽 보드를 가리킵니다.

**Eight trucks, ranked by which one becomes a problem first.**

**Only the top row opens. If everything is open, nothing is urgent.**

> 맨 위 행(Driver84)을 클릭합니다. 지도가 그 트럭으로 날아갑니다.

**This driver is at a London dock. He has been waiting since nine twenty-five.**

---

## 3 · 두 시계 — 데이 바 · 2:30–3:30

> 펼쳐진 행의 **가로 막대**를 손가락으로 짚습니다. 이게 이 발표의 중심입니다.
> 천천히. 왼쪽부터 오른쪽으로.

**This is one driver's day on a time axis.**

**The hatched band is his two hours of free time. After it, detention.**

**The red tick is when he must legally stop driving.**

> 여기서 **빨간 눈금**과 **황색 시작점**을 번갈아 짚으세요. 빨간 게 왼쪽에 있습니다.

**Look at the order. The red tick comes first. That is the whole problem.**

---

## 4 · 판정 — `/` · 3:30–4:30

> 데이 바 아래 굵은 줄을 가리킵니다.

**It does not say "at risk". It says what to do.**

**Reassign this load now. The number is on the screen.**

> 그 아래 이유를 가리킵니다.

**And underneath, why. Even if we release him this second, he is short.**

> 도로 항목이 붙어 있으면 같이 말합니다.

**A live highway incident is adding road time to the same check.**

---

## 5 · 기사 앱 — `/driver/Driver84` · 4:30–5:30

> 기사 탭으로 넘어갑니다. 폰 화면입니다.
> **정시 도착**을 누르고, 그 다음 **체크인**을 누릅니다.

**The driver taps once to confirm he arrived.**

**That tap is evidence. It sets when the billing clock starts, and who reported it.**

> 여기서 반드시 먼저 밝히세요. 나중에 지적당하면 늦습니다.

**This is a companion app. It is not a certified ELD, and we do not claim it is.**

> 배차 탭으로 돌아갑니다. 검토 사유가 줄어든 게 보입니다.

---

## 6 · 대체 기사 — `/` · 5:30–7:00

> **Find a relief driver**를 누릅니다.

**Candidates come back with reasons, not scores.**

**Drivers who cannot make it are blocked, and it says why.**

> 이제 각 후보 **밑의 한 줄**을 가리킵니다. 이 화면에서 제일 센 문장입니다. 천천히 읽으세요.

**Now read this line. The plan budgets forty-five minutes a dock.**

**This lane's real docks take longer. Costed that way, this driver is eleven minutes past a legal stop.**

**Four of seven candidates flip.**

> 질문이 나오기 전에 먼저 방어합니다.

**The verdict stays on the fixed rule. The history sits beside it, with its sample size.**

> **Offer load**를 누르고, 기사 탭(Driver8)으로 가서 **Accept**를 누릅니다. 배차로 돌아옵니다.

**One offer. The driver accepts on his phone. The load is saved.**

---

## 7 · 돈 — `/` · 7:00–8:00

> 히어로 탭에서 **Loading done** → **Released, leaving**를 누릅니다. 청구 초안이 생깁니다.

**He is released, and the charge writes itself. Fifteen billable minutes. Eighteen seventy-five.**

> 금액이 작다고 사과하지 마세요. 오히려 그게 논점입니다.

**That is small. That is the point. Nobody chases eighteen dollars by hand.**

> **Packet**을 눌러 증거 패킷을 엽니다.

**Here is what is behind it. The calculation, the timeline, and who reported each event.**

**We compute the amount automatically. We never bill automatically. A person presses the button.**

---

## 8 · AI — `/policies` · 8:00–9:00

> 정책 페이지. 요율 확인서 예시를 붙여넣고 **Extract terms**를 누릅니다.

**Here is where the AI is. It reads a rate confirmation into terms, and shows the clause it used.**

**A person confirms before it applies.**

> 원칙을 한 문장으로 못 박습니다. 기술 심사에서 신뢰가 여기서 생깁니다.

**Rules do the law and the money. The model only reads text and writes text.**

---

## 9 · 못 하는 것 · 9:00–10:00

> 마지막입니다. 못 하는 것을 먼저 말하는 팀이 이깁니다.

**What we did not build, on purpose.**

**Axle weight. The truck sheet has one column. There is nothing to compute from.**

**We do not report revenue. The export has no rates.**

**And stops over six hours never auto-bill. Forty-nine of them carry two thirds of the hours.**

> 마지막 문장으로 끝냅니다. "질문 있나요?"로 끝내지 마세요.

**A tool that only shows you the wins is a tool nobody trusts on Monday.**

---

# 질문이 오면

> 외울 필요 없습니다. 방향만 기억하고, 모르면 모른다고 하세요.

**“기존 TMS로 하면 되지 않나?”**

**The TMS can compute this, after someone types the timestamps in. Nobody types them in.**

**“대기 예측이 일반화되나?”**

**We do not know. Some cities have a sample of nine. That is why the sample size is on the screen.**

**“저게 실제로 받을 수 있는 돈인가?”**

**No. It is exposure. Contract eligibility and real rates are not in this file.**

**“다음에 뭘 만들 건가?”**

**Backhaul. Thirty-five percent of legs run empty, but only twelve percent of the distance.**

**“AI는 어디에 썼나?”**

**Two places, both labelled. Reading a rate confirmation, and drafting the customer notice. Never a number.**

---

# 무대에서 뭔가 잘못되면

> 당황하지 말고 이 표대로 하세요. 전부 겪어보고 고쳐둔 것들입니다.

| 증상 | 할 일 | 말할 것 |
|---|---|---|
| 화면이 멈춘 것 같다 | 우상단 배지를 본다. `Polling`이면 **스스로 복구 중** | *"It just reconnected — the badge tells you how fresh this is."* |
| 시계가 안 간다 | **Resume**. 시나리오가 끝났으면 **Reset** | *"Let me restart the scenario — it replays identically."* |
| 지도가 회색 | 잠시 기다리면 **자동으로 위성 전환**. 안 되면 **Satellite** | *"Street tiles need the network. The satellite layer is cached."* |
| 숫자가 이상하다 | **Reset**. 같은 씨앗으로 똑같이 재생 | *"Same seed, same replay."* |
| 전부 안 된다 | `docs/demo/backup.mp4` (90초)를 틀고 위에 설명 | *"Let me show you the recording and talk over it."* |

> 인터넷이 끊겨도 **보드·데이 바·판정·근무시간·청구·증거 패킷은 전부 로컬 계산**이라 그대로 돕니다.
> 인터넷을 타는 건 거리 지도 타일 하나뿐입니다.

---

# 마지막에 남겨야 할 세 문장

1. **개입할 수 있는 마지막 순간이, 청구가 시작되기 전에 지나간다** — 우리가 찾은 것
2. **금액은 자동으로 계산하되, 청구는 사람이 누른다** — 신뢰의 근거
3. **이 숫자는 회수액이 아니라 노출액이다** — 정직함
