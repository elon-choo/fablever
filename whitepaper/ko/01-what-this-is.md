# 1 · 이것은 무엇인가 (그리고 무엇이 아닌가)

**fablever**(일명 fable-profile)는 Anthropic이 문서화한 **Fable 작업 스타일
가이드(Fable working-style guidance)**를 Claude Code에서 상시(always-on) 출력 스타일로 적용하며,
실험적인 오케스트레이션(orchestration) 계층과 기본값으로 꺼져 있는 교차 모델 검증(cross-model
verification) 분기를 함께 제공한다. npm 의존성은 0개. 누구나, 어떤 프로젝트에서든, 어떤 Claude
작업자(worker) 모델로든 설치할 수 있다.

> **Anthropic과 제휴 관계 없음.** Claude, Anthropic, Fable은 Anthropic의
> 상표이며, 여기서는 이 독립 커뮤니티 도구가 무엇과 함께 동작하는지를 기술하기 위한
> 지칭적(nominative) 용도로만 사용된다. [`NOTICE`](../../NOTICE)를 참조하라.

이 페이지는 세 하위 시스템에 대한 정직한 지도이며, 각각이 정확히 무엇을 한다고
주장하는지 — 그리고 무엇을 한다고 주장하지 **않는지** — 를 보여준다. 상세한 주장 원장
(load-bearing 단언 전체와 그 적대적(adversarial) 처분)은 [§5](05-consensus-and-claims.md)에 있다.

---

## 1.1 모든 과대주장을 막아주는 단 하나의 구분

**이것은 *스타일(style)* 이식이지, *능력(capability)* 이식이 아니다.**

이것은 Fable이 *어떻게* 동작하는지 — 결단력 있게, 결과를 먼저(outcome-first), 절제되게,
근거에 기반해(evidence-grounded), 끝나면 멈추는(stop-when-done) — 를 되살려서, 문서화된 Claude
Code 메커니즘(출력 스타일, 훅(hook), MCP)을 통해 어떤 Claude 모델에든 적용한다. 이것은 더 약한
모델의 추론 한계(reasoning ceiling), 장기 지평 자율성(long-horizon autonomy), 또는 에이전트 단위
정확성(per-agent correctness)을 **끌어올릴 수 없다.** 그것들은 가중치(weights) 안에 있으며 이식
불가능하다. 이 백서의 모든 결과는 그 선과 일치한다. 오케스트레이션의 이득은 작업자 *주변의* 구조와
탈상관(decorrelation)에서 나오는 것이지, 작업자 자체를 더 똑똑하게 만드는 데서 나오는 것이 결코
아니다.

---

## 1.2 하위 시스템 A — 행동 프로파일 (스타일)

어떤 Claude 작업자든 Fable의 작업 스타일을 채택하게 만드는 상시(always-on) Claude Code **출력
스타일**(+ 선택적 `UserPromptSubmit` / `SubagentStart` 훅 + 의존성 0개 MCP).

- 세션 시작 시점에 고정됨(출력 스타일은 턴 단위가 아니다). *작업 스타일*을 조종하는 것이지,
  지식이나 추론을 조종하는 것이 아니다.
- **페일세이프(Fail-safe)**(훅 오류는 fail-open으로 처리됨), **토글 가능(toggleable)**
  (`FABLE_PROFILE=off`), **가역적(reversible)**(`install.sh --uninstall`이 이전 설정을 복원함).
  모델의 숨겨진 추론을 결코 그대로 내보내지(echo) 않는다.
- **결과(outcome)에 대해서는 검증되지 않음.** 번들된 leaktest는 네 가지 표면 스타일 대용
  지표(median words, tool:text 비율, caveat %, opener %)를 측정하며, 그 자체의 헤더가 이를
  "정확성의 척도가 아니다(not a measure of correctness)"라고 명시적으로 부인한다. 숨긴 것이 아니라
  공개된(disclosed) 사실이다.

## 1.3 하위 시스템 B — 오케스트레이션 계층 (구조)

자기완결적인 **Workflow 도구 레시피** 라이브러리 — `adversarial-verify`,
`divergent-explore`, `decompose-first`, `pipeline-map`, `judge-panel` — 와 트리거형
`orchestrate` 스킬, 그리고 결함 주입(seeded-defect) 평가 하니스(harness).

- 이것들은 **실제 프로그램**이다. 실제 `parallel()` 배리어(barrier), 스키마로 강제된 출력, JS가
  소유한 중단 규칙(stopping rule)과 게이트(gate) — "Fable처럼 행동하라"는 산문 지시문이 아니다.
- 근거 있는 주장은 **"맥락 격리(context-isolation) + 분해(decomposition)가 도움이 된다"**이지,
  "그 우위(edge)는 산문이 아니라 실행되는 제어 흐름(executed control-flow)에서 온다"가 *아니다*.
  통제된 A/B는 아직 실행되는 제어 흐름을, 렌즈(lens)별 프롬프트·렌즈 분류 체계(taxonomy)·신선한
  맥락(fresh context)·추출 횟수(draw count)로부터 분리해낼 수 없다. 우리는 의도적으로 더 좁은
  쪽을 말한다.
- **생산성 규모(productivity-magnitude) 주장은 출시되지 않는다.** 하니스가 반증자(falsifier)이며,
  그것이 지금까지 실제로 보여준 것은 [§3](03-results.md)에 있다.

## 1.4 하위 시스템 C — 교차 모델 검증 (탈상관)

진정으로 다른 가중치를 가진 검토자(GPT/Gemini는 의존성 0개 `fusion-server.js`를 통해, 또는 GPT는
codex MCP를 통해)를 verify 루프에 추가하는 **기본값으로 꺼진(off-by-default)** 분기.

- **꺼져 있을 때 오버헤드 0** — 교차 모델 분기는 *인자(argument)의 부재*이지, 플래그를 확인한 뒤
  건너뛰는 것이 아니다.
- 교차 모델 판정(verdict)은 **보너스 커버리지**다. findings/synthesis에 반영되지만, 런타임 RED
  게이트를 **결코** 바꾸지 않으며 A/B 평가의 심판(judge)이 되어서도 **결코** 안 된다(처치
  누출(treatment leak)). 이 백서에서 교차 모델 모델을 *심판으로* 쓰는 유일한 지점은 알려진 정답
  키(answer key)에 대해 채점하는 경우다 — 이는 측정(measurement) 설정이며, 명시적으로 라이브
  게이트가 아니다.
- 이 하위 시스템이 [§4 최대 품질 구성](04-max-quality-config.md)을 가능하게 만든다. 다른
  가중치를 가진 모델이 같은 계열(same-family) 패널이 잡을 수 없는 결함 부류를 잡아낸다.

---

## 1.5 정직한 태세 (구속력 있음)

- **스캐폴딩(scaffolding)은 기본 역량(base competence)에 대한 곱셈자(multiplier)이지, 결코
  대체물이 아니다.** 방향(direction)은 메커니즘에서 나오며, **규모(magnitude)는 오직 사전
  등록되고(pre-registered) 조건 블라인드(condition-blind)인 A/B에서만 나온다.**
- 대외적 얼굴은 **공개된 한계 목록(disclosed limitations list)**([§6](06-limitations.md))이지,
  무결성(invulnerability)에 대한 주장이 아니다. 검토자가 찾아낸 새로운 빈틈(gap)은, 인정되거나
  수정되거나 반박될 때까지 출판 차단 사유(publication blocker)다.
- [§3](03-results.md)이 이 태세에 더하는 것은 **한정되고(bounded), 증거로 뒷받침되는** 결과다.
  작은 주입(planted) 픽스처에서, 비용을 따지지 않는(cost-no-object) 교차 모델 파이프라인은 더 저렴한
  구성들이 도달하지 못하는 실제 결함 포착(defect-catch) 한계에 도달한다 — *그리고 그것은 결함 포착
  결과이지, 생산성 결과가 아니다.* 이 구분이 곧 규율(discipline) 전체다.
