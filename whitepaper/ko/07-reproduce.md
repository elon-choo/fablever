# 7 · 재현 — 모든 수치를 직접 다시 돌려보라

대표 결함-포착(defect-catch) 수치는 그 **스크립트와 원시 데이터**와 함께
[`../../eval/ultra/`](../../eval/ultra/)에 담겨 배포된다. 결정적(deterministic) 카운트는 **오프라인에서,
API 키 없이** 확인 가능하다; 라이브 심판단(judge panel)은 당신 자신의 키로 다시 돌릴 수 있다. 여기 있는
어떤 결과도 스크린샷을 믿어달라고 요구하지 않는다.

> **재현성 등급(reproducibility tiers) — 무엇이 어느 등급인지 정직하게 밝힌다:**
> - **Tier 1 — 오프라인, 키 불필요.** `node eval/ultra/score.mjs`는 커밋된 원시 JSON에서
>   후보/확정(candidate/confirmed) 카운트를 재계산한다; `npm test`와 leaktest는 로컬에서 돌아간다.
>   누구나 몇 초 만에 이것들을 확인할 수 있다.
> - **Tier 2 — 라이브, 당신의 키.** 크로스모델 생성, 판정(adjudication), 그리고 5심판 패널은 외부
>   API를 호출한다. 스크립트와 그 커밋된 입력은 `eval/ultra/`에 있다; 그것들을 다시 돌리면 라이브
>   모델 분산(live-model variance)까지 포함해 수치가 재현된다(그 분산을 누그러뜨리려고 5심판 패널이
>   존재한다).
> - **Claude 전용 A/B 하니스**(`eval/ab-harness.mjs`)는 맨-`node` 스크립트가 아니라 **Workflow 도구
>   모듈**이다 — §7.1을 보라.

---

## 7.0 가장 빠른 확인 (오프라인, 키 0개)

```bash
node eval/ultra/score.mjs
```

[`../../eval/ultra/raw/`](../../eval/ultra/raw/)에서 곧바로, [§3](03-results.md)과
[실험 로그](08-experiment-log.md)에 인용된 후보 합집합 크기(`402` 최신 / `417` 직전 정점 / `455`
에스컬레이션)와 확정 결함 카운트(`24` / `32` / `33`)를 재계산하고, 그것들이 픽스처의 아티팩트 6개 /
심어둔 결함 18개를 커버함을 단언(assert)한다. 전체 번들(스크립트, 원시 데이터, 파이프라인 설명)은
[`../../eval/ultra/README.md`](../../eval/ultra/README.md)에 문서화되어 있다.

---

## 7.1 통제된 A/B (리포지토리 내장, Claude 전용)

4-arm 하니스는 `eval/ab-harness.mjs`에 있다. 이것은 **Claude Code Workflow 도구 모듈**이다 — 런타임
전역(global)인 `agent()` / `parallel()` / `log()`와 최상위 `return`을 사용하므로, **맨-`node`가 아니라
Claude Code 안의 Workflow 도구를 통해 실행된다**(`node eval/ab-harness.mjs`를 실행하면
`Illegal return statement`를 던진다 — 이는 예상된 동작이다; CLI가 아니다). 그 기록된 출력은
[`../../eval/results-2026-06-15.md`](../../eval/results-2026-06-15.md)와
[`../../eval/results-2026-06-15-hard.md`](../../eval/results-2026-06-15-hard.md)에 커밋되어 있다.

이 하니스는 각 산출물에 대해 **A / A2 / A_N / B** arm을 실행하고, 워커 Opus→Sonnet 교체를 위약
통제(placebo control)로 두며, 계층별(per-stratum) 재현율(recall)과 함께 `caught_per_agent`를 보고한다.
픽스처(fixture)는 다음과 같다:

- `eval/fixtures/seeded-defects.json` — 시드(seed)(n=2). **포화(Saturated) 상태** — 단일 강력
  에이전트가 이미 모든 것을 잡아내므로 심판단(panel)은 순수 비용으로만 나타난다. 천장 효과(ceiling-effect)
  시연용으로 보존됨.
- `eval/fixtures/seeded-defects-hard.json` — 어려운(hard) 픽스처(n=6, 18개의 심어둔(planted) 결함(defect),
  a/b/c로 계층화). 실제 여유 공간(headroom)이 있는 쪽이 바로 이것이다.

사전 등록된(pre-registered) 의사결정 규칙과 그에 대한 솔직한 주의사항(caveat)은 `eval/README.md`를 참조하라
(n이 작다; `caught_per_agent`는 토큰/실측 시간(wall-clock)이 아니라 에이전트 수 기반 비용 대용지표(cost proxy)다).

---

## 7.2 ULTRA 교차모델 파이프라인

Workflow 런타임은 Claude 전용이라(`fetch` 없음) 교차모델 단계들은 외부 API를 직접 호출하는 작은 독립
실행형 Node 스크립트로 실행된다 — 의존성 없음, 순수 `fetch`. 이 스크립트들은 (원본 `/tmp` 출력 경로까지
포함하여) [`../../eval/ultra/`](../../eval/ultra/)에 **있는 그대로(verbatim)** 커밋되어 있다 — 먼저
[`../../eval/ultra/README.md`](../../eval/ultra/README.md)를 읽어라.

### 키(절대 커밋하지 않음, 절대 출력하지 않음)

```bash
export OPENAI_API_KEY=...      # GPT-5.5 latest / GPT-5.2 prior  (adjudicator + judges)
export GEMINI_API_KEY=...      # Gemini-3.1-pro-preview latest / Gemini-2.5-pro prior  [or GOOGLE_API_KEY]
```

### Stage A — 폭넓은 생성(wide generation)

```bash
# Claude side: Opus 7-lens panel + 3 deep draws, via the Workflow tool.
#   Its committed output is eval/ultra/raw/ultra-claude-gen.json
#   { worker, tasks:[{ id, planted_defects, claudeCands, agents }] }
# (no standalone script — Claude workers run in-Claude-Code; see eval/ultra/README.md)

# Gemini side: full + deep passes, direct Google API
node eval/ultra/gemini-gen.mjs eval/fixtures/seeded-defects-hard.json gemini-3.1-pro-preview
#   → /tmp/gemini-cands.json   (committed sample: eval/ultra/raw/gemini-cands.json)
```

### Stage B — 판정(adjudication) (정밀도 회복)

```bash
# latest models (gpt-5.5):
node eval/ultra/ultra-adjudicate-latest.mjs \
  eval/fixtures/seeded-defects-hard.json eval/ultra/raw/ultra-claude-gen.json eval/ultra/raw/gemini-cands.json gpt-5.5
#   → /tmp/ultra-confirmed-latest.json   (committed: eval/ultra/raw/ultra-confirmed-latest.json)
# prior peak (gpt-5.2): use ultra-adjudicate.mjs → eval/ultra/raw/ultra-confirmed.json
```

### Stage C — 적대적 반박(adversarial refute) (선택적 정밀도 강화)

```bash
node eval/ultra/ultra-refute.mjs \
  eval/fixtures/seeded-defects-hard.json eval/ultra/raw/ultra-confirmed.json /tmp/ultra-confirmed-refuted.json
#   two cross-model refuters (GPT + Gemini); a defect is dropped only if BOTH refute it.
#   Committed result: eval/ultra/raw/ultra-confirmed-v1refuted.json (a published NEGATIVE result —
#   refutation dropped ~nothing real, so the extra findings are genuine defects, not noise).
```

### Stage D — 견고한 심판단 판정(robust panel judge) (대표 수치)

```bash
node eval/ultra/ultra-judge-panel-latest.mjs eval/ultra/raw/ultra-confirmed-latest.json
#   5 cross-model judges (4× GPT-5.5 + 1× Gemini-3.1-pro-preview), majority vote per planted defect
#   → { recall:{a,b,c,overall}, precision, mean_false_positives, per_task }   (prints to stdout)
# prior peak: node eval/ultra/ultra-judge-panel.mjs eval/ultra/raw/ultra-confirmed.json
```

단일 심판(single-judge) 변형(`ultra-judge.mjs`)은 심판단을 정당화하는 실행 간(run-to-run)
분산(variance)을 **시연**하기 위해서만 보존되어 있다 — 이는 보고용 경로가 아니다.

> 위의 스크립트들은 [§3 결과](03-results.md)를 산출한 **있는 그대로의(verbatim)** 실험 스크립트로서
> [`../../eval/ultra/`](../../eval/ultra/)에 커밋되어 있으며, 그것들이 내보낸 원시 JSON
> ([`../../eval/ultra/raw/`](../../eval/ultra/raw/))과 오프라인 채점기(offline scorer)
> ([`../../eval/ultra/score.mjs`](../../eval/ultra/score.mjs))가 함께 있다. 실행 전에 처음부터 끝까지
> 통독할 수 있을 만큼 작으니, 그렇게 하라(공급망 위생(supply-chain hygiene) — 여러분의 키에 대해
> 불투명한 스크립트를 절대 실행하지 말 것). 당신의 키가 필요한 단계는 라이브 심판(live judging)뿐이며;
> 카운트는 키 없이 오프라인에서 확인 가능하다.

---

## 7.3 여러분이 얻게 될 결과

- **어려운(hard) A/B**: 심판단은 단일 *베이스라인(baseline)*을 재현율에서 아주 약간만 이기며 자신의
  A2/A_N 통제군(control arm)은 이기지 **못한다** — 즉, 재현율 이득은 병렬 구조가 아니라 렌즈 분류체계
  (lens-taxonomy) + 추출 횟수(draw-count)에서 온다; 심판단의 구조적 승리는 정밀도(precision)에 있다.
- **ULTRA**: 최신 모델(GPT-5.5 + Gemini-3.1-pro-preview)에서는 정밀도 **0.74**(모든 구성 중 최고)에
  **16/18** 심판단 다수결(panel-majority) 재현율을 달성하고; 이전 모델(GPT-5.2 +
  Gemini-2.5-pro)에서는 0.63에 **18/18** 재현율 정점을 달성한다 — n=6 심어둔 픽스처에서, 의도적으로
  높은 비용을 들여, 재현율×정밀도 프런티어(frontier)에서 모든 단일 arm 구성을 앞선다. (재현율/정밀도는
  **라이브** Tier-2 단계다; 그 뒤의 후보/확정 카운트는 `score.mjs`로 오프라인에서 확인 가능하다.)
- GPT 심층 생성(deep-generation) **에스컬레이션**(V2/V3)을 추가하는 것은 도움이 되지 **않는다** — 재현율을
  정밀도와 약간 맞바꾸어 재현율 면에서 순효과로는 더 나빠진다. 더 단순한 쪽이 이긴다.

여러분의 실행 결과가 이와 어긋난다면, 그것은 하나의 발견(finding)이다 — 시드와 태스크별(per-task) 출력을
첨부해 이슈를 열어달라. 픽스처는 작고(n=6) 저자가 직접 심은 것이다; 경계(margin)에서의 불일치는 예상되는 일이며,
바로 이 프로젝트가 초대하는 종류의 공격(attack)이다.
