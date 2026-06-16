# 5 · 합의 및 주장 원장(ledger) (현재 상태)

이 프로젝트가 내세우는 모든 핵심 주장(load-bearing claim)은 **다중 페르소나 +
다중 모델** 적대적 합의 루프를 거쳤다. Claude 전문가 페르소나들 *그리고* 가중치가 다른
모델들(GPT, Gemini)이 각 주장을 공격하며, 어떤 주장이 살아남으려면 **양쪽** 계열 모두로부터의
가장 강력하고 타당한 비판을 견뎌내야만 한다. 이 페이지는 현재의, 단단해진(hardened)
상태다. 원래의 라운드별 상세 기록(3라운드, ~81건의 발견사항)은
[`docs/PUBLICATION-READINESS.md`](../../docs/PUBLICATION-READINESS.md)에 있으며, 이 문서는
그것을 통합한 원장에 최신(ULTRA) 검증 라운드를 더한 것이다.

> **구속력 있는 자세(binding posture).** 스캐폴딩(scaffolding)은 기본 역량에 대한 곱셈
> 인자(multiplier)이지, 결코 그 대체물이 아니다. 방향은 메커니즘에서 나오고, 크기(magnitude)는
> 오직 사전등록된(pre-registered), 모델 교체(model-swap), 조건 은닉(condition-blind) A/B에서만
> 나온다. 대외적으로 내세우는 얼굴은 공개된 한계 목록(limitations list)이지, 무결성(invulnerability)
> 주장이 아니다.

---

## 5.1 주장 목록과 처분(disposition)

### 서브시스템 A — 행동 프로파일(behavioral profile)
| # | 주장 | 상태 |
|---|-------|--------|
| A1 | 출력 스타일(output style)은 세션 시작 시 고정된다. 프로파일은 작업 방식(working style)을 조향(steer)하는 것이지 지식/추론을 조향하지 않는다 | 유지(holds) |
| A2 | 스타일(STYLE)의 이식(transplant). 역량(capability)은 가중치(weights) 안에 있으며 이식되지 않는다 | 유지(holds, 핵심 주장) |
| A3 | 결과(outcome)에 대해서는 미검증. leaktest는 4개의 표면 프록시(surface proxy)를 측정하며, 스스로 한계를 명시함(self-disclaimed) | 유지(holds, 공개됨) |
| A4 | 훅(hook)은 페일세이프(fail-safe)이고, 토글 가능(`FABLE_PROFILE=off`)하며, 되돌릴 수 있다. 숨겨진 추론을 결코 그대로 출력(echo)하지 않는다 | 유지(holds) |

### 서브시스템 B — 오케스트레이션(orchestration)
| # | 주장 | 상태 |
|---|-------|--------|
| B1 | 오케스트레이션은 출력-스타일 계층이 아니라 Workflow 계층에 속한다(소스에서 검증됨) | 유지(holds) |
| B2 | 레시피(recipe)는 실제 프로그램이다(진짜 `parallel()` 배리어, 스키마-강제 출력, JS 게이트). 헤드라인을 "실행된 제어 흐름(executed control-flow)이지 산문(prose)이 아니다"에서 "컨텍스트 격리(context-isolation) + 분해(decomposition)가 도움이 된다"로 **강등(demoted)** | 유지(holds, 강등됨) |
| B3 | 스캐폴딩은 기본 역량을 곱한다. 천장(ceiling)은 "Fable에 더 가까운" 것이지, 결코 "동등한(equal)" 것이 아니다 | 유지(holds) |
| B4 | 사전등록된 A/B가 비저하(non-degraded) 비용에서 재현되고 심판이 채점한(judge-scored) 이득을 보여주기 전까지는 **어떤 크기/생산성 수치도 주장하지 않는다** | 유지(holds, 핵심 주장) |
| B5 | RED 런타임 게이트(runtime gate)는 리프(leaf) 수준에서는 게임 불가(ungameable)이지만 오케스트레이터(orchestrator) 수준에서는 게임 가능하다. 증거 품질은 오프라인에서만 채점된다 | 유지(holds) |
| B6 | 이 계층은 3라운드의 적대적 검증을 거치며 도그푸딩(dogfooding)되었다(저자 증언; 이제 런타임 스모크 테스트가 스텁(stub)을 통해 계약(contract)을 커버함) | 유지(holds, 한정적) |

### 서브시스템 C — 교차 모델 검증(cross-model verification)
| # | 주장 | 상태 |
|---|-------|--------|
| C1 | 동일 계열(same-family) 패널은 상관된 사각지대(correlated blind spot)를 공유한다. 가중치가 다른 모델은 그 패널이 구조적으로 잡을 수 없는 한 부류(class)를 잡아낸다 | 유지(holds, [§4](04-max-quality-config.md)의 근거) |
| C2 | 기본적으로 꺼져 있음(off by default). 꺼져 있을 때 에이전트/네트워크/오버헤드가 전혀 없다(검사된 플래그가 아니라 인자(argument)의 부재) | 유지(holds) |
| C3 | 교차 모델 평결(verdict)은 보너스 커버리지다. RED 게이트를 결코 바꾸지 않으며, A/B 심판(judge)을 결코 바꾸지 않는다(누설(leak) 방지) | 유지(holds) — **[§3](03-results.md)의 심판단(judge-panel)은 정답키(key) 대비 측정(measurement)이지 실시간 게이트(live gate)가 아님에 유의** |
| C4 | 네트워크/키가 노출되는 유일한 표면은 제로 의존성(zero-dep)의 `fusion-server.js`다(내장 fetch, postinstall 없음) | 유지(holds) |

### 서브시스템 D — 법무 / 출처(provenance)
| # | 주장 | 상태 |
|---|-------|--------|
| D1 | 상표(trademark) 비제휴(non-affiliation) 고지가 존재한다(명목적 사용, nominative use) | 유지(holds) |
| D2 | 출처는 아카이브된 공개 스냅샷에 고정(pinned)되어 있다 | **미해결(OPEN)** — 여전히 라이브 URL + 로컬 캐시에 의존. 해당 주장에 대한 출시 차단 요소(launch blocker) |
| D3 | 누설/독점(proprietary) 콘텐츠를 재배포하지 않는다(교차 확인만, 공개됨) | 유지(holds) |
| D4 | 실제 저작권자(copyright holder)가 명시되어 있다 | 유지(holds) |

### 지향적 명제(aspirational theses) — 둘 다 강등(DEMOTED)됨 (만장일치, 라운드 1)
- **T1 (비판 저항성, criticism-resistance) → 보장이 아니라 과정(process).** 이 프로젝트는
  비판을 *선제적으로 인정(pre-concede)*하려 *노력*한다(리뷰어가 제기하는 어떤 빈틈도
  인정/수정/반박될 때까지 차단 요소다). 그러나 타당한 비판이 존재하지 **않는다**고
  주장하지는 않는다. 이 표현은 오직 내부 규율(internal discipline)일 뿐이다 — 문서의
  겸손함을 형성할 뿐, 대외적 자랑(boast)으로 결코 등장하지 않는다.
- **T2 (생산성, productivity) → 메커니즘 뒷받침이 있는 가설(hypothesis). 크기는 미측정,
  반증 가능(falsifiable).** 비용 방향(cost-direction)(패널이 단위 비용당 강력한 단독
  패스(solo pass)를 이기는가?) 또한 메커니즘만으로는 확립되지 않는다. `caught_per_agent`는
  에이전트 개수(agent-count) 프록시이며, 토큰/실시간(wall-clock) 비용 방향은 런타임이
  제공할 수 없는 호출지점(call-site) 캡처가 필요하다.

---

## 5.2 검증 라운드 (요약)

- **라운드 1** — 소스를 검증하는 Claude 페르소나 7명 + codex GPT + GPT-4o + Gemini-flash.
  ~81건의 발견사항. 두 건의 적대적 발견사항은 **소스에서 반박(refuted)**되었다(실패한 공격으로,
  증거와 함께 기록됨). 4건의 차단 요소(blocker) + ~20건의 메이저(major)를 산출.
- **라운드 2** — 페르소나 6명 + 3개 모델, 내구성(durability) 재공격. 대부분 라운드 1
  수정사항의 **불균등한 전파(uneven propagation)**(문서↔코드 드리프트)를 발견. 새로 살아남은
  차단 요소는 없음.
- **라운드 2.5** — 소유자(owner) 승인 하에 **코드 배치(batch) 적용**(테스트 통과): EXEMPT_RE
  허용목록(allowlist); 4-암(arm) 하니스(ML-1/ML-4 교란 요인을 격리); 런타임 스모크 테스트;
  불변(immutable) MCP 복사본 + 결정론적(deterministic) 제거(uninstall).
- **라운드 3** — 페르소나 4명 + 3개 모델, 수렴(convergence). codex는 **수렴 / 0건 발견**.
  GPT-4o + Gemini는 "생존(survives)". 살아남은 유일한 항목: 한 건의 **문서↔코드 동기화
  드리프트**(과소 주장, under-claiming)로, 수정됨.

**라운드 3 평결:** *한정되고 사전 인정된 주장(bounded, pre-conceded claims)을 단 채로 출판
가능* — 비판에 무적(criticism-proof)이 아니며, 생산성-크기(productivity-magnitude) 주장은
없다. 방어 가능한 대외 자세는 메커니즘 + 정직한 한계 목록 + 반증 가능한 하니스다.

---

## 5.3 ULTRA 검증 라운드 (이 백서)

동일한 적대적 규율에 네 번째 질문을 던졌다: *비용에 제약이 없다면, 품질 천장(quality
ceiling)은 어디이며, 그것이 엄격한 심사(judging)를 견디는가?*

- **생성(Generated)**: 폭넓은 교차 모델 후보들 → GPT-5.2로 **판정(adjudicated)** → **5개 모델
  교차 계열 패널(cross-family panel)**로 심사(judged)(다수결, majority vote). 단일 심판
  분산(single-judge variance)을 무력화하기 위해 특별히 이렇게 구성함.
- **결과를 세 가지 방식으로 적대적 스트레스 테스트**하고, 각각이 발견한 바를 기록:
  1. **단일 vs 패널 심판**(이전 모델 런) — 단일의 엄격한 심판은 17/18이라 했고, 패널 다수결은
     **18/18**이라 했다. 교훈: 단일 심판을 결코 헤드라인으로 삼지 말 것. (보고된 수치 = 패널;
     최신 모델 런은 패널 채점으로 16/18 @ 0.74 정밀도(precision) — [§3.3](03-results.md) 참조.)
  2. **에스컬레이션(더 강하게 밀어붙이기)** — GPT-5.2 심층 생성(deep-generation) 패스를
     추가했더니 재현율(recall)이 16/18로 *낮아졌다*. **실패한** 개선 시도로 기록됨. 더
     단순한 구성이 승자다.
  3. **반박 패스(refute pass)** — 두 개의 독립적인 교차 모델 반박자(refuter)가 확정된
     결함(defect)을 **0건** 떨어뜨렸다(V2: 33/33 유지; V1도 마찬가지). 심지 않은(non-planted)
     "거짓 양성(false positive)"이 반박을 견뎌냈다 → 그것들은 진짜 추가 결함이므로, 정밀도(precision)
     0.63은 환각률(hallucination rate)이 아니라 **불완전한 정답키(incomplete key)에서 나온
     하한(floor)**이다.

**ULTRA 라운드 평결.** 그 결과는 한정된 자세(bounded posture)를 압박하기는커녕 오히려
**강화한다(strengthens)**: 이는 엄격하게 심사된 **결함 포착(defect-catch)** 천장 결과(T-급
버그 재현율)이며, 솔깃한 모든 과대 주장(overclaim)을 선제 차단했다 — 이것은 T2(생산성)나
B4를 **건드리지 않으며**, 자체 통제군(controls)을 통해 "병렬 구조가 이긴다(parallel structure
wins)"라는 해석을 명시적으로 **반박한다**([§3.2](03-results.md)). 여기에 있는 어떤 것도 강등된
명제를 다시 끌어올리지 않는다.

---

## 5.4 여전히 미해결 (이월됨, 종결 아님)

- **D2** 아카이브된 출처 스냅샷 — "공식 가이드에서 증류됨(distilled from official guidance)"
  주장에 대한 출시 차단 요소(launch blocker).
- **토큰/실시간(wall-clock) 비용 방향** — Workflow 런타임이 제공할 수 없는 호출지점(call-site)
  계측(instrumentation)이 필요함.
- **개발자 대상 생산성 A/B** — 미실행. T2를 근거 지을 수 있는 유일한 것.
- 마이너: RESEARCH 소스 표 → 부록(appendix)으로; 전체 README 길이 축소.
