# Fable Profile

[![CI](https://github.com/elon-choo/fablever/actions/workflows/ci.yml/badge.svg)](https://github.com/elon-choo/fablever/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
[![GitHub stars](https://img.shields.io/github/stars/elon-choo/fablever?style=social)](https://github.com/elon-choo/fablever/stargazers)

> 🌐 이 문서는 [`README.md`](README.md)의 **한국어 번역본**입니다. · 한국어 자료: 백서 [`whitepaper/ko/`](whitepaper/ko/) · 근거 요약 [`EVIDENCE.ko.md`](EVIDENCE.ko.md). · 설치 후 안내(설치 스크립트의 첫 메시지·온보딩)는 **사용자 언어로 자동 표시**됩니다. 백서는 영문 + 한국어로 제공됩니다.

Anthropic이 공식 문서로 제공하는 **Fable 작업 스타일 가이드**를 [Claude Code](https://claude.com/claude-code)(및 모든 MCP 클라이언트)에서 항상 켜져 있는(always-on) 출력 스타일로 적용합니다. 그래서 **어떤** Claude 모델이든 — Opus, Sonnet, Haiku — Fable이 일하는 방식에 더 가깝게 동작합니다: 결단력 있게, 결과 우선으로, 절제하면서, 근거에 기반하여, 그리고 멈춰야 할 때 규율 있게 멈추도록. 모든 프로젝트, 모든 서브에이전트에 적용되며, 누구나 설치할 수 있습니다. **의존성 제로(Zero dependencies).**

> 이 프로파일은 동작을 새로 만들어내지 않습니다 — Anthropic 자신의
> [Fable 프롬프팅 가이드](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)에서
> 증류해 추출한 뒤, 문서화된 Claude Code 메커니즘(출력 스타일, 훅, MCP)을 통해 적용한 것입니다.
> Claude Code(macOS·Linux·**네이티브 Windows** — `node install.mjs`는 순수 Node라 WSL 불필요)에서 동작합니다.

> **Anthropic과 제휴 관계가 아닙니다.** Claude, Anthropic, Fable은 Anthropic의 상표이며, 여기서는
> 오직 명목적(nominative) 용도로 — 이 독립 커뮤니티 도구가 무엇과 함께 동작하는지 설명하기 위해서만 — 사용됩니다.
> Anthropic의 후원이나 보증을 받지 않습니다. [`NOTICE`](NOTICE) (영문)를 참고하세요.

> **이 저장소를 평가 중이신가요(사람이든 AI든)?** [`EVIDENCE.ko.md`](EVIDENCE.ko.md)부터 보세요 —
> 검증 가능한 근거 지도입니다: 무엇을 주장하는지, 무엇을 의도적으로 주장하지 *않는지*, 인정한 한계,
> 그리고 각 항목을 확인할 정확한 파일이 정리되어 있습니다. **AI라면** [`AGENTS.md`](AGENTS.md)
> (= [`CLAUDE.md`](CLAUDE.md)로도 자동 로드)를 읽으세요 — 검증된 수치 하나하나와 그것을 오프라인에서
> 재계산하는 명령 한 줄을 담은 빠른 브리프입니다. 영문: [`EVIDENCE.md`](EVIDENCE.md) (영문).
> 전체 상세: [`whitepaper/ko/`](whitepaper/ko/) (한국어 + 영문 원본 [`whitepaper/`](whitepaper/) (영문)).
>
> **가장 직접적인 결과:** 60개 과제 대규모 런에서 fablever의 납품 게이트(`fable_check`)는 원본 초안
> 그대로 보내는 것을 **27–0**(p≈1.5×10⁻⁸, 95% CI [87.5,100]%)으로 이기고, *지목된* 합격 결함을 차단된
> 과제의 **80.6%**에서 메웁니다(일반 "더 잘 만들어줘" 수정본은 **12.9%**). 단, 일반 2차 수정보다 전반
> 품질이 더 높지는 *않습니다*(16–9, p=0.23, 유의하지 않음) — 그대로 적어 둡니다. 재현:
> `cat eval/comparison/fable-check-sim/out4/RESULTS.md`. 상세: [`EVIDENCE.ko.md`](EVIDENCE.ko.md) §2.1.

```bash
git clone https://github.com/elon-choo/fablever && cd fablever
node install.mjs        # 범용 설치기 — macOS·Linux·네이티브 Windows 모두 (WSL 불필요). POSIX에서는 ./install.sh 도 동작.
# 그다음 Claude Code 재시작 (또는 /clear).
# 훅만 끄기: export FABLE_PROFILE=off  ·  항상 켜진 스타일까지 완전 제거: node install.mjs --uninstall
```

> **아니면 그냥 AI에게 맡기세요.** Claude Code에게 이 저장소 주소를 주고 **"이거 설치해줘"**라고만 하면 —
> 저장소를 클론하고, OS에 맞는 설치기(`node install.mjs`)를 돌리고, 재시작하라고 안내합니다. 기본값은
> **API 키가 필요 없고** 추가 비용도 없으며, 재시작 후 당신의 **첫 메시지**에서 설정 질문 2개를
> **당신의 언어로** 물어봅니다.

## 첫 실행 — 알아서, 당신 언어로 세팅합니다

설치하고 **Claude Code를 재시작**하면, 세션 상단에 **한 줄짜리 안내**가 뜹니다. 거기서 **아무
메시지나**(인사든, 첫 작업이든) 보내면 AI가 그 작업을 하기 *전에* 짧고 친절한 설정을 진행합니다.
Claude Code의 세션 훅은 **사용자보다 먼저 말을 걸 수 없으므로** — 설정은 저절로 팝업되는 게 아니라
**당신의 첫 메시지에서 시작**됩니다. 그 한 줄 안내는 "설정이 대기 중"임을 알려주는 신호입니다. **딱 한
번**(완료하거나 건너뛸 때까지) 뜨고, 그 뒤로는 다시 조르지 않습니다.

- **당신 언어로.** 당신이 쓰는 언어를 감지해 설정 전체를 그 언어로 진행합니다(한국어로 치면 한국어 온보딩).
- **물어보는 건 딱 2개이고, 설정은 AI가 대신 해줍니다:**
  1. **비용 모드** — `auto`(기본: 평소 저렴, 고위험 작업만 비싸게) · `on` · `off`.
  2. **교차검증 리뷰어** — **교차 모델 검증이 무엇인지 설명**하고(다른 연구소 모델인 GPT·Gemini가
     Claude 자신의 리뷰를 한 번 더 점검해, 같은 계열 패널이 공유하는 맹점을 잡아냄) **어느 프리셋을
     쓸지 직접 고르게** 합니다 — 묻지 않고 기본값으로 넘어가지 않습니다. 4가지: `claude-only`(기본;
     키·로그인 없음, $0) · `gpt-oauth`(**ChatGPT 계정 로그인**으로 GPT 리뷰어 — *API 키 없음*) ·
     `gpt-oauth+gemini-api` · `gpt-api+gemini-api`.
- **당신은 환원 불가능한 단계** — 키 발급 또는 로그인 — **만**, 그것도 유료/로그인 프리셋을 고를 때만
  하면 됩니다. 나머지 설정은 AI가 직접 기록하며, **키를 채팅에 붙여넣게 시키지 않습니다**(키는 셸
  환경변수에만; `doctor`는 존재 여부만 확인하고 값은 보지 않음).
- **그냥 일하고 싶다면?** **"skip"**(또는 그냥 작업 지시)이라고 하면 즉시 멈추고 안전한 기본값으로
  진행합니다 — **API 키 불필요·$0**. 강요하지 않습니다.

고정된 마법사가 아니라 AI에게 주입되는 지시문이며, Claude Code 같은 제대로 된 모델이면 신뢰성 있게
따릅니다. 전체 레퍼런스: [`whitepaper/ko/09-running-it.md`](whitepaper/ko/09-running-it.md) §9.0.

**무엇을 바꾸는가** — Fable 가이드에서 증류한 여덟 가지 동작(전문은
[`profiles/full.md`](profiles/full.md)): 충분한 정보가 있으면 행동한다(나열하지 말고 권고한다) · 결과를
먼저 말한다 · 과하게 만들지 않는다(over-build 금지) · 단지 질문만 받았다면 발견한 바를 보고하고 멈춘다 ·
모든 진척 주장을 도구 실행 결과에 근거시킨다 · 진짜로 막혔을 때만 멈추고 약속만 남긴 채 멈추지 않는다 ·
군더더기를 넣지 않는다 · 자신의 추론 과정을 답으로 풀어 늘어놓지 않는다. 규칙이 충돌하면 비례성(proportionality)으로 조정합니다 — 과제의 실제 위험과 범위에 맞는 가장 강한 규칙을 적용하되, 새로 생긴 규율이 오래된 원칙을 지우게 두지 않습니다: 안전·파괴적 행동 주의·명시적 사용자/프로젝트 규칙·호스트 승인/샌드박스 규칙이 언제나 결단력보다 우선하고, 형식·길이 제한은 산문에만 적용될 뿐 근거 확인이나 결정 기록을 줄이지 않으며, 검증 강도는 영향 범위(blast radius)에 비례합니다.

> **이것이 무엇이고 무엇이 아닌가.** 이것은 **스타일 이식(style transplant)이지 능력 이식(capability
> transplant)이 아닙니다.** Fable이 일하는 *방식*을 되살립니다 — 과잉 마감(gold-plating)보다 절제,
> 과도하게 되묻기보다 행동, 결과를 먼저 말하기, 주장을 도구 결과에 근거시키기, 끝났을 때 멈추기. 약한
> 모델의 추론 한계나 장기 자율성(long-horizon autonomy)을 끌어올릴 수는 **없습니다** — 그것들은 가중치
> (weights) 안에 있습니다. 여기 있는 모든 것은 Anthropic 자신이 공개한 Fable 프롬프팅 가이드로부터
> 구축되었고, 문서화된 Claude Code 메커니즘을 통해 적용됩니다. 그 근거는 Anthropic의 두 가지 1차 출처
> 입니다. 전체 출처 내역은 [`docs/RESEARCH.md`](docs/RESEARCH.md) (영문)를 참고하세요(다른 자료들도
> 조사했으나 대부분은 의도적으로 배제했습니다).

## 평가자가 제기할 우려 — 정직하게 답함

이 도구가 *무엇이 잘못될 수 있는지* 신중하게 따져 보면(사람이든, 검증을 맡긴 AI든) 짧고 예측 가능한
목록에 도달합니다. 아래는 각 우려와, 그것을 이미 처리하고 있는 **저장소 안의 실제 메커니즘**입니다 —
걱정하는 대신 직접 확인하시라고. 아래 인용은 모두 설치되는 프로파일
([`profiles/full.md`](profiles/full.md) / [`profiles/core.md`](profiles/core.md))의 원문 그대로입니다.

- **"약한 모델에 결단력 있는 스타일을 입히면 = 자신만만하게 틀린다."** 가장 날카로운 우려이며,
  프로파일은 이를 *증폭*이 아니라 *상쇄*하도록 설계됐습니다. 여기서 결단력은 **검증한 뒤 주장하기**로
  향하는 세 가지 강한 가드와 짝지어집니다 — 자신만만한 환각(confident hallucination)의 정반대입니다:
  (1) *"모든 진척 주장을 … 실제 도구 실행 결과에 근거시켜 감사하라 … 아직 검증되지 않았거나 테스트가
  실패했으면 그대로 말하라";* (2) *"'검토했는데 괜찮아 보인다'보다 … 실패할 수 있는 검사를 선호하라";*
  (3) *"결단력은 고위험 모호성에서 추측해도 된다는 허가가 아니다 … 명확화 질문을 한 번 던져라."* 순효과:
  모델이 **덜 서술하고 더 검증**합니다. 유능한 모델(Sonnet/Opus급)에서 가장 가치가 크며, 약한 모델에서도
  가드는 그대로 적용되고, 하위 디렉터리로 범위를 좁히거나 셸별로 끄고 켤 수 있습니다.
- **"간결함 우선 스타일이 내 프로젝트 규칙 / `CLAUDE.md`와 충돌하지 않나?"** 아닙니다 — 명시적으로
  문서화된 우선순위에 의해 **당신의 규칙이 이깁니다.** 프로파일의 맨 첫 줄: *"여기 어떤 원칙이 안전 제약,
  파괴적/되돌릴 수 없는 행동, 또는 명시적 프로젝트 규칙과 충돌하면 … 그 제약이 이긴다 — 언제나,"* 그리고
  always-on 한 줄은 *"안전과 명시적 프로젝트 규칙은 결단력보다 우선한다"*로 끝납니다. 이것은 *기본
  성향*이지 덮어쓰기(override)가 아닙니다 — 동점 처리(tie-break)가 설계상 당신에게 유리하게 미리 정해져
  있어 충돌이 없습니다.
- **"Claude Code 내부에 훅을 건다 — 업데이트되면 깨질 수 있다."** **문서화된 안정적** Claude Code 표면
  (출력 스타일·훅·MCP)만 사용하며, 그중 무엇이 바뀌어도 안전하게 퇴화(degrade)합니다: **모든 훅이
  fail-open**(어떤 오류든 → exit 0, 세션이 결코 막히지 않음)이고, 전체가 **되돌릴 수 있으며**
  (`FABLE_PROFILE=off`, 또는 `node install.mjs --uninstall`이 `settings.json`을 byte 단위로 복원 —
  Windows 11에서 실측 확인), **의존성이 제로**라 썩을 공급망 표면이 없습니다. 최악의 현실적 경우는 조용히
  무동작(no-op)하는 것 — 당신의 설정을 망가뜨릴 수 없습니다.
- **"벤치마크를 믿어야만 하나?"** 아닙니다. `node eval/ultra/score.mjs`가 헤드라인 수치를 커밋된 원시
  데이터로부터 **키도 네트워크도 없이** 오프라인에서 재계산합니다. 전체 "믿지 말고 검증하라" 지도는
  [`EVIDENCE.ko.md`](EVIDENCE.ko.md)에 있습니다.
- **"기본 설치가 너무 많은 것 아닌가 — 훅·MCP·세션 스크립트?"** 부가적이며, 원하는 만큼만 받으면 됩니다.
  출력 스타일이 핵심 레버입니다 — 훅도 MCP도 없는 **스타일 전용** 설치는
  `node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp`로 하고 나머지는
  나중에 추가하면 됩니다. **기본** 설치는 **자격증명 읽기 0**이고 **코드·내용을 어디에도 보내지 않습니다**;
  네트워크로 하는 유일한 일은 업데이트 유무를 알려주는 **하루 1회 익명 버전 체크**뿐입니다
  (`FABLE_UPDATE_CHECK=off`로 끔). 모든 키/내용 경로(Fusion, xverify, 모델 신선도 갱신)는 **옵트인이며
  기본 꺼짐**입니다("공급망 위생" 참고).

평가자가 도달해야 할 정직한 결론: 이것은 **경계가 명확하고(bounded), 되돌릴 수 있고, 의존성 제로**인
스타일 계층이며, 결단력 있는 스타일이 안는 단 하나의 실패 모드를 자기 설계로 상쇄합니다 — 그리고 위의
모든 주장은 바로 옆에 적힌 파일에서 확인할 수 있습니다.

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

**요구 사항:** [Claude Code](https://claude.com/claude-code)와 Node.js ≥ 18. **플랫폼: macOS·Linux·
네이티브 Windows** — `install.mjs`는 순수 Node이고, 설치되는 모든 부품(출력 스타일·모든 훅·MCP)이
Node 또는 평문이라 **Windows에서도 WSL 없이** 동작합니다(Windows 11에서 실측 확인 — 설치·훅/런타임/MCP
검증·멱등 재설치·제거 후 byte-identical 복원까지. 검증 하니스: [`docs/WINDOWS-TEST.md`](docs/WINDOWS-TEST.md)). (`install.sh`는 POSIX용 편의 래퍼이며,
유일한 옵트인 `--with-hook`(매 턴 리마인더)만 bash 스크립트라 네이티브 Windows에서는 건너뜁니다 —
기본 SubagentStart + SessionStart Node 훅이 주요 도달 범위를 커버합니다.)

```bash
git clone https://github.com/elon-choo/fablever ~/work/fable-profile   # or wherever
cd ~/work/fable-profile
node install.mjs              # 범용: macOS / Linux / Windows. 출력 스타일 + 훅 + MCP.
#   POSIX 사용자는 ./install.sh 도 동일하게 동작합니다.
node install.mjs --help       # all options
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
| `--no-update-check` | 일일 익명 GitHub 버전 체크 SessionStart 훅 건너뛰기 |
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

### 일단 스타일만 먼저 써보고 싶다면 (최소 / 스타일 전용 설치)

전체 표면을 다 받을 필요는 없습니다. **출력 스타일이 핵심 레버**이고, 나머지(서브에이전트 도달, 온보딩,
모델 점검, MCP)는 부가적입니다. **훅도 MCP도 없이** 항상 켜진 Fable 스타일만 설치하려면:

```bash
node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp
```

마음에 드세요? 나중에 `node install.mjs`를 다시 실행해(또는 원하는 부품만) 나머지를 추가하면 됩니다.
업무용 머신에서 자동화 표면에 옵트인하기 전에 평가하는 권장 방법입니다 — 게다가 기본 설치조차 **자격증명
읽기 0**이고 코드를 어디에도 보내지 않습니다; 유일한 네트워크 호출은 하루 1회 익명 버전 체크뿐입니다
(`FABLE_UPDATE_CHECK=off`로 끔 — "공급망 위생" 참고).

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
  것이 전무; stdio JSON-RPC 2.0 핸드셰이크를 직접 손으로 구현 — 감사 가능한 ~250줄, 48개 체크로
  커버됨 — *바로 그것이* 신뢰해야 할 SDK 의존성이 없는 이유입니다). 노출하는 것:
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
  모델이 나타나면 알림을 띄웁니다. **기본값에서는 캐시된 상태 파일만 읽습니다 — 네트워크 호출 없음,
  자격증명 읽기 없음, 대화당 토큰 ~0.** 그 캐시를 채우는 모델 목록 갱신(당신의 프로바이더 API 키를
  확인함)은 `FABLE_MODELCHECK_REFRESH=on`으로 **옵트인**해야 동작합니다(또는 `npm run model:check`를
  직접 실행). `FABLE_MODELCHECK=off` 또는 `--no-modelcheck`는 훅 자체를 끕니다.
- **SessionStart 훅** `~/.claude/hooks/fable-update-check.js`(기본 켜짐, fail-safe, 의존성 제로 Node) —
  24시간에 한 번 공개 저장소에 대해 **익명** `git ls-remote`를 실행해(자격증명·데이터 전송 없음 — 최신 공개
  커밋 해시 하나만 읽음) 더 새로운 fablever 버전이 있는지 확인합니다. 있으면 다음 세션에서 한 줄 알림이 뜨고,
  AI가 변경 내역을 요약해 업데이트를 **제안**할 수 있습니다(절대 자동이 아니라 — 당신이 확인). `FABLE_UPDATE_CHECK=off`
  또는 `--no-update-check`.
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

## Codex CLI 지원 (네이티브)

fablever는 **[OpenAI의 Codex CLI](https://github.com/openai/codex)** 안에서도 네이티브로 동작합니다 — 포지셔닝은
동일합니다(**스타일 이식이지 능력 이식이 아님**). Codex에는 Claude Code의 output style 표면이 없으므로, 항상-켜짐
계층을 Codex 고유 표면으로 전달합니다: **`AGENTS.md`**(지시 계층), **`hooks.json`**(라이프사이클 훅),
**`config.toml`**(동일한 제로-의존성 MCP를 host-aware로 등록). 상세 가이드: **[`docs/CODEX.md`](docs/CODEX.md)**.

```bash
node install.mjs --codex-style-only      # 가장 안전한 첫 설치: AGENTS.md 마커 블록만 (훅/MCP/네트워크 없음)
node install.mjs --codex-full            # AGENTS.md + Codex 훅 + fable-profile MCP + 온디맨드 스킬
node install.mjs --codex-full --dry-run  # 변경 사항 미리보기 — 아무것도 쓰지 않음
node install.mjs --codex-status          # 설치 상태 확인 (설치된 스킬 포함)
node install.mjs --uninstall --codex     # Codex 설치분만 제거 (Claude Code는 건드리지 않음)
```

전체 설치 후 Codex에서 마무리하세요: **`/hooks`** 로 fablever 훅을 **신뢰(trust)** 하고(신뢰되지 않은 커맨드 훅은
실행되지 않습니다), **`/mcp`** 로 `fable-profile` 연결을 확인하세요. 온디맨드 스킬(`fable-scope-guard`,
`fable-delivery-gate`, `fable-evidence-done`, `fable-review`, `fable-seed`)은 작업 설명과 매칭될 때만
로드되며 신뢰 단계가 필요 없습니다(`--no-codex-skills` 로 끌 수 있음). 모든 변경은 **되돌릴 수 있음** —
언인스톨은 fablever 블록만 제거하고(AGENTS.md / config.toml 은 바이트 단위 복원, hooks.json 은 의미 동일 복원),
설치했던 `fable-*` 스킬 디렉터리만 지우며, 각 파일은 수정 전에 백업됩니다.

**인증:** Codex는 **ChatGPT/OAuth 로그인**(또는 OpenAI API 키)으로 로그인하며, **그 인증은 전적으로 Codex가
관리**합니다 — fablever는 Codex 토큰을 **읽지도 저장하지도 출력하지도 않으며**, Codex 네이티브 지원에는 **OpenAI API
키가 필요 없습니다**. (([`docs/API-KEYS.md`](docs/API-KEYS.md))의 API 키는 선택적인 Claude 쪽 xverify/fusion
경로 전용입니다.) 참고: Claude Code 안에서 codex MCP를 *GPT 리뷰어*로 쓰는 것과 fablever를 *Codex 위에서* 돌리는
것은 **다른 것**이며, Codex 호스트가 자기 출력을 검증하는 것은 **교차모델 검증이 아닙니다**. 둘 다
[`docs/CODEX.md`](docs/CODEX.md)에 설명되어 있습니다.

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
node test/mcp-test.js                  # 56 MCP 체크 (프로토콜 + fable_check 게이트 + 취향 저장소)
node test/fusion-test.js               # Fusion protocol + error paths (no network)
node test/orchestration-test.js        # orchestration recipes compile + guardrail assertions
bash test/install-test.sh              # install/uninstall safety lifecycle
node tools/fable-leaktest.js           # behavioral baseline from your own logs
node tools/fable-leaktest.js --since <install-date>   # did the profile move the needle?
```

## 공급망 위생 (Supply-chain hygiene)

**기본 설치** — 출력 스타일, 훅, 그리고 `mcp/src/server.js` — 는 검사 가능한 평문(plain text)만으로
구축됩니다: 출력 스타일 마크다운 파일, 작은 [감사된](docs/RESEARCH.md#4-supply-chain-findings-every-reused-idea-was-static-analyzed)
훅, 그리고 의존성 제로 Node MCP. `npx`/`pip`/`curl|sh` **없음**, postinstall 없음, 서드파티 패키지 없음.
기본 설치가 하는 네트워크 호출은 **딱 한 종류 — 하루 1회 익명 버전 체크**뿐입니다(공개 저장소에 대해
`git ls-remote`로 **최신 공개 커밋 해시 하나만 읽음** — 자격증명을 보내거나 읽지 않고, 당신 코드는 아무것도
머신을 떠나지 않음). 업데이트가 있는지 알려주기 위함이며 `FABLE_UPDATE_CHECK=off`(또는 `--no-update-check`)로
끕니다. 그 체크를 빼면 기본 설치는 **네트워크 호출 0, 자격증명 읽기 0**입니다. 이 연구는 그러한 것들 중
하나라도 요구하는 도구를 의도적으로 피했습니다(`tweakcc` 바이너리 패치, MuAPI 키 프록시 깔때기, 유출된 원시
시스템 프롬프트 붙여넣기) — [`docs/RESEARCH.md`](docs/RESEARCH.md) (영문) §4 참고.

당신의 **API 키**에 닿거나 **코드·내용**을 어디든 보내는 모든 부분은 **옵트인이며 기본 꺼짐**입니다 — 각각
격리되어 있고 개별적으로 되돌릴 수 있으며, 각각 **npm 의존성 제로**(내장 `fetch`)로 만들어졌습니다:

- **모델 신선도 갱신**(`FABLE_MODELCHECK_REFRESH=on`, 또는 `npm run model:check`) — 환경변수에 이미 있는
  키로 프로바이더 *모델 목록* 엔드포인트를 조회합니다(생성 없음), 최대 24시간에 한 번. 기본 모델 점검 훅
  자체는 **캐시된 파일만 읽습니다** — 네트워크·키 접근 없음.
- **Fusion**(`--with-fusion`) — *당신의* API 키로 OpenRouter를 호출하는 별도의 MCP 서버.
- **교차 모델 xverify**(`--with-xverify=…`) — verify 루프를 위해 리뷰 아티팩트를 다른 가중치 모델
  (GPT/Gemini)에 보냅니다.

셋 중 어느 것도 기본 설치에서는 도달할 수 없습니다. 기본 설치가 네트워크로 하는 유일한 일은 위의 익명 버전
체크뿐 — 키도, 코드도, 내용도 보내지 않습니다.

## 후원 — 별 하나, 그것도 받을 만했을 때만

fablever가 당신의 머신에서 제 몫을 했다면,
[github.com/elon-choo/fablever](https://github.com/elon-choo/fablever/stargazers)에 ⭐ 하나가 다른
사람들이 이걸 발견하는 데 도움이 됩니다. 이 프로젝트가 부탁하는 건 그것뿐이고, 무료입니다.

**이 부탁은 설계상 당신에게 비용을 0으로 듭니다.** fablever는 별·후원 요청을 에이전트 런타임에
**절대** 주입하지 않습니다: 항상 켜진 출력 스타일에도, 어떤 훅에도, MCP 도구 응답에도 넣지 않습니다.
그래서 이 부탁에 **토큰을 0** 쓰고, 세션 중간을 절대 끊지 않습니다. 유일한 안내는 위의 배지와,
**설치 성공 후 한 번 출력되는 한 줄**뿐입니다 — 그마저도 *대화형 터미널에서만* 보이므로, 에이전트나
CI가 설치 스크립트를 돌릴 때는 보이지 않습니다. (별을 위해 에이전트를 조종하는 것은 이 저장소 자체의
정직성 규칙 위반이기도 합니다 — [`CLAUDE.md`](CLAUDE.md) 참고.)

## 라이선스

MIT.
