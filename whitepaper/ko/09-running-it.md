# 9 · 운영하기 — 키, 인증, 그리고 auto / on / off 모드

이 페이지는 무언가를 켜기 전에 팀이 필요로 하는 운영 요약이다: 어떤 기능이 키를 필요로 하는지,
API 키 대 계정 로그인의 차이, 그리고 비용 다이얼(`auto` / `on` / `off`)과
"항상 최신 모델(always-latest-model)" 메커니즘이 어떻게 동작하는지. 전체 레퍼런스: 레포 안의
[`../../docs/API-KEYS.md`](../../docs/API-KEYS.md)와
[`../../orchestration/MODELS.md`](../../orchestration/MODELS.md).

---

## 9.0 첫 실행 — 시스템이 먼저 물어본다 (수동 설정 불필요)

시작하려고 이 페이지 나머지를 읽을 필요는 없다. 설치 후 Claude Code를 처음 열면, fablever가 아직
설정되지 않았음을 감지하고 **두 가지 간단한 질문을 던진다** — 비용 모드(`auto` / `on` / `off`)와
교차 모델 리뷰어를 추가할지(기본은 Claude 전용 — 키 불필요, $0). 답변은 `~/.claude/fable-profile/`
아래에 저장되며 질문은 다시 반복되지 않는다. API 키가 처음인가? 기본값은 키가 전혀 필요 없다 —
**"skip"** 이라고 하면 권장 기본값으로 진행된다. 언제든 `~/.claude/fable-profile/onboarded`를 지우면
설정을 다시 받을 수 있고, `FABLE_ONBOARD=off`로 질문을 끌 수 있다.

## 9.1 키가 필요한가? (대부분 아니다)

| 기능 | 키가 필요한가? | 어느 키 |
|---------|:---:|-------|
| 행동 프로필(always-on 스타일) | **아니오** | 기존 Claude Code 인증 위에서 동작 |
| 오케스트레이션 레시피(Claude 전용) | **아니오** | Claude 작업자(worker)는 Workflow 도구로 실행 |
| 교차 모델 검증(기본적으로 꺼짐) | **예** | Claude가 아닌 모델 키(§9.2) |
| ULTRA 최대 품질 파이프라인 | **예** | OpenAI 및/또는 Google 키 |

Claude 작업자는 in-Claude-Code 경로에서 별도의 Anthropic API 키를 결코 필요로 하지 않는다.
교차 모델 갈래(arm)가 **꺼진** 상태에서는 fablever가 네트워크 호출을 **0회** 하며 키도 **0개**
필요하다.

## 9.2 API 키(BYOK) — 소비자 로그인이 아니다 (한 가지 예외)

가장 흔한 혼동을 직설적으로 말하면:

- **ChatGPT Plus/Pro 구독은 API 접근 권한을 주지 *않는다*.** OpenAI *API*는 별도로 과금되는
  별개 제품(platform.openai.com)이며 자체 키를 가진다.
- **Gemini 앱 로그인은 API 접근 권한을 주지 *않는다*.** Gemini *API* 키는 Google AI
  Studio(aistudio.google.com)에서 발급된다.
- **단 하나의 OAuth/계정 로그인 예외:** GPT 리뷰어를 **codex MCP**(`mcp__codex__codex`)를 통해
  라우팅하면 당신의 **ChatGPT 로그인** 하에서 실행되어 OpenAI API 키가 필요 없다(GPT 리뷰어만
  해당하며 Gemini는 해당되지 않는다). 활성화: `install.sh --with-xverify=codex`. 일회성 설정(codex
  CLI 설치, `codex login`, MCP 등록)은 [`../../docs/API-KEYS.md`](../../docs/API-KEYS.md)
  § Set up the codex MCP에 있다.

```bash
export OPENAI_API_KEY=sk-proj-...    # platform.openai.com/api-keys  (NOT chatgpt.com)
export GEMINI_API_KEY=...            # aistudio.google.com/apikey   (GOOGLE_API_KEY also accepted)
export OPENROUTER_API_KEY=sk-or-v1-... # optional aggregator: one key, many models
```

키는 `~/.zshrc`에 두고, **절대 키를 커밋하지 말라**. 유일한 네트워크/키 표면은 의존성이 없는
`fusion/fusion-server.js`이다(내장 `fetch`, npm 의존성 없음, postinstall 없음).

### 4가지 리뷰어 프리셋 — 하나를 고르고, 언제든 바꾸고, 그것이 기본값으로 유지된다

대부분의 사람은 이미 ChatGPT 계정을 가지고 있으므로, 두 번째 프리셋은 **API 키가 전혀 없이도**
GPT 리뷰어를 추가한다. 첫 실행 설정에서 하나를 고르라고 묻고, 그 선택은 지속된다.

| 프리셋 | 무엇을 추가하는가 | 무엇을 해야 하는가 |
|--------|--------------|------------------|
| **claude-only** *(기본값)* | 없음 — 같은 계열의 Claude 패널 | 없음 ($0, 키 없음, 로그인 없음) |
| **gpt-oauth** | 당신의 **ChatGPT 로그인**을 통한 GPT 리뷰어(codex MCP) | codex 설정(명령 3개, [docs/API-KEYS.md](../../docs/API-KEYS.md)) — **API 키 없음** |
| **gpt-oauth+gemini-api** | ChatGPT 로그인을 통한 GPT **+** Gemini | ChatGPT 로그인 + `GEMINI_API_KEY` 하나 |
| **gpt-api+gemini-api** | API 키를 통한 GPT **+** Gemini | `OPENROUTER_API_KEY` 하나(둘 다 커버) |

```bash
node orchestration/lib/xverify-preset.mjs show          # list presets (your default is marked ▶)
node orchestration/lib/xverify-preset.mjs set gpt-oauth  # change anytime — persists as the new default
node orchestration/lib/xverify-preset.mjs doctor         # checks if the needed key is set (never prints it)
```

**보안 & "나머지는 AI가 한다":** 설정은 모든 구성을 당신 대신 기록해준다. 당신은 환원 불가능한
인간의 단계 — *키를 발급하거나* *로그인하는* 것 — 만 한다. **절대 API 키를 채팅에 붙여넣지 말라**;
키는 당신이 직접 `~/.zshrc`에 추가하고(`export GEMINI_API_KEY=...`) 새 세션을 시작하라. `doctor`는
키가 *존재하는지* 여부(true/false)만 보고한다 — 값을 읽거나 출력(echo)하지 않는다.

## 9.3 비용 다이얼 — `FABLE_ULTRA` = `auto` | `on` | `off`

무거운 교차 모델 / 패널 경로는 비싸다([§4](04-max-quality-config.md)). 이 스위치는 언제 그것을
쓸지 결정한다. 우선순위: env `FABLE_ULTRA` > `~/.claude/fable-profile/mode.json`
(`{"ultra":"auto"}`) > 기본값 **`auto`**.

| 모드 | 동작 |
|------|----------|
| **`auto`** (기본값) | **기본은 저렴하게.** 위험 신호(stakes signals)가 있을 때만 무거운 패널/ULTRA 경로로 격상한다 — 보안 / 인증 / 결제 / 암호화(crypto) / 마이그레이션 / 릴리스 / "audit" / "thorough" / 크거나 많은 산출물(영어 + 한국어 키워드). 따라서 쉬운 작업이 조용히 비용을 태우는 일이 없다. |
| **`on`** | 항상 무거운 경로. |
| **`off`** | 항상 저렴한 프롬프트 정합 단일 에이전트(A2). |

`auto` 게이트는 보장이 아니라 정직한 휴리스틱(heuristic)이다 — `on`/`off`가 항상 무시(override)
한다. 결정을 확인하려면: `node orchestration/lib/mode.mjs "review the auth token refresh"`.

## 9.4 항상 최신 모델 — 탐지 → 검증 → 채택 (매일, 토큰 ~0)

사용 중인 모델은 [`../../orchestration/models.json`](../../orchestration/models.json)에 고정
(pin)되어 있다(`active` = 최신 검증본; 현재 **GPT-5.5** + **Gemini-3.1-pro-preview** + Opus).
이들은 대화당 토큰 비용 없이 최신 상태를 유지한다:

1. **탐지(Detect)** — SessionStart 훅이 체커를 호출하는데, 이 체커는 제공자(provider)의
   **모델 목록(model-list)** 엔드포인트만 친다(생성 없음). **24h당 1회로 속도 제한(rate-limited)**
   된다. 더 새로운 플래그십이 나타나면 알림을 표시한다. `FABLE_MODELCHECK=off`로 비활성화한다.
2. **검증(Validate)** — 후보는 적격이 되기 전에 평가 픽스처(eval fixture)에서 평가 실행된다; 기준은
   **작동이 검증됨 + 치명적 재현율 퇴행 없음(validated-to-work + no catastrophic recall
   regression)**이다(직전 정점을 반드시 능가할 필요는 없다 — 더 새로운 모델이 재현율을 정밀도와
   맞바꿀 수 있으며, 그럴 경우 두 실행 모두 기록된다)
   (`node orchestration/lib/model-freshness.mjs validate <id>`).
3. **채택(Adopt)** — 검증된 후보만 `active`에 기록된다
   (`node orchestration/lib/model-freshness.mjs adopt <role> <id>`); 발행된 백서의 수치는 그것을
   산출한 모델을 그대로 유지한다.

> **왜 가장 새로운 것을 조용히 쓰지 않는가?** "가장 새로운(Newest)" ≠ "이 작업에 대해
> 검증된(validated for this task)"이며, 조용한 교체는 재현성을 깨고 검증되지 않은 모델
> (공급망 위험(supply-chain risk))을 끌어들인다. [§3.3](03-results.md)의 재실행이 이것이
> 중요함을 보여주는 증거다: *더 새로운* 모델들은 더 높은 정밀도에서 **더 낮은 재현율(recall)**
> (16/18)을 기록했다 — 가장 새로운 것이 자동으로 더 나은 것은 아니다.

## 9.5 킬 스위치(모든 것은 되돌릴 수 있다)

```bash
export FABLE_PROFILE=off       # disable the whole profile + hooks
export FABLE_ULTRA=off         # always cheap path
export FABLE_XVERIFY=off       # disable cross-model verification
export FABLE_FUSION=off        # disable the OpenRouter fusion module
export FABLE_MODELCHECK=off    # disable the daily model-freshness check
./install.sh --uninstall       # full removal, restores prior settings
```
