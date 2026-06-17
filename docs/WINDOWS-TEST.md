# Windows 설치 검증 — 복사·붙여넣기용 프롬프트

이 문서는 **다른 Windows 컴퓨터에서 fablever를 설치하고 동작을 검증해 보고서를 받기 위한** 것입니다.

## 사용법 (3단계)

1. 그 Windows 컴퓨터에서 **Claude Code**를 엽니다. (사전 준비: Node.js ≥ 18, Git, Claude Code 설치)
2. 아래 **`===== 여기부터 복사 =====`** 와 **`===== 여기까지 복사 =====`** 사이 전체를 복사해서 Windows Claude Code 입력창에 붙여넣고 전송합니다.
3. Claude Code가 설치·검증을 마치면 **마크다운 보고서**를 출력합니다. 그걸 복사해서 저(또는 원하는 곳)에게 주면 됩니다.

> 이 프롬프트는 fablever 소스를 **수정하지 않습니다** — 설치하고, 확인하고, 정직하게 보고만 합니다. 실패가 나오면 실제 에러 원문을 그대로 보고하게 되어 있습니다.

---

===== 여기부터 복사 =====

당신은 **Windows 컴퓨터**에서 동작하고 있습니다. GitHub의 오픈소스 도구 **fablever (Fable Profile)** 를 설치하고, 네이티브 Windows에서 제대로 동작하는지 **검증한 뒤 PASS/FAIL 보고서**를 만들어 주세요. 아래 단계를 순서대로 진행하고, **실제 출력/에러를 그대로 캡처**하세요. **fablever의 소스 코드는 절대 수정하지 말고**, 설치와 검증만 한 뒤 정직하게 보고하세요. (참고: 경로 표기는 Windows 기준 `%USERPROFILE%\.claude\…` 입니다.)

저장소: https://github.com/elon-choo/fablever

**0) 환경 확인** — OS 종류/버전, `node --version`(≥ 18 필요), `git --version`, `claude --version`(Claude CLI가 없으면 그렇게 기록).

**1) 클론** — `git clone https://github.com/elon-choo/fablever` 후 `fablever` 폴더로 이동.

**2) 설치** — `node install.mjs` 를 실행하고 **전체 출력**을 보고. (정상이면 "Installed." 가 출력되고, Windows 로케일이 한국어/일본어 등이면 그 언어로 된 안내 한 줄도 같이 출력됩니다.)

**3) 설치 검증** — 각 항목 PASS/FAIL + 근거(실제 값)와 함께:
- **3a** `%USERPROFILE%\.claude\settings.json` 에 `"outputStyle": "Fable"` 이 있는가.
- **3b** 같은 파일의 `hooks.SessionStart` 에 `fable-onboard.js` 와 `fable-model-check.js` 가, `hooks.SubagentStart` 에 `fable-subagent.js` 가 등록됐는가.
- **3c** (Windows 핵심) 그 훅 command 들이 `node $HOME/...` 가 아니라 **절대경로 형태**(예: `node "C:\Users\...\.claude\hooks\fable-onboard.js"`)인가. — `$HOME` 형태면 Windows에서 안 돌아가므로 반드시 절대경로여야 함.
- **3d** 훅 파일들이 `%USERPROFILE%\.claude\hooks\` 에 실제로 존재하는가.
- **3e** `%USERPROFILE%\.claude\fable-profile\runtime\orchestration\lib\xverify-preset.mjs` 가 존재하는가(런타임에 orchestration 복사됨).
- **3f** `…\fable-profile\mode.json` = `{"ultra":"auto"}`, `xverify.json` 의 preset = `claude-only`, 그리고 `fable-home` 포인터 파일이 있는가.
- **3g** `…\fable-profile\full.md` / `compact.md` / `core.md` 가 존재하고 비어있지 않은가(Windows에서는 심볼릭링크가 아니라 **복사본**이어야 함).

**4) 프로젝트 자체 테스트** — 저장소 폴더에서 `npm test`. 각 항목의 마지막 합격 줄(특히 `install-mjs selftest: N/N`, `17/17 checks passed` 등)을 보고. 만약 마지막 하위테스트(`install-test.sh`)가 bash를 요구하는데 이 Windows에 bash가 없으면 그 사실을 기록하고 — 나머지 Node 테스트(mcp/fusion/orchestration/model/preset/ultra/**install-mjs**)는 돌아가야 하니 **어디까지 돌았는지** 보고.

**5) MCP 확인** — `claude mcp list` 실행 후 `fable-profile` 가 보이는지(가능하면 Connected 여부)를 보고. Claude CLI를 못 찾았다면, install.mjs 가 대신 출력한 수동 `claude mcp add …` 명령을 기록.

**6) 온보딩 훅 직접 실행(Windows에서 모듈 해석 확인)** — 설치된 `%USERPROFILE%\.claude\hooks\fable-onboard.js` 를 `node` 로 직접 실행하되 stdin 으로 `{"source":"startup"}` 을 넣고, **`Cannot find module` 에러 없이** 설정 안내가 담긴 JSON 을 내보내는지 확인. (PowerShell 예: `'{"source":"startup"}' | node "$env:USERPROFILE\.claude\hooks\fable-onboard.js"`)

**7) 재설치 멱등성 + 제거** — `node install.mjs` 를 한 번 더 실행(훅이 중복 등록되지 않아야 함) → `node install.mjs --uninstall` 실행 후, Fable outputStyle 과 우리 훅들이 제거되고 기존 설정은 보존되는지 확인.

**8) (선택, 실사용 확인)** Claude Code 를 재시작(또는 /clear)하고 새 세션 시작 → (i) /config 에서 출력 스타일 "Fable" 이 활성인지, (ii) 첫 세션에서 온보딩이 **당신 언어로** 설정 질문을 했는지 확인.

마지막으로 아래 형식의 **보고서**를 만들어 그대로 출력해 주세요(제가 복사할 수 있게):

```
# fablever Windows 설치 검증 보고서
- 일시 / OS / node / claude 버전:
- 설치(node install.mjs): PASS/FAIL — 핵심 출력 1~2줄:
- 검증 항목 (각 PASS/FAIL + 근거):
  3a outputStyle=Fable:
  3b SessionStart/SubagentStart 훅 등록:
  3c 훅 command 절대경로(Windows):
  3d 훅 파일 존재:
  3e runtime/orchestration 복사:
  3f mode/xverify/fable-home 시드:
  3g profiles 복사(심볼릭 아님):
- npm test (각 줄 결과 / bash 미지원 시 어디까지 돌았는지):
- MCP(claude mcp list) fable-profile:
- 온보딩 훅 직접 실행(Cannot find module 없음):
- 재설치 멱등성 / --uninstall 정상:
- (선택) 재시작 후 스타일 활성 + 온보딩 언어:
- 발견된 문제 / 에러 원문(그대로):
- 종합 판정: 완전 동작 / 부분 동작(어느 부분) / 실패
```

정직하게 — 실패한 게 있으면 **실제 에러 텍스트를 그대로** 붙여 넣고, 추측으로 메우지 마세요. fablever 소스는 수정하지 마세요(읽기 전용 설치+검증).

===== 여기까지 복사 =====

---

## 보고서를 받은 뒤

그 보고서를 저에게 그대로 주시면 — Windows에서 깨진 부분이 있으면 (예: 훅 command 경로 형태, `claude` CLI 해석, bash 의존 테스트) 바로 수정하겠습니다. "완전 동작"이면 README의 "macOS·Linux·네이티브 Windows" 문구가 **실측으로 확정**됩니다(현재는 macOS에서 14개 패리티 테스트로만 검증된 상태).
