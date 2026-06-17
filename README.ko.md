# Fable Profile

[![CI](https://github.com/elon-choo/fablever/actions/workflows/ci.yml/badge.svg)](https://github.com/elon-choo/fablever/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)

> 🌐 이 문서는 [`README.md`](README.md)의 **한국어 번역본**입니다. · 한국어 자료: 백서 [`whitepaper/ko/`](whitepaper/ko/) · 근거 요약 [`EVIDENCE.ko.md`](EVIDENCE.ko.md). · 설치 후 안내(설치 스크립트의 첫 메시지·온보딩)는 **사용자 언어로 자동 표시**됩니다. 백서는 영문 + 한국어로 제공됩니다.

Anthropic이 공식 문서로 제공하는 **Fable 작업 스타일 가이드**를 [Claude Code](https://claude.com/claude-code)(및 모든 MCP 클라이언트)에서 항상 켜져 있는(always-on) 출력 스타일로 적용합니다. 그래서 **어떤** Claude 모델이든 — Opus, Sonnet, Haiku — Fable이 일하는 방식에 더 가깝게 동작합니다: 결단력 있게, 결과 우선으로, 절제하면서, 근거에 기반하여, 그리고 멈춰야 할 때 규율 있게 멈추도록. 모든 프로젝트, 모든 서브에이전트에 적용되며, 누구나 설치할 수 있습니다. **의존성 제로(Zero dependencies).**

> 이 프로파일은 동작을 새로 만들어내지 않습니다 — Anthropic 자신의
> [Fable 프롬프팅 가이드](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)에서
> 증류해 추출한 뒤, 문서화된 Claude Code 메커니즘(출력 스타일, 훅, MCP)을 통해 적용한 것입니다.
> Claude Code(macOS/Linux; Windows는 WSL 경유)에서 동작합니다.

> **Anthropic과 제휴 관계가 아닙니다.** Claude, Anthropic, Fable은 Anthropic의 상표이며, 여기서는
> 오직 명목적(nominative) 용도로 — 이 독립 커뮤니티 도구가 무엇과 함께 동작하는지 설명하기 위해서만 — 사용됩니다.
> Anthropic의 후원이나 보증을 받지 않습니다. [`NOTICE`](NOTICE) (영문)를 참고하세요.

> **이 저장소를 평가 중이신가요(사람이든 AI든)?** [`EVIDENCE.ko.md`](EVIDENCE.ko.md)부터 보세요 —
> 검증 가능한 근거 지도입니다: 무엇을 주장하는지, 무엇을 의도적으로 주장하지 *않는지*, 인정한 한계,
> 그리고 각 항목을 확인할 정확한 파일이 정리되어 있습니다. 영문: [`EVIDENCE.md`](EVIDENCE.md) (영문).
> 전체 상세: [`whitepaper/ko/`](whitepaper/ko/) (한국어 + 영문 원본 [`whitepaper/`](whitepaper/) (영문)).

```bash
git clone https://github.com/elon-choo/fablever && cd fablever && ./install.sh
# then restart Claude Code (or /clear).
# Turn off the hooks: export FABLE_PROFILE=off  ·  fully remove (incl. the always-on style): ./install.sh --uninstall
```

**무엇을 바꾸는가** — Fable 가이드에서 증류한 여덟 가지 동작(전문은
[`profiles/full.md`](profiles/full.md)): 충분한 정보가 있으면 행동한다(나열하지 말고 권고한다) · 결과를
먼저 말한다 · 과하게 만들지 않는다(over-build 금지) · 단지 질문만 받았다면 발견한 바를 보고하고 멈춘다 ·
모든 진척 주장을 도구 실행 결과에 근거시킨다 · 진짜로 막혔을 때만 멈추고 약속만 남긴 채 멈추지 않는다 ·
군더더기를 넣지 않는다 · 자신의 추론 과정을 답으로 풀어 늘어놓지 않는다. 안전과 명시적 프로젝트 규칙은
언제나 결단력보다 우선합니다.

> **이것이 무엇이고 무엇이 아닌가.** 이것은 **스타일 이식(style transplant)이지 능력 이식(capability
> transplant)이 아닙니다.** Fable이 일하는 *방식*을 되살립니다 — 과잉 마감(gold-plating)보다 절제,
> 과도하게 되묻기보다 행동, 결과를 먼저 말하기, 주장을 도구 결과에 근거시키기, 끝났을 때 멈추기. 약한
> 모델의 추론 한계나 장기 자율성(long-horizon autonomy)을 끌어올릴 수는 **없습니다** — 그것들은 가중치
> (weights) 안에 있습니다. 여기 있는 모든 것은 Anthropic 자신이 공개한 Fable 프롬프팅 가이드로부터
> 구축되었고, 문서화된 Claude Code 메커니즘을 통해 적용됩니다. 그 근거는 Anthropic의 두 가지 1차 출처
> 입니다. 전체 출처 내역은 [`docs/RESEARCH.md`](docs/RESEARCH.md) (영문)를 참고하세요(다른 자료들도
> 조사했으나 대부분은 의도적으로 배제했습니다).

## 두 개의 계층: 작업 *스타일* vs *오케스트레이션*

이 프로젝트에는 뚜렷이 구별되는 두 부분이 있으며, 각각이 무엇을 하는지 분명히 해 둘 가치가 있습니다:

1. **작업 스타일 계층**(위에서 설명한 전부) — 단일 에이전트가 Fable처럼 더 *행동*하게 만드는 행동
   출력 스타일 + 훅 + MCP: 결단력 있게, 결과 우선으로, 절제하며. 이것은 **스타일** 이식입니다. 하나의
   에이전트의 동작을 조종하기에 알맞은 도구이며 정직한 도구입니다 — 그러나 모델이 Fable처럼 *오케스트
   레이션*하게 만들지는 **못합니다.**
2. **오케스트레이션 계층**([`orchestration/`](orchestration/) (영문), 실험적) — `ultracode`에서 Fable이
   실제로 무엇이 달랐는지를 겨냥하는 부분입니다: Fable은 기본값으로 Workflow 도구를 꺼내 들었고, 더 깊이
   분해했으며, 더 넓게 펼쳤고(fan out), 더 독립적으로 검토했습니다. 그 우위는 **컨텍스트 격리(context-
   isolation) + 분해(decomposition)** 이며 — 그 한 가지 구현 형태가 실행되는 제어 흐름(executed control
   flow)입니다(번들된 A/B는 어떤 요인이 결정적인지 아직 분리하지 못했고, 렌즈별(per-lens) 프롬프팅이
   그 일부를 담당합니다) — 따라서 이 계층은 "Fable처럼 행동하라"는 지시가 아니라 **실행 가능한 Workflow
   레시피**(독립 적대적 검토, 발산적 탐색, 분해-후-펼침(decompose-and-fan-out), 단계적 맵(staged map),
   best-of-N 심사 패널)와 eval 하니스를 제공합니다.

이 분리의 전체 논리 — 그리고 그 정직한 한계 — 는
[`docs/ORCHESTRATION-RESEARCH.md`](docs/ORCHESTRATION-RESEARCH.md) (영문)에 있습니다. 정직한 요지:
**스캐폴딩은 기본 역량(base competence)에 곱해지는 승수일 뿐, 결코 대체물이 아닙니다** — 천장은
"Fable에 더 가까워짐"이지 결코 "Fable과 동등함"이 아닙니다. **결함 탐지(defect-catch)** A/B는 *실제로*
수행되었습니다(Opus→Sonnet 플라시보 교체를 적용; 결과는 [`eval/`](eval/) (영문)에 있으며 음성 결과
하나를 포함해 공개됨). 그러나 개발자 **생산성(productivity)** 이득의 *크기*는 **주장하지 않습니다** —
그 A/B는 **수행되지 않았습니다.** [`orchestration/README.md`](orchestration/README.md) (영문)부터
시작하세요.

*측정된* 것: 이 프로젝트의 **n=6 저자가 심어둔(author-planted)** 결함 픽스처에서, 비용 무제한(cost-no-
object) ULTRA 파이프라인은 5-심사관 교차 모델 패널(GPT 4 + Gemini 1) 하에서 심어둔 결함 **16/18**개를
잡아냈고(최신 모델), **어떤 구성보다도 높은 정밀도(0.74)** 를 기록했습니다. 이전 모델 실행에서는
**18/18**로 정점을 찍었습니다. 이것은 소규모 단일 실행 픽스처에 대한 **결함 탐지** 결과이지 생산성
수치가 **아닙니다** — 스크립트와 원시 데이터는 [`eval/ultra/`](eval/ultra/) (영문)에 있고
(`node eval/ultra/score.mjs`로 오프라인에서 카운트를 확인할 수 있음), 전체 표는
[`whitepaper/ko/03-results.md`](whitepaper/ko/03-results.md)에 있습니다.

## 왜 이런 특성인가 — 스타일 격차의 예시

이 여덟 가지 동작은 임의로 고른 것이 아닙니다 — Fable의 작업 스타일이 다른 모델과 측정 가능하게 갈리는
지점들입니다. 다음은 한 개발자의 `~/.claude/projects` 로그를 `tools/fable-leaktest.js`로 읽기 전용으로
스캔한 결과입니다(**예시이며, 한 대의 머신, 특정 시점의 스냅샷 — 로그가 늘어나면 수치는 변동합니다**):

| model | median words/msg | tool:text ratio | caveat % | "I'll/Let me" % |
|---|---|---|---|---|
| **fable** | 15 | 6.78 | 0.3 | 4.7 |
| opus | 32 | 1.47 | 0.9 | 13.8 |
| sonnet | 51 | 1.14 | 3.7 | 42.9 |

Fable은 더 간결하고, 서술 한 단위당 더 많이 행동하며, 덜 에두르고(hedge), 자기 서술(self-narrate)을 덜
합니다. 이것들은 작업 스타일의 **표면 대리지표(surface proxies)**이지 정확성의 척도가 아니며, 이 표는
**모델 간 기준선 격차이지 — 이 프로파일의 적용 전/후가 아닙니다.** 프로파일은 다른 모델들을 Fable의 열
(column)을 향하도록 겨냥합니다. 설치 후 `--since <install-date>`로 다시 실행해서 당신 자신의 수치가
실제로 움직였는지 확인하세요.

## 설치 (이 머신, 항상 켜짐)

**요구 사항:** [Claude Code](https://claude.com/claude-code)와 Node.js ≥ 18. 플랫폼: macOS / Linux
(설치 스크립트와 bash 훅은 POSIX 셸입니다; MCP 서버와 SubagentStart 훅은 Node이므로 Windows에서도
동작합니다 — Windows에서는 WSL로 설치하거나 출력 스타일 + MCP를 수동으로 설정하세요, 아래 참고).

```bash
git clone https://github.com/elon-choo/fablever ~/work/fable-profile   # or wherever
cd ~/work/fable-profile
./install.sh                  # output style (default) + SubagentStart hook + MCP server
./install.sh --help           # all options
# restart Claude Code (or /clear) so the output style and MCP load
```

옵션:

| flag | 효과 |
|---|---|
| *(none)* | 출력 스타일을 기본값으로(always-on) + **SubagentStart 훅**(모든 서브에이전트에 도달) + **두 개의 SessionStart 훅**(최초 실행 온보딩 + 일일 모델 점검, 둘 다 fail-open) + MCP 등록 |
| `--with-hook` | 메인 세션에 대해 옵트인(opt-in) 방식의 매 턴 재주입(re-injection) 훅도 추가("왜 옵트인인가" 참고) |
| `--no-subagent` | SubagentStart 훅 건너뛰기(서브에이전트에 주입하지 않음) |
| `--no-onboard` | 최초 실행 온보딩 SessionStart 훅 건너뛰기 |
| `--no-modelcheck` | 일일 최신 모델 점검 SessionStart 훅 건너뛰기 |
| `--no-style` | 스타일 파일은 설치하되 기본값으로 설정하지 않음(`/config`에서 "Fable" 선택) |
| `--no-mcp` | MCP 서버 건너뛰기 |
| `--uninstall` | 모든 것을 제거; 이전 설정을 복원 |

모든 훅은 fail-open(어떤 오류에서도 0으로 종료)이며 환경 변수로 개별 비활성화할 수 있습니다
(`FABLE_ONBOARD=off`, `FABLE_MODELCHECK=off`, `FABLE_PROFILE=off`). `--uninstall`은 이들을 모두 제거하고
이전 설정을 복원합니다. 무엇이 당신의 머신에 설치되며 어떻게 되돌리는지: §"무엇이 설치되는가".

설치 스크립트는 어떤 편집이든 하기 전에 **`settings.json`을 백업**하며 오직 `outputStyle`과 자신의 훅
항목만 건드립니다 — 다른 모든 훅, 권한, 설정은 그대로 둡니다. 직접 검증하세요:
`bash test/install-test.sh`는 일회용 `HOME`에서 전체 설치/`--with-hook`/제거 수명 주기를 실행하고,
당신의 기존 훅·권한·`effortLevel`이 살아남으며 제거 시 그것들이 복원됨을 단언(assert)합니다.

### 비활성화 / 제거

```bash
export FABLE_PROFILE=off       # turns off the fablever HOOKS (injections) for this shell
# The always-on output STYLE is static and is NOT env-toggleable — to turn it off too:
#   • switch output style in /config (pick a non-Fable style), or
./install.sh --uninstall       # full removal (restores your prior output style + settings)
```

즉 `FABLE_PROFILE=off`는 주입된 리마인더를 잠재우지만 Fable *스타일* 계층은 그대로 둡니다. 스타일까지
제거하려면 `/config`나 `--uninstall`을 쓰세요. (기능별 스위치: `FABLE_ONBOARD=off`,
`FABLE_MODELCHECK=off`, `FABLE_ULTRA=off`, `FABLE_XVERIFY=off`, `FABLE_FUSION=off`.)

## 무엇이 설치되는가

- **출력 스타일** `~/.claude/output-styles/Fable.md` — 항상 켜져 있는 레버입니다. 세션 시작 시
  `keep-coding-instructions: true`로 시스템 프롬프트에 거버너(governor)를 덧붙이므로 Claude Code의 코딩
  동작 위에 **포개집니다(layers onto).** 캐시로 비용이 상각되며(cache-amortized), 실행 표면(execution
  surface)이 없습니다.
- **MCP 서버** `mcp/src/server.js` — **의존성 제로**(`@modelcontextprotocol/sdk` 없음, `npm install`할
  것이 전무; stdio JSON-RPC 2.0 핸드셰이크를 직접 손으로 구현 — 감사 가능한 ~250줄, 17개의 프로토콜
  테스트로 커버됨 — *바로 그것이* 신뢰해야 할 SDK 의존성이 없는 이유입니다). 노출하는 것:
  - 도구 `get_fable_profile({variant: core|compact|full})` — 조종(steering) 텍스트를 가져옴(서브에이전트도
    호출 가능).
  - 도구 `fable_lint({text})` — 초안 메시지/계획을 원칙에 비추어 결정론적으로 점검(화살표 체인(arrow-
    chains), 허락 요청으로 끝맺기, 행동 없는 의도(intent-without-action), 스코프 크리프(scope creep),
    과잉 포매팅 등을 플래그).
  - 도구 `fable_status()` — 지금 fablever가 켜져 있는지, 어떤 비용 모드인지, 어떤 리뷰어 프리셋인지,
    그리고 적용 중인 FABLE_* 오버라이드를 알려줌. 세션 안에서 "이게 켜져 있긴 한가 / 어떻게 바꾸지"에
    대한 답.
  - 프롬프트 `fable-mode` — 요청 시 전체 프로파일을 주입(`/mcp__fable-profile__fable-mode`).
  - 리소스 `fable://profile/{full,compact,core}`.
- **SubagentStart 훅** `~/.claude/hooks/fable-subagent.js`(기본 켜짐) — **생성되는 모든 서브에이전트**
  (포그라운드, 백그라운드/`run_in_background`, 그리고 워크플로 에이전트)에 *compact* 리마인더를 주입합니다
  — 출력 스타일과 메인 세션 훅이 도달할 수 없는 에이전트들입니다. Fail-safe(항상 0으로 종료),
  의존성 제로 Node.
- **SessionStart 훅**(기본 켜짐, 둘 다 fail-safe, 의존성 제로 Node) — `~/.claude/hooks/fable-onboard.js`는
  당신이 기본값을 확정할 때까지 일회성 최초 실행 설정을 진행하고(그 후에는 조용히 있음;
  `FABLE_ONBOARD=off` 또는 `--no-onboard`), `~/.claude/hooks/fable-model-check.js`는 더 새로운 검증
  모델이 나타나면 24시간에 최대 한 번 알림을 띄웁니다(캐시된 파일을 읽음 — 대화당 토큰 ~0;
  `FABLE_MODELCHECK=off` 또는 `--no-modelcheck`).
- **런타임 복사본** `~/.claude/fable-profile/runtime/` — 등록된 서버 + SessionStart 훅이 실행 기준으로
  삼는 `mcp/ fusion/ profiles/ orchestration/`의 불변(immutable) 복사본입니다(변경 가능한 클론이 아니라).
  더해 훅이 어느 디렉터리에서든 이를 해석할 수 있도록 `fable-home` 포인터가 포함됩니다.
- **옵트인 훅** `~/.claude/hooks/fable-reinject.sh` — **메인** 세션의 긴 세션 감쇠(long-session decay)에
  맞서기 위해 매 턴 작은 *core* 리마인더를 재주입합니다. 모델 인식형(Fable급 모델은 건너뜀),
  fail-safe.
- **프로파일** `profiles/{full,compact,core}.md` — 단일 진실 원천(single source of truth)이며,
  `~/.claude`로 심볼릭 링크됩니다.

### 왜 이 훅은 옵트인인가

`UserPromptSubmit` 훅은 *매 턴* 조종 텍스트를 재주입할 수 있는 유일한 방법이지만: 매 턴 토큰을 청구하고
(시스템 프롬프트처럼 캐시로 상각되지 않음), 머신별이며, **워크플로 서브에이전트에서는 발화하지 않습니다**
— 그래서 정확히 다단계 작업이 일어나는 곳에서 부재하게 됩니다. 출력 스타일은 이미 세션 시작 시 전체
거버너를 [내장된 준수 리마인더](https://code.claude.com/docs/en/output-styles)와 함께 싣고 있으므로,
이 훅은 매우 긴 세션을 위한 작은 **감쇠 방지(anti-decay) 부스터**이지 주된 메커니즘이 아닙니다.

> **서브에이전트는 자동으로 커버됩니다.** 출력 스타일과 메인 세션 훅은 Task / 백그라운드 / 워크플로
> 서브에이전트에 도달하지 못하므로(그들은 자체 시스템 프롬프트로 실행됨), 기본 설치는 각 서브에이전트가
> 생성될 때 compact 리마인더를 주입하는 **`SubagentStart` 훅**을 추가합니다. (`SubagentStart`는
> `additionalContext` 주입을 지원하는 문서화된 Claude Code 수명 주기 이벤트입니다 —
> [훅 레퍼런스](https://code.claude.com/docs/en/hooks) 참고; 최신 CLI가 필요하며, 이 이벤트가 없는
> 구버전 빌드에서는 훅이 단순히 무동작(no-op)합니다.) 이 머신에서 종단 간(end-to-end) 검증됨:
> 생성된 서브에이전트가 이를 "SubagentStart hook additional context"로 수신합니다. 훅이 없는 환경
> (또는 *커스텀 에이전트 정의*까지 조종하려면), [`claude-code/subagent-brief.md`](claude-code/subagent-brief.md)
> (영문)의 스니펫과 MCP `get_fable_profile` 도구를 폴백으로 계속 쓸 수 있습니다.

## 다른 곳에서 쓰기 (다른 사람, 다른 MCP 클라이언트)

어떤 클라이언트(Cursor, Windsurf, Claude Desktop, 다른 Claude Code 사용자)에서든 MCP 서버를 등록하세요:

```bash
claude mcp add --transport stdio fable-profile --scope user -- node /abs/path/to/mcp/src/server.js
```

또는 `~/.claude.json` / `.mcp.json`의 JSON 형식으로:

```json
{ "mcpServers": { "fable-profile": { "type": "stdio", "command": "node",
  "args": ["/abs/path/to/mcp/src/server.js"] } } }
```

그러면 `get_fable_profile` / `fable-mode` 프롬프트가 MCP가 동작하는 어디서든 작동합니다. *그들의* 머신에
항상 켜진 상태로 두려면, 그들도 `./install.sh`를 실행하면 됩니다(출력 스타일이 이식 가능한 always-on
표면입니다). "옵트인 없이 모두에게 강제로 켜는" 경로는 없습니다 — 설계상 그렇습니다: Claude Code의
`force-for-plugin` 프런트매터는 플러그인에 번들된 출력 스타일에만 적용되며 우리 같은 사용자 스타일에는
무시됩니다.

## Fusion — 멀티모델 숙의 (선택, 기본 꺼짐)

어려운 질문에 대해 두 번째, 세 번째 의견을 받고 싶으신가요? 선택적 [Fusion 모듈](fusion/README.md) (영문)은
[OpenRouter Fusion](https://openrouter.ai/docs/guides/features/plugins/fusion)으로 연결됩니다: 모델 패널
(기본 **Opus + GPT + Gemini**)이 병렬로 답하고, 심사관이 이들을 비교하며, 최종 답이 — Fable 스타일로 —
종합됩니다.

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."   # an API key (NOT OAuth login) — see fusion/README.md
./install.sh --with-fusion                 # registers a SEPARATE fable-fusion MCP server
```

이것은 프로젝트에서 네트워크에 접근하거나 키가 필요한 **유일한** 부분이며, 자체 MCP 서버에 격리되어
있습니다 — 코어는 둘 중 어느 것도 절대 갖지 않습니다. `FABLE_FUSION=off`로 비활성화하고
`./install.sh --uninstall`로 제거하세요. **인증 참고:** OpenRouter는 **API 키**를 사용합니다;
"ChatGPT/Gemini 계정으로 로그인"하는 경로는 없습니다(BYOK로 당신 자신의 OpenAI/Google 키를 서버 측에
추가할 수 있습니다). 전체 설정·인증·비용 상세는 [`fusion/README.md`](fusion/README.md) (영문)에 있습니다.

같은 fusion 서버는 **`fable_cross_verify`** 도 호스팅하며, 이것은 오케스트레이션 verify 루프의 선택적
[교차 모델 검증](orchestration/xverify.md) (영문)을 구동합니다: 다른 가중치(different-weights) 모델
(GPT + Gemini)이 Claude 회의론자(skeptic) 패널을 교차 점검하여 그 패널의 상관된(correlated) 맹점을
잡아냅니다. 기본 꺼짐이며 **꺼져 있을 때는 오버헤드가 제로**입니다; `./install.sh --with-xverify=openrouter`
(또는 OpenRouter 키 대신 codex MCP를 쓰려면 `=codex`)로 활성화하세요. 설치 스크립트가 옵션을 비용과 함께
출력합니다.

## 검증

```bash
node test/mcp-test.js                  # 17 MCP protocol checks
node test/fusion-test.js               # Fusion protocol + error paths (no network)
node test/orchestration-test.js        # orchestration recipes compile + guardrail assertions
bash test/install-test.sh              # install/uninstall safety lifecycle
node tools/fable-leaktest.js           # behavioral baseline from your own logs
node tools/fable-leaktest.js --since <install-date>   # did the profile move the needle?
```

## 공급망 위생 (Supply-chain hygiene)

**코어** — 출력 스타일, 훅, 그리고 `mcp/src/server.js` — 는 검사 가능한 평문(plain text)만으로
구축됩니다: 출력 스타일 마크다운 파일, 작은 [감사된](docs/RESEARCH.md#4-supply-chain-findings-every-reused-idea-was-static-analyzed)
훅, 그리고 의존성 제로 Node MCP. `npx`/`pip`/`curl|sh` **없음**, postinstall 없음, 서드파티 패키지 없음,
**네트워크 호출 없음, 자격증명 읽기 없음.** 이 연구는 그러한 것들 중 하나라도 요구하는 도구를 의도적으로
피했습니다(`tweakcc` 바이너리 패치, MuAPI 키 프록시 깔때기, 유출된 원시 시스템 프롬프트 붙여넣기) —
[`docs/RESEARCH.md`](docs/RESEARCH.md) (영문) §4 참고.

**유일한** 예외는 선택적이고 기본 꺼짐인 [Fusion 모듈](fusion/README.md) (영문)입니다: *당신이* 이를
활성화하면, 그것이(그리고 오직 그것만이) *당신의* API 키로 OpenRouter에 네트워크 호출을 합니다. 이는
npm 의존성이 제로인 별도의 MCP 서버이므로(내장 `fetch` 사용), Fusion이 켜져 있든 꺼져 있든 코어의 보장은
변하지 않습니다.

## 라이선스

MIT.
