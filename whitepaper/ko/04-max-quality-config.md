# 4 · 최대 품질 구성 (비용 무제한)

이것은 [§3](03-results.md)의 핵심 결과 뒤에 있는 레시피로, **정확성이 비용보다 중요할 때**
도달해야 할 구성이다: 보안이 중요한 리뷰, 릴리스 게이트, 스펙 최종 승인, 되돌릴 수 없는
마이그레이션 같은 경우다. 이 구성은 의도적으로 비싸다. 일상적인 작업에는 대신 저렴한
프롬프트 정합 단일 에이전트(prompt-matched single agent)를 사용하라
(참조 [§4.4](#44-when-not-to-use-this)).

측정된 구성은 **ULTRA V1**이다: 견고한 5심판단(5-judge panel) 하에서 정밀도(precision) ≈ 0.63으로
심어둔 결함(defect) **18/18**개를(심층 추론(deep-reasoning)을 포함한 모든 계층(stratum)) 잡아냈으며 —
*n=6 저자 심어둔(author-planted) 픽스처(fixture)에서(단일 생성 실행(single generation run);
생산성이 아니라 결함 탐지(defect-catch) 결과다 — 참조
[§6.1](06-limitations.md))* 모든 더 저렴한 구성과 모든 동일 계열(same-family) 패널을 앞섰다.
결정적으로, **V1이 "더 큰" V2를 이겼다**: 생성을 더 추가하니 오히려 손해였다. 아래 레시피는
V1이며, "과도하게 만들지 말라(do not over-build it)"는 주석은 핵심을 담고 있다(load-bearing).

---

## 4.1 레시피

```
GOAL: maximize defect recall without drowning in false positives, cost no object.

1 · DIVERGE AS WIDE AS POSSIBLE  (this is where recall comes from)
    • a same-family lens panel: one skeptic per failure-mode lens
      (correctness · contract · concurrency/TOCTOU · auth · numeric/precision ·
       parser/identifier · resource), each in its own fresh context
    • a few deep-reasoning draws: same model, "hunt only the subtle, non-obvious flaw"
    • AT LEAST ONE genuinely different-weights model (GPT and/or Gemini) running the
      same wide pass — it catches a class the same family structurally cannot
    → union everything. Expect it to be noisy and duplicated. That is correct.

2 · ADJUDICATE HARD WITH ONE STRONG INDEPENDENT MODEL  (this is where precision comes from)
    • a single top reasoner (here GPT-5.2), given the artifact + the full candidate union
    • job: dedupe, merge near-duplicates, DROP false positives / speculation / style nits
    • keep the subtle real ones
    → a clean confirmed list (~5–6 per artifact)

3 · (OPTIONAL) REFUTE TO TIGHTEN PRECISION
    • two independent cross-model refuters, "both must refute to drop" (conservative —
      protects recall). In our run it dropped ~nothing, confirming the list was robust.

4 · DO NOT ADD A SECOND GENERATION ESCALATION
    • measured: adding a GPT-5.2 deep-generation pass on top (V2) LOWERED recall 18→16.
      More candidates crowd the adjudicator's output budget and push out real catches.
      Wider generation has diminishing — then negative — returns once the adjudicator
      saturates. Stop at step 2.
```

한 문장으로: **모델 전반에 걸쳐 넓게 발산(diverge)하고, 그다음 강하게 판정(adjudicate)하라 —
그리고 거기서 멈춰라.**

---

## 4.2 각 요소가 핵심인 이유 (취향이 아니라 증거로부터)

- **동일 계열 패널을 키우는 것이 아니라, 교차 모델(cross-model) 생성.** 통제된 A/B 실험은
  동일 계열 패널이 재현율(recall)에서 자체 통제군(control)을 이기지 못함을 보여줬다. ULTRA의
  추가 재현율은 *추출 횟수(draw count) + 렌즈 분류 체계(lens taxonomy) + 다른 가중치(different
  weights)*에서 나오며, 다른 가중치 모델은 동일 계열 구성으로는 구조적으로 대체할 수 없는
  부분이다(주장 C1).
- **투표가 아니라, 단일의 강한 판정자(adjudicator).** 정밀도는 한 유능한 모델이 산출물을 잡음이
  많은 전체 합집합(union)과 대조해 읽고 강하게 잘라냄으로써 회복된다. 이것이 "추출이 가장 많이
  잡았지만 정밀도가 가장 나빴다"를 "가장 많이 잡으면서 *동시에* 깨끗하다"로 바꾸는 단계다.
- **생성 라운드는 1회에서 멈춰라.** V2가 그 증거다: 판정자가 병목인 순간, 더 하는 것은 더
  나쁘다.
- **패널로 채점(judge)하고, 다수결을 보고하라.** 단일 심판 분산(single-judge variance)은 실재한다
  (동일 리스트에서 17 대 18). *생성*이 아니라 *채점*에는 ≥3개의 교차 모델 심판을 쓰고 다수결로
  결정하라. (운영(production)에서는 정답 키(key)에 맞춰 채점하지 않는다 — 그러나 교훈은 유효하다:
  단일 모델의 판정은 잡음이 많으니, 상관성을 줄여라(decorrelate).)

---

## 4.3 이것이 배포된 레포(repo)에 어떻게 매핑되는가

위 형태는 정확히 오케스트레이션(orchestration) 계층의 **`adversarial-verify` + 교차 모델
(`xverify`)** 레시피를 조합한 것이다: 넓은 동일 계열 패널과 심층 추출(deep draws)은 Workflow
레시피이고, 다른 가중치 모델은 서브시스템 **C**(기본적으로 꺼짐, `fusion-server.js`)이며,
판정/반박(refute) 단계는 합집합에 대한 강한 모델 패스(pass)다. 교차 모델 갈래(arm)는 **기본적으로
꺼진 상태**이며 **런타임 RED 게이트(runtime RED gate)를 결코 건드리지 않는다**(주장 C3) — 이
백서에서는 *정답 키에 대조한 측정*에 사용되며, 이는 라이브 게이트(live gate)와는 다른 설정이다.

레포가 아직 **배포하지 않은** 것은 외부 키(external keys)로 네 단계 전부를 연결하는 단일 명령
"ULTRA" 래퍼(wrapper)다; [§7 재현](07-reproduce.md) 스크립트가 현재의 경로다. 그 래퍼를
("생성 라운드 1회에서 멈춰라" 가드를 내장한 채로) 패키징하는 것이 자연스러운 다음 산출물이다.

---

## 4.4 이것을 사용하지 *말아야* 할 때

- **일상적인 리뷰 / 빠른 점검.** **프롬프트 정합 단일 에이전트(prompt-matched single agent)**(A2)를
  사용하라: 에이전트 하나, 전체 렌즈 메뉴, 컨텍스트 하나. 이것이 ~1/5 비용으로 재현율의 대부분을
  잡아냈다([§3.2](03-results.md)). ULTRA의 ~13개 에이전트/산출물 + 심판단은 여기서 과잉이다.
- **쉽거나 포화된 과제.** 단일의 강한 패스가 이미 모든 것을 잡는다면, 추가 에이전트는 순전히
  비용일 뿐이다(시드 픽스처(seed-fixture) 결과). 단독 패스가 놓치는 여지(headroom)가 있는 곳에만
  예산을 써라.
- **토큰/실시간(wall-clock) 비용 보장이 필요할 때.** 아직 계측되지 않았다
  ([§6.5](06-limitations.md)); ULTRA는 측정된 ROI가 아니라 *위험 부담(stakes)*으로 정당화된다.
