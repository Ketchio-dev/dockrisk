# DockRisk 발표 Q&A

영어 답변은 각각 45단어 이하입니다. 먼저 짧게 답하고, 후속 질문이 있을 때 화면을 보여주세요. 숫자는 2026-09-13 로컬 데이터 기준입니다. 모르면 “I have not validated that yet.”라고 답하면 됩니다.

## 바로 찾아볼 숫자

- 분석 기간: 56일. 지역 내 정차 2,824건.
- 물리적 대기 기반 노출액: 월 $32,322–$43,095 (무료 120분, 시간당 $75–$100 가정).
- 계약 시각 조정·15분 절사 리플레이: $57,638 / 56일, 월 환산 $30,877.
- 경고 평가: 173개 판단, 145개 경고, 적중 115, 오경보 30, 놓침 11.
- 항상 경고 기준: 오경보 47, 놓침 0. 우리 방식은 오경보 17건 감소·놓침 11건 증가.

## 1. What does DockRisk do?

> DockRisk shows when dock waiting puts the next load at risk. It also drafts detention charges with supporting evidence. Dispatch can compare relief drivers and offer a reassignment.

제품 한 줄 설명. 다음 화물 위험과 근거 있는 청구 초안으로 연결한다.

## 2. What does the thirty-seven minutes mean?

> At 11:23 in the captured demo, billing starts in thirty-seven minutes, at noon. The next-load plan is already infeasible. Thirty-seven minutes is the remaining free time, not a measured interval between two deadlines.

37분은 청구 시작까지 남은 시간이다. 두 마감의 차이를 측정한 숫자가 아니다.

## 3. Is the money actually collectible?

> We have not established that. The export has no invoices or contract rates. The headline is potential exposure under stated assumptions. A real claim needs the contract and verified timestamps.

회수한 매출이 아니다. exposure와 실제 청구 가능성을 구분한다.

## 4. Why do you show both $32–43k and $31k per month?

> They use different calculations. The exposure estimate uses physical dwell and a rate range. The replay uses appointment-adjusted qualifying time, a fixed rate, and fifteen-minute rounding. Neither number proves unpaid revenue.

서로 다른 계산이다. 물리적 대기시간과 계약 기준 조정·절사 차이를 설명한다.

## 5. What is real, and what is simulated?

> Historical orders and dwell analysis use the organizer export. The live demonstration uses simulated GPS and seeded duty history. The engine computes from those inputs. The public demo uses a separate synthetic dataset.

과거 분석과 실시간 시나리오를 구분한다. 라이브 GPS를 실제 운행 기록이라고 말하지 않는다.

## 6. Have you proved the next-load problem happens in this fleet?

> No. The export has driver balances but no duty-event history. We demonstrate the timing conflict in a simulated scenario. Measuring its frequency needs real duty logs and dispatch outcomes.

가장 중요한 한계. HOS 충돌 빈도는 검증하지 않았다.

## 7. How is this different from a detention timer?

> We connect the detention clock to the next-load plan. Dispatch sees the remaining margin and possible relief drivers alongside the charge evidence. We still need a carrier pilot to test whether this improves decisions.

경쟁사가 못 한다고 단정하지 않는다. 구현한 연결과 아직 필요한 검증을 설명한다.

## 8. What does 79% precision mean?

> We issued 145 warnings. Of those, 115 stops exceeded free time and 30 did not. Eleven exceeding stops were missed. The result comes from a later test period, using a model trained on earlier completed stops.

경고 중 맞은 비율이다. 115/145, 놓친 정차는 11건.

## 9. Why not warn on every stop?

> Among 173 eligible decisions, always-warning catches all 126 overruns with 47 false alarms. Our model gives 145 warnings, with 30 false alarms and 11 misses. That trades 17 fewer false alarms for 11 missed overruns.

28은 총 경고 감소량이다. 오경보 감소량은 17이다. 더 낫다고 무조건 단정하지 않는다.

## 10. How did you avoid training on the test data?

> Training uses stops completed before July 31. Testing uses stops arriving from that cutoff onward. Three stops still open at the cutoff are excluded from both groups. The warning model uses historical conditional frequencies.

완료 시점까지 고려한 시간 분할이다. 무작위 분할이라고 말하지 않는다.

## 11. Does that score validate the live HOS prediction?

> No. That score evaluates the historical detention-warning baseline. It does not validate HOS collisions or the live shift model. The export cannot support those evaluations.

79%와 91%를 HOS 예측 성능으로 가져다 쓰면 안 된다.

## 12. What happens when there are too few examples?

> The estimate falls back from facility to city, then stop type, then the broader sample. The interface shows the sample size and grouping. Sparse data means less specific evidence, and a pilot must test its usefulness.

표본이 부족하면 더 넓은 집단으로 후퇴한다. 작은 표본에서 정밀하다고 주장하지 않는다.

## 13. Do a few very long stops drive the headline?

> Yes. Thirty-eight stops exceed six hours. They carry roughly half the hours beyond free time. The live engine flags long dwell for review. We need to investigate those records before treating them as collectible claims.

긴 정차의 집중을 인정한다. 이상값이 모두 진짜 청구 대상이라고 방어하지 않는다.

## 14. What does the AI calculate?

> The language model extracts proposed contract terms and drafts notice text. Deterministic code calculates durations, amounts, and plan feasibility. Extracted terms need confirmation. Notices remain editable drafts.

LLM의 언어 작업과 결정론적 계산 엔진을 분리해 설명한다.

## 15. What happens if the language model fails?

> The calculation engine still works. Notice drafting can fall back to a template. Proposed contract terms still need human confirmation. The interface identifies the drafting source.

LLM이 없어도 엔진은 동작한다. 언어 작업의 대체 경로를 설명한다.

## 16. Does the app send invoices or customer emails?

> It creates charge records and notice drafts. A dispatcher can approve a charge and copy a notice. The current interface does not send customer emails or integrate with an invoicing system.

실제 코드는 Copy 버튼이다. 존재하지 않는 Send 버튼이나 자동 청구를 설명하지 않는다.

## 17. Can drivers use this instead of an ELD?

> This is a prototype companion. It is not a certified ELD. The current duty history is seeded for the demo. Operational use needs verified ELD data and validation of the supported rule scope.

인증 ELD라고 말하지 않는다. 구현 범위와 실제 데이터 연결이 남아 있다.

## 18. How do you choose a relief driver?

> The code checks availability, trailer compatibility, capacity, pickup timing, and the duty plan. It ranks candidates with reasons and compares historical dock-time scenarios. Travel times are estimates. We have not validated this as a production optimizer.

전역 최적화라고 과장하지 않는다. 명시적인 필터와 순위다.

## 19. What happens if a driver forgets a check-in?

> The packet records which timestamps exist and who reported them. The rules can flag missing or uncertain evidence for review. We cannot claim every timestamp is verified just because the system produced a draft.

버튼 입력 누락을 자동으로 해결한다고 말하지 않는다. 기록 출처와 검토 사유를 보여준다.

## 20. Who pays, and what is the price?

> The intended buyer is the carrier operations team. Pricing is not validated. I would first test dispatcher time saved, actionable warnings, and accepted claims with one carrier. Those results should guide pricing.

고객과 가격 검증은 아직 없다. 즉석에서 가격을 지어내지 않는다.

## 21. What would you do next?

> Run a carrier pilot with verified duty logs and contracts. Compare against simple warning rules. Measure missed risks, false alarms, dispatcher effort, and accepted claims. Use that evidence to decide what to automate.

다음 단계는 실제 데이터와 운영 결과로 검증하는 파일럿이다.

## 확인 근거

- `services/core/backtest.py`, 로컬 `/backtest`: 분할 방식·경고 혼동행렬·리플레이 금액.
- `services/core/analytics.py`, 로컬 `/exposure`: 56일·대기시간·노출액 가정.
- `services/core/visits.py`: 6시간 검토 기준·증거·계산.
- `services/core/hos.py`, `services/api/main.py`: 지원 범위·seed 출처.
- `services/core/matching.py`: 후보 필터·추정 이동시간·순위.
- `services/core/notice.py`, `services/core/policy_extract.py`, 웹 evidence 페이지: 초안·확인·복사 흐름.
