# 7 · 재현 — 모든 수치를 직접 다시 돌려보라

이 폴더 안의 모든 것은 실행 가능하다. 통제된(controlled) A/B는 리포지토리에 포함되어 함께 배포되며,
ULTRA 교차모델(cross-model) 파이프라인은 작은 독립 스크립트들과 여러분 자신의 API 키를 사용한다. 여기 있는 어떤 결과도
스크린샷을 믿어달라고 요구하지 않는다.

---

## 7.1 통제된 A/B (리포지토리 내장, Claude 전용)

4-arm 하니스는 `eval/ab-harness.mjs`에 있으며 Workflow 도구를 통해 실행된다.

```bash
# from the repo root, with Claude Code available
node eval/ab-harness.mjs eval/fixtures/seeded-defects-hard.json
```

이 하니스는 각 산출물에 대해 **A / A2 / A_N / B** arm을 실행하고, 워커 Opus→Sonnet 교체를
위약 통제(placebo control)로 두며, 계층별(per-stratum) 재현율(recall)과 함께 `caught_per_agent`를 보고한다. 픽스처(fixture)는 다음과 같다:

- `eval/fixtures/seeded-defects.json` — 시드(seed)(n=2). **포화(Saturated) 상태** — 단일 강력
  에이전트가 이미 모든 것을 잡아내므로 심판단(panel)은 순수 비용으로만 나타난다. 천장 효과(ceiling-effect)
  시연용으로 보존됨.
- `eval/fixtures/seeded-defects-hard.json` — 어려운(hard) 픽스처(n=6, 18개의 심어둔(planted) 결함(defect),
  a/b/c로 계층화). 실제 여유 공간(headroom)이 있는 쪽이 바로 이것이다.

사전 등록된(pre-registered) 의사결정 규칙과 그에 대한 솔직한 주의사항(caveat)은 `eval/README.md`를 참조하라
(n이 작다; `caught_per_agent`는 토큰/실측 시간(wall-clock)이 아니라 에이전트 수 기반 비용 대용지표(cost proxy)다).

---

## 7.2 ULTRA 교차모델 파이프라인

Workflow 런타임은 Claude 전용이라(`fetch` 없음) 교차모델 단계들은 외부 API를 직접 호출하는 작은
Node 스크립트로 실행된다. 이 스크립트들은 의도적으로 단순하고 감사 가능하게(auditable) 만들어져 있다 —
의존성 없음, 순수 `fetch`.

### 키(절대 커밋하지 않음, 절대 출력하지 않음)

```bash
export OPENAI_API_KEY=...      # GPT-5.2 (adjudicator + judges)
export GEMINI_API_KEY=...      # Gemini-2.5-pro (generation + one judge)  [or GOOGLE_API_KEY]
```

### Stage A — 폭넓은 생성(wide generation)

```bash
# Claude side: Opus 7-lens panel + 3 deep draws, via the Workflow tool
#   → produces ultra-claude-gen.json  { tasks:[{ id, planted_defects, claudeCands, agents }] }
# (this is the wide-generation workflow; see orchestration/ for the recipe shape)

# Gemini side: full + deep passes, direct Google API
node gemini-gen.mjs eval/fixtures/seeded-defects-hard.json gemini-2.5-pro
#   → gemini-cands.json   { task_id: [ findings ] }
```

### Stage B — 판정(adjudication) (정밀도 회복)

```bash
node ultra-adjudicate.mjs \
  eval/fixtures/seeded-defects-hard.json ultra-claude-gen.json gemini-cands.json gpt-5.2
#   → ultra-confirmed.json   { adjudicator, agents_total, n_candidates_total, tasks:[…confirmed…] }
```

### Stage C — 적대적 반박(adversarial refute) (선택적 정밀도 강화)

```bash
node ultra-refute.mjs \
  eval/fixtures/seeded-defects-hard.json ultra-confirmed.json ultra-confirmed-refuted.json
#   two cross-model refuters (GPT-5.2 + Gemini); a defect is dropped only if BOTH refute it
```

### Stage D — 견고한 심판단 판정(robust panel judge) (대표 수치)

```bash
node ultra-judge-panel.mjs ultra-confirmed.json
#   5 cross-model judges (4× GPT-5.2 + 1× Gemini), majority vote per planted defect
#   → { recall:{a,b,c,overall}, precision, mean_false_positives, per_task }
```

단일 심판(single-judge) 변형(`ultra-judge.mjs`)은 심판단을 정당화하는 실행 간(run-to-run)
분산(variance)을 **시연**하기 위해서만 보존되어 있다 — 이는 보고용 경로가 아니다.

> 위의 독립 실행형 `*.mjs` 스크립트들은 [§3 결과](03-results.md)를 산출하는 데 사용된 바로 그
> 스크립트들이다. 실행 전에 처음부터 끝까지 통독할 수 있을 만큼 작으며, 그렇게 하는 것이
> 권장된다(공급망 위생(supply-chain hygiene) — 여러분의 키에 대해 불투명한 스크립트를 절대 실행하지 말 것).

---

## 7.3 여러분이 얻게 될 결과

- **어려운(hard) A/B**: 심판단은 단일 *베이스라인(baseline)*을 재현율에서 아주 약간만 이기며 자신의
  A2/A_N 통제군(control arm)은 이기지 **못한다** — 즉, 재현율 이득은 병렬 구조가 아니라 렌즈 분류체계
  (lens-taxonomy) + 추출 횟수(draw-count)에서 온다; 심판단의 구조적 승리는 정밀도(precision)에 있다.
- **ULTRA**: 최신 모델(GPT-5.5 + Gemini-3.1-pro-preview)에서는 정밀도 **0.74**(모든 구성 중 최고)에
  **16/18** 심판단 다수결(panel-majority) 재현율을 달성하고; 이전 모델(GPT-5.2 +
  Gemini-2.5-pro)에서는 0.63에 **18/18** 재현율 정점을 달성한다 — n=6 심어둔 픽스처에서, 의도적으로
  높은 비용을 들여, 재현율×정밀도 프런티어(frontier)에서 모든 단일 arm 구성을 앞선다.
- GPT-5.2 심층 생성(deep-generation) **에스컬레이션**(V2)을 추가하는 것은 도움이 되지 **않는다** — 재현율을
  정밀도와 약간 맞바꾸어 재현율 면에서 순효과로는 더 나빠진다. 더 단순한 쪽이 이긴다.

여러분의 실행 결과가 이와 어긋난다면, 그것은 하나의 발견(finding)이다 — 시드와 태스크별(per-task) 출력을
첨부해 이슈를 열어달라. 픽스처는 작고(n=6) 저자가 직접 심은 것이다; 경계(margin)에서의 불일치는 예상되는 일이며,
바로 이 프로젝트가 초대하는 종류의 공격(attack)이다.
