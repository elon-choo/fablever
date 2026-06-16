# 2 · 방법론 — 이 폴더의 모든 수치가 어떻게 산출되었는가

여기 있는 어떤 것도 직관에 기대지 않는다. 오케스트레이션(orchestration)의 가치에 관한 각 주장은
**심어 둔 정답(ground-truth) 픽스처(fixture)에 대해 실제로 실행된 측정**에서 나오며, 작업자(worker)와는
다른 모델들이 채점하고 (대표 수치의 경우) 단일 채점자가 아니라 **패널(panel)**이 판정한다. 이 페이지는
회의론자가 재현하거나 공격할 수 있도록 그 측정 기계장치를 문서화한다. 정직한 한계는 각주로 미루지 않고
본문에 그대로 명시한다.

---

## 2.1 반증 가능하도록 진술한 질문

지향하는 명제는 *"오케스트레이션은 작업자 모델이 더 많은 / 더 나은 결함(defect)을 찾게 한다"*이다. 그
문장은 서로 다른 네 가지를 숨기고 있으며, 그 각각이 어떤 이득의 진짜 원인일 수 있다:

1. **병렬 구조(parallel structure)** — N개의 독립 에이전트가 동시에 실행되는 것 대 단일 에이전트.
2. **렌즈 분류 체계(lens taxonomy)** — 탐색을 분해하는 회의자별 프롬프트("경쟁 상태(race)를 찾아라",
   "인증(auth) 버그를 찾아라")로, 에이전트가 *몇 개* 실행되는지와는 무관하다.
3. **표본 추출 횟수(draw count)** — N개의 샘플링된 완성본이 단지 분산만으로도 1개보다 더 많이 잡는다.
4. **교차 모델 가중치(cross-model weights)** — 진정으로 다른 모델(GPT, Gemini)은 같은 계열의 패널이
   구조적으로 볼 수 없는 부류의 결함을 본다.

이들을 분리하지 않는 측정은 사실은 표본 추출 횟수였던 이득을 "병렬 구조"의 공으로 돌리게 된다. 그래서
설계가 이들을 **분해(ablate)하여 떼어 놓는다**.

---

## 2.2 통제된 A/B (구조를 그 교란 요인들로부터 분리한다)

작업자 모델은 **고정**된다. 같은 픽스처에서 실행되는 네 개의 군(arm)에 걸쳐 오케스트레이션 **구조**만
바뀐다:

| 군 | 무엇이 실행되는가 | 분리하는 것 |
|-----|-----------|-----------|
| **A** — 베이스라인 | 하나의 메가 에이전트, 하나의 컨텍스트 | 바닥(floor) |
| **A2** — 프롬프트 일치 | 하나의 에이전트, **모든** 렌즈, 하나의 컨텍스트 | 렌즈 **분류 체계** (추가 에이전트 없음) |
| **A_N** — 표본 추출 일치 | N개의 범용 표본 추출, 발견 사항의 합집합 | **표본 추출 횟수** (렌즈 분해 없음) |
| **B** — 패널 | N개의 독립적인 렌즈 회의자(병렬) | **병렬 구조** |

- **지표:** `caught_per_agent` — 에이전트 수로 정규화한, 잡아낸 결함 수. Workflow 런타임은 `Date.now`도
  토큰 사용량도 노출하지 않으므로, 이는 토큰/벽시계(wall-clock) 비용이 아니라 **에이전트 수 기반 비용
  대리지표(cost proxy)**이다. 사과 대 사과 비교는 에이전트 수가 일치하는 군 사이에서만 성립한다. (이 한계는
  COST-3/COST-6으로 추적되며 숨기지 않는다.)
- **위약 판별기(placebo discriminator):** 작업자를 Opus→Sonnet으로 교체한다. *구조적* 이득은 교체에도
  지속되고, *위약*(한 모델의 특이성이 만든 산물)은 사라진다.
- **정답:** **심어 둔** 결함을 가진 산출물들의 픽스처이며, 각 결함은 계층(stratum)별로 라벨링된다 —
  **a** = 모순/계약 위반(contradiction/contract violation), **b** = 누락(omission), **c** =
  심층 추론(deep-reasoning)(미묘하고 표면적으로는 멀쩡해 보이는 것). 재현율(recall)은 계층별로
  측정된다.

이것이 `eval/ab-harness.mjs`에 들어 있는 군 집합이다. 그 목적은 **반증(falsification)**이다 — "패널은
순전히 비용일 뿐"이라고 말할 수 있도록 만들어졌으며, 포화된 시드(seed) 픽스처에서 실제로 바로 그렇게
**말했다**.

---

## 2.3 ULTRA 파이프라인 (비용을 따지지 않는 구성)

위의 A/B는 "구조가 대략 동일한 비용에서 단독 에이전트를 이기는가?"를 묻는다. 다른 질문은 *"비용이
문제가 아니라면, 달성 가능한 최선의 품질은 무엇인가?"*이다. 그것이 **ULTRA** 파이프라인이다. 그것은
의도적으로 소비한다 — 핵심은 천장(ceiling)이지 예산이 아니다.

```
Stage A — WIDE divergent generation (maximize recall)
  • Claude Opus  : 7-lens adversarial panel + 3 deep-reasoning draws   (via the Workflow tool)
  • Gemini-2.5-pro : full review pass + deep-reasoning pass             (direct Google API)
  →  union of all candidate defects  (≈ 70 per artifact, noisy, duplicated)

Stage B — adversarial ADJUDICATION (recover precision)
  • one GPT-5.2 final adjudicator per artifact
  • dedupe near-duplicates, DROP false positives / speculation / style nits
  →  a clean confirmed list  (≈ 5–6 per artifact)

Stage C — adversarial REFUTE  (optional precision tightening)
  • two independent cross-model refuters (GPT-5.2 + Gemini), "both must refute to drop"
  • conservative by design: protects recall, trims only defects neither refuter can defend

Stage D — robust JUDGE PANEL  (measurement, not generation)
  • 5 cross-model judges (4× GPT-5.2 + 1× Gemini-2.5-pro), BLIND to how defects were produced
  • MAJORITY vote per planted defect decides "caught"
  →  per-stratum recall + precision, with single-judge variance removed
```

이 형태가 곧 전부다: **가능한 한 넓게 발산한 다음, 강하게 판정하라.** 넓은 교차 모델 생성은
*재현율(recall)*을 극대화하고, 강력한 독립 판정자(adjudicator)는 그 결과로 생긴 잡음에서
*정밀도(precision)*를 회복한다. 어느 한쪽만으로는 둘 다 얻지 못한다.

### 단일 채점자가 아니라 심판단(judge panel)인 이유

자유 텍스트 형태의 결함을 심어 둔 결함과 매칭하는 일은 판단의 문제이고, 단일 GPT-5.2 판정자는 실행마다
변동(run-to-run variance)이 있다. 우승 구성에서 한 번의 엄격한 단일 판정 실행은 17/18을 기록했고(심층
추론으로 잡아낸 것 하나를 이의 제기했다), 반면 **5-판정자 다수결은 18/18을 기록했다**. 단일 실행을 —
어느 방향으로든 — 대표 수치로 내세우는 것은 바로 이 프로젝트가 피하려고 존재하는 방법론적 부주의가 될
것이다. [§3 결과](03-results.md)의 모든 대표 수치는 패널 다수결이며, 결코 단일 판정자가 아니다.

---

## 2.4 이 설계가 알려 줄 수 없는 것 (드러내 놓고 안고 가는 위협들)

- **이것은 결함 포착(defect-catch)을 측정하지, 개발자 생산성을 측정하지 않는다.** 심어 둔 픽스처의
  재현율 수치는 생산성 크기 수치가 *아니다*. 이 프로젝트의 상시 규칙(B4)은 개발자를 대상으로 한 사전
  등록(pre-registered) A/B가 실행되기 전에는 생산성 주장을 금지한다. ULTRA는 그것을 바꾸지 않는다.
  [§6 한계](06-limitations.md)를 보라.
- **생성은 단일 파이프라인 실행이다.** *판정*은 패널로 견고하지만, 각 확정 목록을 만든 *생성*은
  **n=6, 저자가 심어 둔(author-planted)** 픽스처에 대한 한 번의 실행이다. 방향성은 있으나 확정적이지
  않다.
- **정밀도는 정답 키에 의해 과소평가된다.** 산출물당 결함은 3개만 심어져 있지만, 그 산출물들은 *더
  많은* 진짜 결함을 충분히 포함할 법한 실제 버그 코드다 — 따라서 일부 "거짓 양성(false positive)"은
  환각이 아니라 진짜 추가 발견일 가능성이 높다. 그러므로 보고된 정밀도는 **바닥값(floor)**이다.
- **교차 모델 판정은 누출(leak)될 수 있다.** 정답 채점에서는 판정자가 알려진 정답 키에 매칭하므로
  누출은 경미하다 — 그러나 그것은 누출이며, 출시된 제품에서 교차 모델 판정(verdict)이 런타임 RED
  게이트에 결코 손대지 않는 이유(주장 C3)가 바로 그것이다.

전체 재현 명령은 [§7 재현](07-reproduce.md)에 있다.
