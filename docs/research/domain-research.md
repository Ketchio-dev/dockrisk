# RoadStar Hackathon 2026 사전 조사 보고서

작성일: 2026-09-01
조사 방법: Aside 브라우저 에이전트 3개를 병렬로 돌려 공개 웹 자료를 읽고 정리했음. 아래 영어 본문(1~7절)은 에이전트가 쓴 원문에서 내부 인용 태그만 제거한 것이고, 각 주장마다 출처 링크가 붙어 있음. "unverified"로 표시된 항목은 확인하지 못한 것이므로 발표에서 사실처럼 말하지 말 것.
원본 3건은 `raw/` 폴더에 그대로 보관함.

## 0. 한국어 요약과 시사점

### 심사위원이 매일 쓰는 도구를 알았다

- Road Star Trucking은 온타리오 밀턴에 있는 풀트럭로드(FTL) 회사다. 드라이밴과 냉장 트레일러를 쓰고, 온타리오에서 미국 중서부·남부로 가는 국경 횡단 운행이 주력이다. FMCSA 기록상 파워유닛 88대, 기사 120명이다.
- 이 회사는 TMS로 **TMW**, 차량 통신·GPS로 **PeopleNet**을 쓴다고 공개하고 있다. Samsara나 Motive를 쓴다는 근거는 없다. 발표에서 "TMW 같은 기존 TMS 옆에 붙는 도구"라고 말하면 심사위원 귀에 바로 들어간다.
- 캐나다와 미국 두 나라의 운전시간 규제(HOS)를 동시에 계산해야 하는 회사다. 캐나다는 하루 운전 13시간·근무 14시간·7일 70시간, 미국은 운전 11시간·14시간 창·7일 60시간 또는 8일 70시간이다. 정확한 수치는 3절에 출처와 함께 있다.
- 공동 주최자 Corey Barron의 전 회사 CoreTegrity는 트럭 1대 규모였다. 즉 심사위원 한 명은 대형 플릿 총괄, 한 명은 오너오퍼레이터 경험자다. "디스패처 한 명이 오늘 바로 쓸 수 있고, 100대 규모로도 확장된다"는 스토리가 둘 다에게 먹힌다.

### 디스패처의 진짜 고충 9가지 (2절)

시스템 파편화와 재입력, HOS 때문에 겉보기엔 좋아도 못 받는 화물, 비현실적인 도착 예정 시간, 깨지는 귀가 약속, 교대 때 사라지는 기사 정보, 대기료(detention) 증거 부족, 고장·사고 대응, 막판 변경 폭주, 공차 구간. 각 항목에 포럼 인용과 출처가 있다.

### 경쟁 제품 조사 결과: "AI 디스패치"는 이미 붐빈다 (4절)

- Optimal Dynamics, Fleetline(YC 2025), Numeo, Vooma, Alvys, Trimble의 AI 기사 배정, Rose Rocket AI 에이전트가 이미 배정 추천을 한다. 단순 "AI가 배정안 제안" 수준이면 혁신성 점수를 받기 어렵다.
- 기사용 앱은 Samsara Driver, Motive Driver가 HOS, 배차, 서류, 내비게이션을 다 갖추고 있어 **후보 B(기사용 모바일 앱)는 차별화가 가장 어렵다.**
- 조사 에이전트의 판단: 후보 A는 "설명 가능하고 제약 조건을 다 반영하며 즉시 재계획되는" 수준이어야 살아남고, 후보 C는 "지연 예측"에서 끝나지 않고 "가장 싼 조치를 추천"할 때 가장 안전하다.
- 100대 플릿 GM에게 새로워 보일 것 5가지: (1) 매출·HOS·장비·약속시간·귀가·기사 선호를 함께 보고 트레이드오프를 설명하는 사람 승인형 최적화, (2) 지연 위험을 "정차 순서 변경, 트럭 교체, 고객 통보, HOS 보호" 중 가장 싼 조치로 바꿔 주는 것, (3) 기사 선호를 기록하고 학습하는 피드백 루프, (4) 온타리오 511 실시간 도로 정보와 계절 하중 제한을 결합한 온타리오 우선 제품, (5) "화물 A 대신 B를 받으면 무엇이 바뀌나"를 보여 주는 시뮬레이터.

### API는 기대하지 말고 설계하라 (6절)

- Samsara: 문서와 SDK가 가장 좋지만 파트너 샌드박스 승인에 영업일 5~7일이 걸린다. 주최 측이 토큰을 주면 최선, 아니면 못 쓴다.
- Motive: 개발자 계정을 직접 만들 수 있고 API 키에 테스트 모드가 있다. 더미 플릿 연결은 Motive 지원팀에 요청해야 한다. 혼자서도 가장 현실적이다.
- TruckMate: 고객사 설치 인스턴스가 있어야 한다. 주최 측이 호스팅된 인스턴스와 자격증명을 첫날 주지 않으면 불가능하다.
- DAT: 유료 구독과 서비스 계정이 필요하다. 없다고 가정한다.
- Loadlink: 공개 API 자체가 확인되지 않는다. 핵심 데모를 여기에 걸지 말 것.
- 대체재: 경로·거리는 OSRM(OpenStreetMap), 캐리어 안전 정보는 FMCSA QCMobile API(무료 키), 날씨는 Open-Meteo(가입 불필요).
- 결론: 플릿·기사·HOS·주문 데이터를 공급자 중립 스키마로 두고, 합성 데이터로 채워 두었다가 자격증명이 확인되면 Samsara나 Motive 어댑터만 붙인다.

### 킥오프 전 프로토타입용 공개 데이터 (5절)

- Kaggle "Logistics Operations Database": 기사, 트럭, 트레일러, 주문, 운행, 연료, 정비, 대기료, 정시율까지 있는 합성 데이터. 하카톤 스키마와 가장 비슷하다.
- DT-CARGO(GitHub): 실제 트럭 주행 궤적 데이터. 등록 없이 받을 수 있다.
- FAF5, 온타리오 MTO 상용차 조사: 노선별 물동량 사전 정보.
- Ontario 511 API: 실시간 도로 사고, 공사, 트럭 휴게소, 검문소, 계절 하중 제한.

### 세 조사를 합친 최종 권고

세 보고서가 같은 방향을 가리킨다. 후보 A와 C를 합쳐 **"위험 화물을 먼저 잡아내고, HOS(캐나다·미국) 실행 가능성을 설명하며, 가장 싼 조치를 추천하는 디스패치 코파일럿"**으로 좁히는 것이다. 순수 배정 추천(A)만으로는 경쟁 제품과 구분이 안 되고, 예측만(C)으로는 대시보드에 그친다. 기사용 앱(B)은 뺀다.

최소 기능 후보:
1. 주문·운행·트럭·기사 데이터를 읽어 오늘의 배차판을 지도와 표로 보여 준다.
2. 각 배정에 대해 캐나다·미국 HOS 규칙으로 실행 가능 여부를 계산하고, 불가능한 이유를 문장으로 설명한다.
3. 지연 위험이 높은 화물을 골라내고 "정차 순서 변경 / 트럭 교체 / 고객 통보" 중 가장 싼 조치를 근거와 함께 추천한다.
4. 디스패처가 수락·거절하면 판이 갱신되고, "무엇이 바뀌었나"(매출, 공차 거리, 귀가 약속, 지연 위험)를 요약한다.

킥오프 전에 지금 할 수 있는 것:
- Motive 개발자 계정 생성과 테스트 모드 키 발급.
- (선택) Samsara 파트너 프로그램 신청. 승인이 늦으면 그냥 버린다.
- Kaggle Logistics Operations Database와 DT-CARGO 다운로드, 컬럼 확인.
- 발표 스토리 초안: "월요일 아침 7시, 디스패처 한 명, 트럭 88대, 국경 너머 약속 시간 40개."

---

## 1. Host companies

### Road Star Trucking, Milton, Ontario

- The relevant company appears to be the Milton carrier operating at [roadstartrucking.com](https://roadstartrucking.com/en/), not the similarly named California company listed on LinkedIn. Road Star’s public site identifies Milton as its operating base and describes a Canada-US truckload business.
- Its core freight is **full truckload**, using both **dry-van and temperature-controlled trailers**. The company describes its main service as Ontario to the US Midwest, with an average run within roughly a 1,000-mile radius of the Greater Toronto Area.
- Its published lane emphasis is the **Midwest, South, and South-Central United States**, plus expedited team service to and from **California and Arizona**. The company also offers local truckload cartage in the GTA.
- Road Star also advertises a logistics network handling **cross-border LTL and truckload** freight. That suggests it can arrange LTL through partners, but the public material does not establish that every LTL shipment is hauled by Road Star-owned equipment.
- The company’s public address is **8201 Lawson Road, Milton, Ontario**, and its contact page lists Rob Dhanoa as president and an operations contact. I found no additional publicly identified terminal location; other terminals are **unverified**.
- FMCSA’s current SAFER record for the related legal entity **Road Star Carrier Inc.** lists an active interstate carrier at the same Milton address, with **88 power units and 120 drivers**.
- A third-party carrier profile reports 82 owned tractors, six leased tractors, 471 trailers, general freight, fresh produce, refrigerated food, paper products, and full-truckload service, but those details should be treated as secondary rather than as a substitute for Road Star’s own site or SAFER.
- Road Star publicly names its technology stack: **PeopleNet** for in-cab communications and GPS tracking, and **TMW** for automated dispatch and web-based track-and-trace. It says real-time communication is used for shipment updates and route changes.
- I found no public evidence that Road Star uses Samsara or Motive. Its named ELD/telematics-related platform is PeopleNet, while its dispatch/TMS platform is TMW. Any additional systems are **unverified**.

### CoreTegrity Logistics and Corey Barron

- The hackathon’s own public description identifies Corey Barron as the **former owner of CoreTegrity Logistics**, says he drove a truck across North America, and says he later moved into software development after building more than 200 software projects.
- Corey’s public LinkedIn profile currently describes him as a **Software Consultant** and lists self-employed work as a logistics and technology specialist, plus a current CEO role beginning in June 2026. [www.linkedin.com/in/corey-barron-292272267](https://www.linkedin.com/in/corey-barron-292272267)
- The former carrier can be partially verified through FMCSA. SAFER lists a Kitchener-based entity doing business as **CoreTegrity Logistics** with one power unit and two drivers, i.e. an owner-operator-scale carrier. [SAFER Company Snapshot](https://safer.fmcsa.dot.gov/CompanySnapshot.aspx)
- Practical takeaway: Corey brings firsthand experience with a very small carrier’s financial and operational constraints, while Joe Smelko brings the perspective of a roughly 100-plus-unit fleet. A strong pitch should show how a prototype could work for one dispatcher today and scale across a larger TMW/PeopleNet-style operation.

## 2. A dispatcher’s day at a 50-150 truck Canadian carrier

A dispatcher is the operating link between drivers, customers, brokers, maintenance, and management. Public job descriptions define the role as scheduling drivers and freight, planning routes, reviewing logs, documenting pickup and delivery times, monitoring repairs, and responding when a shipment goes wrong. A typical day looks like this:

- **Morning control check:** review every active load, overnight messages, driver availability, pickup and delivery appointments, equipment status, and HOS remaining. Dispatch training material describes the day as beginning with active-load review and driver check-ins, followed by finding freight for available trucks. [www.loadtraining.com/truck-dispatcher-training/](https://www.loadtraining.com/truck-dispatcher-training/)
- **Load planning:** search DAT, Truckstop, direct customers, and broker relationships; compare rate, commodity, equipment, pickup time, delivery window, deadhead, likely reload, and driver preferences. A good load is not simply the highest rate because a cheap backhaul or HOS problem can destroy the margin. [www.loadtraining.com/truck-dispatcher-training/](https://www.loadtraining.com/truck-dispatcher-training/)
- **Assignment and sequencing:** match the load to the right tractor, trailer, driver, location, hours, and cross-border capability; sequence the next load before the truck empties; send rate confirmations, pickup numbers, appointment details, and special instructions.
- **Live execution:** monitor GPS/ELD status, check whether the truck reached pickup and delivery, recalculate ETA after traffic or weather, and notify customers before an appointment is missed. Dispatchers may also reroute or reassign freight when conditions change. [www.truxnow.com/blog/the-crucial-role-of-a-truck-dispatcher-in-fleet-operations](https://www.truxnow.com/blog/the-crucial-role-of-a-truck-dispatcher-in-fleet-operations)
- **Exception management:** coordinate towing and repair after a breakdown, arrange a relay or replacement truck, communicate with the shipper and receiver, document detention, and decide whether a late delivery needs a customer escalation.
- **Closeout:** collect bills of lading and proof of delivery, update the TMS, prepare billing or settlement documentation, record incidents, and build the next day’s plan.

The most concrete pain points are:

1. **Fragmented systems and re-keying.** At the 50-150 truck scale, a carrier may have multiple systems for load boards, dispatch, billing, tracking, and compliance. One TMS analysis describes carriers still “re-keying loads into a billing tool at midnight,” and says a 100-truck operation becomes fragile when systems do not share data. [www.datatruck.io/blog/tms-vs-dispatch-software-what-carriers-actually-need](https://www.datatruck.io/blog/tms-vs-dispatch-software-what-carriers-actually-need)
2. **HOS-constrained scheduling.** A load can look profitable but be impossible once driving time, on-duty time, border delays, appointments, and mandatory rest are included. Training material specifically warns against loads that push drivers toward HOS violations. [www.loadtraining.com/truck-dispatcher-training/](https://www.loadtraining.com/truck-dispatcher-training/)
3. **Unrealistic ETAs and appointment pressure.** A driver on TruckersReport wrote that dispatchers should not treat computer mileage as real travel time and complained about arriving hours early because dispatch wanted to “buffer” an appointment. [www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/](https://www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/)
4. **Micromanagement and broken home-time promises.** Another driver reported that a dispatcher repeatedly changed loads during home time and shortened the planned break, describing the instruction as “this is trucking.” [www.thetruckersreport.com/truckingindustryforum/threads/dispatcher-problems-maybe.2458663/](https://www.thetruckersreport.com/truckingindustryforum/threads/dispatcher-problems-maybe.2458663/)
5. **Weak handoffs and lost driver context.** In the same TruckersReport discussion, a driver said relief dispatchers failed to pass along medical and personal appointment information. For a larger fleet, missing preferences, restrictions, or promised home time can create avoidable conflict. [www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/](https://www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/)
6. **Detention evidence and recovery.** A Reddit trucking discussion describes dispatchers reporting detention only after the fact, when the broker could no longer help, while drivers and brokers disputed when the clock began. The operational problem is not only calculating detention, but creating a shared arrival, loading, notification, and departure record. [www.reddit.com/r/Truckers/comments/1q0j3a3/detention_denied/](https://www.reddit.com/r/Truckers/comments/1q0j3a3/detention_denied/)
7. **Breakdowns and incident response.** Drivers expect dispatch to ask first whether they are safe, then coordinate towing, repairs, customer updates, and replacement capacity. A TruckersReport contributor specifically criticized a company that asked about the truck but not whether the driver was okay after a fire. [www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/](https://www.thetruckersreport.com/truckingindustryforum/threads/what-do-you-look-for-from-your-dispatcher.133380/)
8. **Last-minute changes and communication overload.** Dispatchers must reorganize the plan when a driver calls in sick, a load cancels, traffic closes a route, or a receiver changes an appointment. TMS-oriented material identifies last-minute schedule changes, communication barriers, driver issues, and regulatory compliance as recurring challenges. [www.truxnow.com/blog/the-crucial-role-of-a-truck-dispatcher-in-fleet-operations](https://www.truxnow.com/blog/the-crucial-role-of-a-truck-dispatcher-in-fleet-operations)
9. **Empty miles and weak reloads.** Dispatchers need to minimize deadhead and protect the next move, not just book the current load. Load-training material calls out short hauls with poor backhaul options and lanes with weak freight density as profitability traps. [www.loadtraining.com/truck-dispatcher-training/](https://www.loadtraining.com/truck-dispatcher-training/)

The strongest solo-project direction is therefore a **dispatcher exception and HOS assistant**: one screen showing which loads are legally and operationally feasible, which appointment is at risk, what evidence is needed for detention, and which next load minimizes empty miles.

## 3. Hours-of-service numbers an algorithm needs

### Canada, south of the 60th parallel

- **Daily driving:** maximum **13 hours**. **Daily on-duty:** maximum **14 hours**. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-1.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-1.html)
- **Daily rest:** at least **10 hours off duty per day**, including at least **eight consecutive hours**. The remaining two hours can be distributed in blocks of at least 30 minutes. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html)
- **Elapsed-time constraint:** no more than **16 hours** may pass between the end of one qualifying eight-hour off-duty period and the beginning of the next. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-1.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-1.html)
- **Cycle 1:** maximum **70 on-duty hours in seven days**. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html)
- **Cycle 2:** maximum **120 on-duty hours in 14 days**, and no more than **70 on-duty hours without taking 24 consecutive hours off duty**. Drivers must also have taken at least 24 consecutive hours off in the preceding 14 days. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html)
- **Cycle reset:** Cycle 1 requires **36 consecutive hours off**; Cycle 2 requires **72 consecutive hours off** before accumulated hours reset. [laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/page-2.html)
- **ELD status:** applicable federally regulated carriers must use an ELD that is tested and certified by an accredited certification body. The main short-haul exception is operation within **160 km of the home terminal**, with the driver returning daily to begin at least eight consecutive hours off duty. [tc.canada.ca/en/road-transportation/electronic-logging-devices/eld-handout-motor-carriers-drivers](https://tc.canada.ca/en/road-transportation/electronic-logging-devices/eld-handout-motor-carriers-drivers) Other regulatory exemptions include certain permits, statutory exemptions, short rentals, and pre-model-year-2000 vehicles. [gazette.gc.ca/rp-pr/p2/2019/2019-06-12/html/sor-dors165-eng.html](https://gazette.gc.ca/rp-pr/p2/2019/2019-06-12/html/sor-dors165-eng.html)

### United States, FMCSA property carriers

- **Driving limit:** **11 hours** after at least 10 consecutive hours off duty. [www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- **14-hour window:** driving may not continue beyond the 14th consecutive hour after coming on duty; off-duty time does not extend that window. [www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- **30-minute break:** a driver must take a 30-minute non-driving break after eight cumulative hours of driving. [www.fmcsa.dot.gov/regulations/hours-of-service](https://www.fmcsa.dot.gov/regulations/hours-of-service)
- **Weekly limit:** **60 hours in seven days** or **70 hours in eight days**, depending on the carrier’s operating schedule. [www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- **Restart:** a driver may restart the seven- or eight-day calculation after at least **34 consecutive hours off duty**. [www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)

A cross-border scheduler should calculate both rule sets, track the driver’s current jurisdiction, preserve local appointment times, and show the reason for every infeasible assignment rather than merely displaying a red warning.

## 4. Competitive landscape: AI dispatch, load planning, and driver apps

**AI dispatch and load planning**

- **Optimal Dynamics:** An enterprise Transportation Decision System that automates driver-to-load and tour recommendations, considering HOS, home time, location, utilization, revenue, and network-wide constraints. It explicitly targets enterprise trucking companies; exact minimum fleet size is **unverified**. [Company site](https://optimaldynamics.com/)  
- **Parade:** Primarily a capacity-management platform for freight brokerages and 3PLs, not a carrier dispatch TMS. Its CoDriver AI handles inbound carrier calls and emails, captures quotes, qualifies carriers, and feeds data into automated booking workflows. Carrier-fleet target size is **not applicable/unverified**. [Parade platform](https://www.parade.ai/)  
- **Trucker Tools:** Serves brokers and carriers through real-time load tracking, carrier sourcing, private load boards, automated negotiations, and “Book-It-Now.” It claims a network of 350,000 unique MCs and 2.5 million app downloads, but its typical carrier fleet-size segment is **unverified**. [Trucker Tools](https://www.truckertools.com/)  
- **McLeod Software LoadMaster:** A full truckload-carrier TMS covering pricing, dispatch, driver communication, telematics, detention, trip planning, settlements, and analytics. Its matching feature evaluates driver availability, location, and delivery requirements; exact fleet-size target is **unverified**, although the product is positioned for carriers scaling operationally. [LoadMaster](https://www.mcleodsoftware.com/who-we-serve/truckload-carriers)  
- **TMW.Suite / Trimble Transportation:** An enterprise TMS for truckload carriers, brokers, 3PLs, and private fleets. The newer Trimble carrier product claims AI-powered order entry, driver-assignment optimization, tender grading, ETA updates, and automated order-to-cash workflows. The target is explicitly enterprise-level, making it relevant to a 100-truck carrier. [Trimble TMS overview](https://transportation.trimble.com/en/solutions/transportation-management)  
- **Rose Rocket:** A configurable TMS for trucking and transportation teams with order management, dispatch, route optimization, tracking, analytics, and customer portals. Its newer AI agents can build orders, optimize routes, flag exceptions, and execute workflow actions from plain-language instructions; fleet-size minimum is **unverified**, but the platform spans smaller operators through enterprise teams. [Rose Rocket](https://www.roserocket.com/)  
- **Alvys:** A carrier, broker, and hybrid-operation TMS covering automated load creation, dispatch planning, driver recommendations, quoting, tracking, documents, accounting, and a driver app. Its algorithms use historical data and lane performance for pricing, while its dispatch planner recommends drivers; Alvys says it supports small, medium, and large entities and reports more than 3,000 MC customers. [Alvys dispatch](https://alvys.com/features/tms-dispatch-software) and [enterprise page](https://alvys.com/enterprise-tms-software)  
- **Samsara:** Its dispatch and routing tools assign jobs, monitor execution, optimize routes, track ETAs, and synchronize dispatch with the Driver App. Samsara’s AI is strongest in telematics, safety-event classification, AI dashcams, and operational assistants; its 2026 Agent Studio adds configurable agents, including automated driver/vehicle identification, but a general-purpose truckload order-to-truck optimizer is **not verified** on the pages reviewed. [Routing and dispatch](https://www.samsara.com/products/telematics/routing) and [AI Agent Studio announcement](https://www.samsara.com/company/news/press-releases/samsara-launches-new-agentic-capabilities-to-automate-tedious-operational-tasks)  
- **Motive:** Targets fleets from roughly 5 to 10 vehicles through companies with thousands of vehicles. Its AI focuses on safety, document capture, fault-code detection, automated alerts, analytics, driver coaching, and the Atlas assistant, which can answer questions, summarize data, alert managers, and support drivers by voice. A network-wide load-assignment optimizer is **unverified**. [Motive fleet platform](https://gomotive.com/products/platform) and [fleet-management scope](https://gomotive.com/products/fleet-management/)  
- **Uber Freight / Powerloop:** Powerloop is a power-only and drop-trailer marketplace for shippers and carriers. Carriers can book individual or bundled loads, while Uber Freight’s algorithms identify round trips and backhauls to improve earnings and reduce deadhead; the site reports 12,500+ Powerloop carriers and 340,000+ loads serviced. [Powerloop](https://www.uberfreight.com/en-US/services/drop-trailer)  
- **Convoy:** Convoy shut down operations on October 19, 2023 during the freight downturn. Flexport acquired its technology stack, not the company or its liabilities, and Flexport later announced the Convoy Platform’s sale to DAT Freight & Analytics in July 2025. Convoy itself should therefore be treated as a technology asset/history, not a live competitor. [FreightWaves report](https://www.freightwaves.com/news/flexport-acquires-convoy-technology-stack-for-undisclosed-sum) and [Flexport update](https://www.flexport.com/blog/update-on-flexports-trucking-business)  

**Newer AI-native entrants**

- **Fleetline:** A Y Combinator Summer 2025 company building a “complete-context” load planner for mid-sized and large fleets. It combines advanced optimization with LLMs so dispatchers can add soft constraints, such as driver preferences or an early home-time request, and rerun the plan. [Y Combinator profile](https://www.ycombinator.com/companies/fleetline)  
- **Numeo:** A carrier-side AI dispatch platform that searches multiple load boards, ranks loads by profitability, drafts broker-negotiation emails, checks routes and tolls, and sends status updates. It claims 5,000+ dispatchers across 500+ companies, but those adoption figures are company-reported. [Numeo](https://numeo.ai/)  
- **Vooma:** Founded in 2023, Vooma provides AI agents for brokers and carriers that extract orders from emails, PDFs, and spreadsheets, build loads, schedule appointments, handle carrier calls, negotiate rates, book freight, and retrieve PODs. It is workflow automation more than a pure mathematical load planner. [Vooma](https://vooma.ai/) and [YC profile](https://www.ycombinator.com/companies/vooma)  

**Driver apps**

- **Samsara Driver:** Combines HOS/ELD, DVIRs, route navigation, dispatch updates, training, event review, GPS tracking, and driver recognition in one app. [Samsara apps](https://www.samsara.com/products/workforce-management/samsara-apps)  
- **Motive Driver:** Provides ELD logs, HOS clocks, assignments, checklists, document workflows, and proactive violation warnings, including support for Canadian HOS rules. [Motive Driver listing](https://apps.apple.com/us/app/motive-driver/id706401738)  
- **Trucker Path:** A driver-oriented community app for truck-safe navigation, parking availability, weigh-station status, fuel prices, truck stops, and load-board access; it claims more than one million truckers. [Trucker Path](https://truckerpath.com/trucker-path-app)  
- **Drivewyze:** Focuses on weigh-station bypass, safety alerts, risk zones, and in-cab coaching rather than dispatch. It advertises 900+ bypass sites and 2,600+ safety hotspots across the US and Canada. [Drivewyze](https://drivewyze.com/)  

**What would look genuinely new to a 100-truck carrier’s GM**

- A **human-approved optimizer** that combines revenue, HOS, equipment, appointments, home time, driver preferences, and customer priority, then explains every tradeoff instead of producing a black-box score. Existing products already cover portions of this problem, so the novelty must be the integrated explanation and fast replanning. [Optimal Dynamics](https://optimaldynamics.com/) and [Fleetline](https://www.ycombinator.com/companies/fleetline)  
- A delay-risk system that does not merely predict “late,” but recommends the cheapest operational action: resequence a stop, swap a truck, notify a customer, or protect a driver’s HOS.  
- A driver-feedback loop where dispatchers can record preferences and exceptions, and the optimizer learns them without silently penalizing drivers or violating safety constraints.  
- An Ontario-first product combining live road events, inspection stations, seasonal-load restrictions, HOS, and order data, rather than another generic US load-board assistant. [Ontario 511 API](http://511on.ca/developers/doc)  
- A judge-friendly “what changed?” simulator showing the GM that accepting Load B instead of Load A would add revenue, reduce empty miles, preserve home time, and lower late-delivery risk.

**Recommendation:** Option A is crowded unless it becomes an explainable, constraint-aware decision system. Option B is the least differentiated because HOS, dispatch, navigation, documents, and safety workflows are already mature. Option C is the safest hackathon opening if it produces recommended interventions and measurable empty-mile or late-load reduction rather than another dashboard.

## 5. Open and synthetic data for prototyping

- **FMCSA public data:** The FMCSA Open Data Program provides a company census file, crash file, inspection files, and Safety Measurement System inputs. The crash file contains roughly 59 data elements about carrier, vehicle, and crash circumstances, while public crash files exclude driver data. The inspection files cover three years of history. These files are public and downloadable without registration; SAFER’s individual Company Snapshot is also free, but it is an ad hoc one-carrier-at-a-time query rather than a convenient bulk dataset. [FMCSA Open Data](https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program) and [SAFER Snapshot](https://safer.fmcsa.dot.gov/CompanySnapshot.aspx)  
- **BTS/FHWA FAF5:** FAF5.7.1 provides origin-destination freight estimates by FAF region, commodity, mode, year, tonnage, value, and ton-miles, covering 2017, recent years through 2024, and forecasts through 2050. Regional and state databases, highway assignments, CSV files, and summary tools are available without registration. It is useful for generating realistic lane demand, commodity mix, and regional-flow priors, but it is not shipment-level dispatch data. [FAF5 download page](https://faf.ornl.gov/faf5) and [FAF5 highway assignments](https://ops.fhwa.dot.gov/freight/freight_analysis/faf/)  
- **Statistics Canada TCOD / Canadian Freight Analysis Framework:** The Trucking Commodity Origin and Destination Survey measures Canadian trucking commodity movements and outputs, with origin-destination, commodity, shipment, and industry estimates. The reviewed TCOD program is inactive and its detailed reference period is 2017, while the related Canadian Freight Analysis Framework table provides province/CMA origin-destination data. The Statistics Canada table can be downloaded as CSV without registration. [TCOD methodology](https://www23.statcan.gc.ca/imdb/p2SV.pl?Function=getSurvey&Id=1243542) and [origin-destination table](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2310014201)  
- **Kaggle Delivery Truck Trips Data:** A small prototype-oriented dataset whose documented fields include `GpsProvider`, `BookingID`, and `Market/Regular`; the complete schema and quality are **unverified** because the Kaggle page was not fully readable. Download without a Kaggle account is **unverified**, and Kaggle commonly requires sign-in for downloads. [Dataset](https://www.kaggle.com/datasets/ramakrishnanthiyagu/delivery-truck-trips-data)  
- **Kaggle Logistics Operations Database:** A synthetic 2022-2024 database with drivers, trucks, trailers, customers, facilities, routes, loads, trips, fuel purchases, maintenance, delivery events, safety incidents, and monthly driver/truck metrics. It includes useful fields such as load weight, pieces, revenue, fuel surcharge, scheduled and actual timestamps, detention, MPG, on-time rate, downtime, and utilization. Download without registration is **unverified**. [Dataset](https://www.kaggle.com/datasets/yogape/logistics-operations-database)  
- **DT-CARGO:** An open GitHub dataset of anonymized truck operations. Its documented fields include vehicle and fleet IDs, vehicle mass and axle class, start/stop time, distance, average and maximum speed, signal loss, home-base status, long-haul status, rest-area and service-area flags, and 10 Hz speed/HDOP samples. The repository and example data are downloadable without registration, but the full speed archive is not linked clearly and full-data availability is **unverified**. [DT-CARGO GitHub](https://github.com/TUMFTM/dt-cargo)  
- **Vehicle telematics dataset:** A Kaggle dataset documented through a GitHub analysis repository with `timeStamp`, `tripID`, `gps_speed`, coolant temperature, diagnostic codes, engine load, intake-air metrics, RPM, throttle position, and `deviceID`. It is useful for fuel/safety-style modeling but is not specifically heavy-truck data, and direct download without registration is **unverified**. [Documentation and analysis](https://github.com/cjporteo/vehicle-telematics-clustering)  
- **Ontario 511:** Ontario 511 exposes real-time and static transportation data for events, construction, cameras, road conditions, truck rest areas, inspection stations, seasonal loads, and alerts. The developer service is free, but it is primarily an API rather than a bulk historical dataset; whether API access requires registration or an API key is **unverified** from the reviewed documentation. [Ontario 511 developer resources](http://511on.ca/developers/resources) and [API documentation](http://511on.ca/developers/doc)  
- **Ontario MTO Commercial Vehicle Survey:** This open Ontario dataset describes truck travel and commodity flows on provincial highways and major corridors, including average daily trips, commodity group, origin, destination, weight, and value in related survey products. It is published under the Open Government Licence and is downloadable without registration. [Ontario Data Catalogue](https://data.ontario.ca/dataset/commercial-vehicle-survey-data-commercial-vehicle-flows-assigned-to-road-network)  

For a one-week prototype, I would combine the synthetic Kaggle operations database for orders and outcomes, DT-CARGO for truck-motion features, FAF5 or MTO data for realistic lane priors, and Ontario 511 for live disruption features. That gives Option C a credible demonstration path before the hackathon’s private data arrives.

## 6. The five promised APIs: what each really offers

### 6.1 Samsara

- **Product:** Samsara is a fleet-telematics and compliance platform covering vehicle GPS, diagnostics, safety, connected drivers, and ELD/HOS operations ([official REST API overview](https://developers.samsara.com/docs/rest-api-overview)).
- **Relevant resources:** Vehicles, vehicle locations, location feeds/history, vehicle statistics and trips, drivers, driver-vehicle assignments, HOS clocks and daily logs, routes, route updates, addresses/geofences, documents/PDFs, safety events, trailers, messages, and webhooks are documented API areas ([resource overview](https://developers.samsara.com/docs/rest-api-overview), [route reference](https://developers.samsara.com/reference/getroutesfeed), [location reference](https://developers.samsara.com/reference/getvehiclelocationshistory)).
- **Orders, loads, and rates:** Samsara is not a freight load board or rate marketplace, but route stops can contain order tasks, so it can support dispatch execution around an order that your own application owns ([route reference](https://developers.samsara.com/reference/fetchroute)).
- **Auth and base URL:** Requests use a Bearer token, supplied either as a dashboard-generated API token or an OAuth 2.0 access token; the standard base is `https://api.samsara.com`, with `https://api.ca.samsara.com` documented for Canadian deployments ([authentication](https://developers.samsara.com/docs/authentication), [API servers](https://developers.samsara.com/reference/getroutesfeed)).
- **Developer access:** Samsara offers a partner application process and a non-production sandbox. You apply through the [Partner Programs application](https://www.partners-samsara.com/s/login/SelfRegister?language=en_US); approval is reviewed on a weekly basis and may take 5–7 business days ([application process](https://developers.samsara.com/docs/application-process)). A sandbox organization is added to the developer portal after approval ([partner portal](https://developers.samsara.com/docs/partner-developer-portal)). Simulated GPS vehicles are available by support request, but the official documentation currently says that provisioning is temporarily unavailable because of a known issue, so guaranteed usable demo data is **unverified** ([sandbox documentation](https://developers.samsara.com/docs/sandboxes)).
- **Postman and SDKs:** Samsara has an [official Postman workspace](https://www.postman.com/samsara-api/samsara-api-s-public-workspace/documentation/eso9w2v/samsara-api), official [Python and TypeScript SDKs](https://developers.samsara.com/docs/sdks), and additional Java and .NET SDKs.
- **Rate limits:** The global ceiling is 150 requests/second per token and 200 requests/second per organization; endpoint-specific limits are often lower, including common 5 requests/second and 100 requests/minute categories ([rate limits](https://developers.samsara.com/docs/rate-limits)).
- **Hackathon use:** Build a live dispatch board that combines vehicle locations, HOS availability, route progress, driver assignments, and webhook-driven alerts.

**Practical verdict:** This is the strongest candidate if the organizers provide a working sandbox or customer token. Independent access is possible, but the approval timeline is risky for a one-week event.

### 6.2 Motive

- **Product:** Motive, formerly KeepTruckin, provides fleet management, ELD/HOS compliance, vehicle tracking, driver safety, inspections, messaging, and reporting APIs ([official developer portal](https://developer.gomotive.com/)).
- **Relevant resources:** The public API lists users/drivers, vehicles, Vehicle Gateway devices, groups, vehicle and driver locations, HOS logs, HOS violations, available driver time, dispatches, dispatch locations, inspection reports, IFTA reports, fault codes, driver-performance events, messaging, and webhooks ([official API categories](https://developer.gomotive.com/)). Dispatch records contain drivers, vehicles, shippers, consignees, stops, dates, weight, and related freight fields ([create-dispatch reference](https://developer-docs.gomotive.com/reference/create-a-new-dispatch)).
- **Locations and HOS:** Vehicle-location endpoints provide current or last-known positions and support pagination; HOS endpoints expose logs, violations, and available time ([vehicle locations](https://developer-docs.gomotive.com/reference/fetch-a-list-of-all-the-vehicles-and-their-locations-v2), [HOS logs](https://developer.gomotive.com/reference/list-the-hours-of-service-hos-logs-of-the-drivers), [available time](https://developer-docs.gomotive.com/reference/fetch-a-list-of-drivers-with-available-time)).
- **Orders, rates, and documents:** Motive exposes dispatch and inspection/document workflows, but a public freight-marketplace rate API or load-board search resource is **unverified** ([API reference index](https://developer.gomotive.com/)).
- **Auth and base URL:** Server-to-server integrations can use an organization API key in the `X-API-Key` header; the documentation also shows OAuth 2.0 bearer-token examples. The current base is `https://api.gomotive.com`; `https://api.keeptruckin.com` remains supported ([authentication](https://developer-docs.gomotive.com/docs/authentication), [base URL notice](https://developer-docs.gomotive.com/docs/introduction)).
- **Developer access:** A developer account can be created from [Get Started](https://developer-docs.gomotive.com/docs/get-started). For test data, Motive documents creating a test application and dummy fleet, then contacting Motive to associate the application ID with that fleet ([prerequisites](https://developer-docs.gomotive.com/docs/prerequisites)). API keys also have a Test Mode intended to prevent changes to live data ([authentication](https://developer-docs.gomotive.com/docs/authentication)).
- **Postman and SDKs:** Motive says Postman collections are being added to individual guides and endpoints ([documentation update](https://helpcenter.gomotive.com/hc/en-us/articles/24625779420061-API-Documentation-Update)). An official JS/TS or Python SDK was not verified; use REST plus the portal’s code samples unless Motive supplies one.
- **Rate limits:** Motive’s public terms allow it to impose or change transaction limits, but a numeric public rate limit was not found; treat limits as **unverified** ([API terms](https://gomotive.com/legal/api-terms-of-service/)).
- **Hackathon use:** Build an HOS-aware dispatch recommender that assigns available drivers and vehicles to dispatches, then flags HOS violations or gateway disconnects through webhooks ([webhook reference](https://developer-docs.gomotive.com/reference/overview-company-webhooks)).

**Practical verdict:** Motive is independently approachable and more hackathon-friendly than DAT or TruckMate, but dummy-fleet association may require Motive support.

### 6.3 Trimble TruckMate

- **Product:** TruckMate is Trimble’s transportation-management system for carrier dispatch, operations, accounting, orders, trips, and related back-office workflows ([official introduction](https://developer.trimble.com/docs/truckmate)).
- **Relevant resources:** The REST API documents orders, rate quotes, accessorial charges, trips, stops, drivers, power units, trailers, equipment, GPS position updates, appointments, reports, documents, imaging documents, PODs, transit times, web users, and cloud events ([TruckMate API reference](https://developer.trimble.com/docs/truckmate/tools/api/truckmate), [OpenAPI download](https://truckmatecloudhub.trimble-transportation.com/tm/openapi.json)). Master Data separately covers client, vendor, driver, site, zone, and commodity records ([Master Data API](https://developer.trimble.com/docs/truckmate/tools/api/master-data/)).
- **Auth and base URL:** TruckMate uses Bearer authentication with either a TruckMate API key or a time-sensitive JWT from the login endpoint. The service path is `/tm`, but the host is the customer’s self-hosted or single-tenant API Server domain, not a universal public base URL ([access and authentication](https://developer.trimble.com/docs/truckmate/guides/access)).
- **Access and tooling:** The API requires an existing TruckMate installation and separate licensing; Trimble’s official [Postman workspace](https://www.postman.com/trimble-inc/transportation-truckmate/overview) and OpenAPI specification exist, but no public sandbox, free developer account, or demo dataset was verified.
- **Rate limits and SDKs:** Numeric limits and official JS/TS or Python SDKs were not found; the documentation recommends pagination, backoff, and treating HTTP 429 as a slowdown signal ([integration best practices](https://developer.trimble.com/docs/truckmate/guides/access)).
- **Hackathon use:** If supplied with a licensed instance, build an order-to-trip workflow that assigns drivers/equipment, pushes GPS positions, and displays POD/document status.

**Practical verdict:** Not independently realistic in one week. It becomes viable only if organizers provide a reachable hosted instance, license, credentials, and sample records on day one.

### 6.4 DAT Freight & Analytics

- **Product:** DAT operates a North American truckload marketplace and freight-rate intelligence products, including DAT One and RateView ([DAT API integration page](https://www.dat.com/api-integration), [RateView API article](https://www.dat.com/blog/how-dats-integration-ecosystem-transforms-freight-rate-intelligence-for-modern-shippers)).
- **Relevant resources:** DAT publicly describes APIs for load-board search, freight posting, BookNow, DAT Tracking, and RateView rate lookups; the public pages do not expose the full endpoint list or schemas ([API integration](https://www.dat.com/api-integration)). Vehicle, driver, ELD, and fleet-telemetry resources comparable to Samsara or Motive are **unverified**.
- **Auth and base URL:** DAT requires organization-level service-account authentication followed by user-level authentication, with the service account provisioned by DAT ([service-account FAQ](https://one.support.dat.com/9-troubleshooting-2734b01a/service-accounts-and-restful-api-faq-7c689bc5)). The exact token headers, production base URLs, SDKs, and rate limits are **unverified** without access to the gated [developer portal](https://developer.dat.com/_/login).
- **Access model:** A DAT load-board subscription is required for load-board REST integration; RateView API access requires RateView Combo Pro or Combo Premium, plus appropriate Connexion and product seats ([DAT subscription requirements](https://one.support.dat.com/9-troubleshooting-2734b01a/service-accounts-and-restful-api-faq-7c689bc5)). The portal requires an account, and DAT directs access questions to `developersupport@dat.com` ([DAT integration page](https://www.dat.com/api-integration)). A free sandbox or demo dataset was not verified. A public Postman workspace exists, but it does not establish that usable credentials or test data are available ([Postman workspace](https://www.postman.com/it-sys/dat-s-api-documentation/overview)).
- **Hackathon use:** With credentials, build a lane-ranking tool combining live load search, BookNow eligibility, and RateView benchmark comparison.

**Practical verdict:** Assume unavailable unless organizers provide an active DAT subscription, service account, seats, credentials, and permitted API products.

### 6.5 Loadlink Technologies

- **Product:** Loadlink is a Canadian and cross-border freight load board with load/truck matching and a separate Rate Index product ([official homepage](https://loadlink.ca/)).
- **What the product exposes:** The web product supports searching by origin, destination, equipment type, and load size; it advertises live load updates, truck posting, broker/company information, and a driver app for sending delivery confirmations ([carrier load-board page](https://loadlink.ca/carrier-loadboard)).
- **Public API status:** I found no official public developer portal, REST reference, OpenAPI specification, sandbox, or documented webhook surface for Loadlink Technologies. Therefore public API resources, exact data exposure, auth style, base URL, rate limits, SDKs, and Postman collection are **unverified**.
- **Access:** The official site directs prospective users toward a demo/contact flow rather than self-serve API registration ([contact page](https://loadlink.ca/get-in-touch)). Any partner or enterprise integration route is **unverified**.
- **Hackathon use:** If Loadlink grants partner credentials, build a Canadian load/truck matching screen with Rate Index comparison; otherwise use synthetic Loadlink-shaped records for the demo.

**Practical verdict:** Treat Loadlink as the least independently accessible option. Do not design the core demo around it.

## 7. If none of the promised APIs arrive in time

- **Routing and distances:** Use OpenStreetMap data with the public OSRM routing service for driving routes, distances, durations, and geometry; OSRM documents HTTP, Node.js, and Python usage ([OSRM documentation](https://project-osrm.org/docs/)).
- **Carrier and safety data:** Use the FMCSA QCMobile API for U.S. carrier records and safety information; it provides a free API key after creating a developer account ([FMCSA API access](https://mobile.fmcsa.dot.gov/QCDevsite/docs/apiAccess), [QCMobile API](https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi)).
- **Weather and disruption signals:** Open-Meteo provides a free JSON weather API with forecasts, archives, and no sign-up, suitable for adding weather-aware ETA or risk scoring ([Open-Meteo](https://open-meteo.com/), [API documentation](https://open-meteo.com/en/docs)).

For a one-week solo project, the safest architecture is to make fleet, driver, HOS, and load data provider-neutral, seed it with synthetic records, and plug in Samsara or Motive only when credentials are confirmed.
