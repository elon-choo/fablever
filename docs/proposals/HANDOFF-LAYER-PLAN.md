# fablever Handoff / Context-Reload 레이어 — 기획안 (v0, 다음 세션 실행용)

> 작성: 2026-06-24 (헤드리스 자율 세션) · 상태: **기획 초안 — 깊은 설계·구현·검증은 다음 세션**
> 출처 동기: 운영자(5~10개 프로젝트 비동기 병행)의 컨텍스트 스위칭 비용 최소화를 위한
> "Context Reload Prompt / Handoff Summary" 제안. 이 문서는 그 제안을 fablever의 증거기반·안티블로트
> 철학에 맞춰 **설계 + 사전등록 테스트 계획 + 다음 세션 프롬프트**로 변환한 것.

---

## 0. TL;DR (이 문서를 0.5초에 리로드)

- **무엇:** AI가 긴 작업 후 보고할 때, 보고서 **최상단에 고정 포맷 [Handoff Summary] 블록**(이게 뭐였나 / 뭘 했나 / 지금 당신이 결정할 한 가지+라인넘버)을 두고, 장기·다중세션 작업에는 `.fablever_state.md` 상태파일을 유지하며, 피드백 처리 중 오류는 **최대 3회 자율 수정** 후에만 질문한다.
- **핵심 판단:** 이걸 **무지성 always-on으로 붙이지 말 것.** fablever엔 이미 "Lead with the outcome"·"Decision trail"·"don't end on a promise"가 있어 중복·과잉처방·harness-paradox 위험이 크다(이번 세션 측정: 단발 지시문은 유의미 단일턴 lift 없음, p≥0.18). → **트리거형(조건부) + 출시 전 2-랩 A/B 선검증**으로 간다.
- **이번 세션 산출물:** 이 기획안 + 초안 산출물(governor 문구·state 스키마·훅 스케치·dogfood 예시) + 사전등록 테스트 계획 + 다음 세션 프롬프트(§9).
- **다음 세션 산출물:** 깊은 설계 확정 → 구현(트리거 게이트·skill·hook) → 테스트 실행 → 결과 따라 출시/보류.

---

## 1. 문제와 동기

**시나리오.** 운영자가 5~10개 프로젝트를 비동기로 굴린다. 각 프로젝트의 AI가 알림을 띄우면, 운영자는 "이게 뭐였지?"부터 시작해 코드/로그를 처음부터 다시 읽어야 한다 — 이 **재로딩(reload) 비용**이 다중 프로젝트 운영의 진짜 병목이다. 제안의 주장: AI가 보고 시 **운영자의 기억 주소를 즉시 동기화하는 3줄**을 함께 내면, 알림을 열자마자 0.5초 만에 맥락이 복구된다.

**왜 fablever가 다뤄야 하나.** fablever는 "능력이 아니라 *작동 방식*을 바꾸는 레이어"다. "보고를 어떻게 구조화하는가"는 정확히 작동방식 레이어의 영역이고, 이미 "Lead with the outcome"으로 *부분적으로* 하고 있다. 제안은 그걸 **다중세션 스위칭이라는 특정 맥락에 최적화한 구조화 변형**이다.

**측정 대상이 되는 가치 가설(이 기능이 참이라면):**
- (H-main) Handoff 블록이 붙은 보고서는, *다른 프로젝트를 보다 돌아온* 운영자가 **"지금 내가 내릴 결정"을 더 빠르고 정확하게** 식별하게 한다.
- (H-cost) 그 블록은 짧고 단일프로젝트인 작업에선 **소음**이 될 수 있다 → 무조건이 아니라 **조건부**여야 한다.
- (H-long) 진짜 가치는 *여러 턴·여러 세션에 걸친 누적*이며, 단발 A/B로는 일부만 보인다 → holdout 연동 필요.

---

## 2. 핵심 통찰 — 기존 자산과의 정합(중복 회피가 설계의 절반)

| 제안 요소 | fablever에 이미 있는 것 | 겹침/차이 | 결론 |
|---|---|---|---|
| Handoff Summary(보고 최상단 3줄) | `profiles/full.md`의 **Lead with the outcome**(첫 문장=결론) | 둘 다 "결론부터". 차이: Handoff는 **고정 라벨·스위칭 최적화·Action Required+라인넘버**가 핵심 | Lead-outcome의 **구조화·트리거형 확장**으로 설계(중복 직시) |
| Decision trail과의 관계 | `profiles/full.md`·`profiles/decision-trail.md`의 **Decision trail**(보고 *하단* 증거 원장) | Handoff=상단·운영자 의사결정용 / Decision trail=하단·검증가능 결정원장 | **역할 분리**: 상단 Handoff(짧음) + 하단 Decision trail(증거). 동시 사용 시 중복 금지 규칙 명시 |
| `.fablever_state.md` 상태파일 | (없음). 다만 `fable-seed`의 로컬파일 패턴, `measurement/`의 out-of-band 원장과 유사 사고 | **신규.** 세션 상태 동기화는 fablever에 부재 | 신규 컴포넌트로 추가(트리거형) |
| 3회 자율수정 후 질문 | governor의 **"Stop only when genuinely blocked … don't end on a promise"** (텍스트만; finish-the-work 훅은 *없음* — 그건 자매 프로젝트) | 개념은 있으나 **횟수·자율수정 루프가 비형식화** | 구체화: N회 자율수정 경계(가능하면 결정론 훅 보조) |
| 항상 켜기 | 이번 세션 측정: **단발 지시문 단일턴 유의 lift 없음**(over-build/lead-outcome/report-stop 전부 p≥0.18), 과잉처방은 Fable급 모델 degrade(Anthropic 가이드), always-on 누적은 **harness paradox** | always-on 추가블록은 비용↑·중복↑ | **트리거형 + 측정** 강제 |

**한 줄 요약:** 제안의 가치는 분명하나, fablever에 그대로 always-on으로 얹으면 자기 측정결과(단발 null·과잉처방·harness paradox)와 충돌한다. **트리거형으로 좁히고, 출시 전 2-랩 A/B로 증명**하는 게 정합적이다.

---

## 3. 설계 — 3 컴포넌트

### 3.1 컴포넌트 A — Handoff Summary 출력 계약

**포맷(초안).** 라벨 고정, ≤4줄, 항상 보고서 *맨 위*.

```
[Handoff Summary]
· 맥락(Context): 이 작업의 원래 목적 1줄 — "무엇을 하던 프로젝트였나"
· 한 일(Done): 이번에 바뀐 핵심 파일·로직 1~2줄 (경로 포함)
· 결정 필요(Action Required): 운영자가 지금 결정/확인할 단 하나 — file:line 또는 핵심 논점 1줄 (없으면 "없음 — 완료")
```

**발화 조건(트리거 — 무조건 아님).** 다음 중 하나일 때만:
1. 작업이 길었다(다중 단계 / 도구호출 N회 이상 / 벽시계 임계 초과), 또는
2. 다중 세션·다중 프로젝트 신호(`.fablever_state.md` 존재 또는 세션이 알림 후 재개), 또는
3. 운영자가 결정해야 할 미해결 항목이 실제로 있다.
→ 짧은 단일턴 질의·대화형 턴에선 **발화 안 함**(소음 방지, lead-outcome로 충분).

**기존 규율과의 충돌 해소 규칙:**
- "minimal markdown / no filler"와의 긴장: Handoff는 **의도된 구조 예외**다. 단, **트리거 충족 시에만** 허용 → 평상시 미니멀 유지.
- Decision trail과의 중복 금지: Handoff(상단)와 Decision trail(하단)이 **같은 보고에 둘 다** 나올 때, Action Required는 상단에서 **한 번만**. 하단 trail은 증거 원장 역할만.
- 한글 브리핑 규칙(이 머신): 라벨은 한/영 병기 가능, 본문은 한글 기본.
- 이모지: 제안 이미지의 깨진 글리프(�) 회피 — 이모지 **선택**(기본 텍스트 불릿), 렌더 깨짐 위험 0 우선.

### 3.2 컴포넌트 B — `.fablever_state.md` 상태 동기화

**스키마(초안).**
```markdown
# .fablever_state.md  (자동 유지 — 직접 편집 비권장)
- Session ID:        PRJ-01-결제모듈
- Ultimate Goal:     (운영자 지시 최종 목표 1줄)
- Current Milestone: (현재 처리 중 핵심 로직)
- Pending Blockers:  (미해결 — 없으면 "없음")
- Last Updated:      2026-06-24T11:00:09Z  (UTC ISO-8601)
- Touched Files:     path/a.ts, path/b.sql   (이번 마일스톤에서 바뀐 것)
```

**다중 프로젝트 네임스페이싱(핵심).** 5~10개 동시 운영이 전제이므로 단일 루트파일은 충돌한다 →
**`.fablever_state/` 디렉터리 + `<session-id>.md` 1파일/세션** 구조 권장. 루트 단일파일은 단일프로젝트 폴백.

**유지 주체·시점.** (a) 작업 시작/마일스톤 전환 시 에이전트가 갱신, (b) 보조로 결정론 훅(예: PostToolUse/Stop)이 타임스탬프·Touched Files를 기계적으로 채워 드리프트 방지. **30분/다중세션 임계 미달이면 생성 안 함**(안티블로트).

**gitignore.** `.fablever_state*`는 기본 `.gitignore`에 넣어 운영자 로컬 상태가 커밋되지 않게(개인 작업맥락 누출 방지). 단, 팀 공유를 원하면 옵트인.

### 3.3 컴포넌트 C — 자율 마감 규율(3-retry self-correction)

**규칙(초안).** 피드백 처리 중 오류 발생 시: **권한 내에서 최대 N=3회 자율 수정** 시도(각 시도는 *새 정보/다른 접근*이어야 함 — 같은 시도 반복 금지, 이번 세션 Decision-trail 원칙과 동일) → 3회로도 안 되면 그때만 [Handoff Summary]의 Action Required로 **정확한 질문 1개** escalate.

**기존 정합.** governor의 "stop only when blocked / don't end on a promise"의 **형식화**. fablever엔 finish-the-work 훅이 없으므로 1차는 governor 문구로, 선택적으로 Stop 훅 보조(자매 프로젝트 `finish-the-work.sh` 참고, 단 라이선스·중복 검토 후).

**주의(안전 우선, 규칙 우선순위 위배 금지).** "3회 자율수정"은 **비파괴·가역 작업**에 한정. 파괴적/비가역/범위변경/소유자 승인 필요 작업은 retry 대상이 아니라 **즉시 escalate**(CLAUDE.md 4~7, Fable 안전 우선 규칙 위에 둠).

---

## 4. 구현 옵션과 권장(어디에 무엇을)

| 컴포넌트 | 구현 위치 후보 | 권장 |
|---|---|---|
| A. Handoff 계약 | (i) `profiles/full.md` governor 문구(트리거 조건 포함), (ii) `fable-reinject.sh` 리마인더, (iii) `fable-handoff` 스킬(온디맨드) | **(i) governor에 트리거형 문구 + (iii) 온디맨드 스킬** 조합. 항상-켜기(ii)는 측정 통과 전 금지 |
| B. state 파일 | (i) `fable-handoff` 스킬이 생성/갱신, (ii) 결정론 훅(PostToolUse/Stop)이 메타 채움 | **스킬 주도 + 훅 보조.** 임계 미달 생성 안 함 |
| C. 3-retry 경계 | (i) governor 문구, (ii) 선택적 Stop 훅 | **governor 문구 우선**, 훅은 측정 후 |

**최소 블로트 경로(권장 MVP):** ① governor에 **트리거형 Handoff 문구** 1문단 추가(드래프트 §8.1) → ② `fable-handoff` 스킬(state 파일 생성/갱신 + Handoff 블록 생성, §8.2~8.3) → ③ **둘 다 A/B 통과 후에만** reinject 상시 리마인더로 승격 고려. 훅 보조·3-retry 훅은 2차.

---

## 5. 안티블로트 & 리스크 체크(출시 게이트)

- **R1 중복:** Lead-outcome/Decision-trail과 기능 겹침 → §3.1 분리규칙 + A/B에서 "Handoff 있을 때 *추가* 가치"를 측정(없으면 출시 안 함).
- **R2 과잉처방:** Fable급 모델엔 over-prescription이 해롭다 → 트리거형 + reinject는 모델인식 게이트(기존 `fable-reinject.sh`가 이미 Fable/Mythos급엔 미주입) 그대로 활용.
- **R3 harness paradox:** always-on 추가블록 누적비용 → §6 E2(불필요 맥락 비용)·E5(holdout)로 측정. 단일턴 게이트 통과 ≠ 종단 통과.
- **R4 포맷 경직/이모지 깨짐:** 텍스트 불릿 기본, 이모지 선택, 라벨 한/영 병기.
- **R5 상태파일 누출/충돌:** `.gitignore` 기본 + 세션ID 네임스페이싱.
- **R6 안전:** 3-retry는 가역 작업 한정, 파괴/비가역/소유자결정은 즉시 escalate.

---

## 6. 테스트 계획(사전 등록 — 다음 세션이 실행)

방법론은 이 폴더의 기존 A/B와 동일: **동일 Opus 4.8 양팔, 독립 2-랩 심판(GPT-5.5 Codex + Gemini 3.1 직접), 강제선택 양방향(위치편향=무승부), 정확 이항 부호검정**. 헤드리스 오염통제: `FABLE_PROFILE=off`로 reinject 훅 차단(스타일/문구가 유일 변수). 모든 지표·n·임계는 **실행 전 확정**(p-hacking 방지).

### E1 — Handoff 이해속도/정확도 A/B (핵심, 헤드리스)
- **arms:** A= Handoff 없는 결론우선 보고 / B= Handoff 블록 포함 보고. (둘 다 같은 완료 작업 보고서)
- **tasks:** "운영자가 다른 4개 프로젝트를 보다가 *이* 프로젝트 알림을 막 열었다"는 스위칭 프레이밍의 완료보고 시나리오 16개(코드변경·결정필요 포함).
- **judge 프롬프트:** "당신은 5개 프로젝트를 동시 운영하는 리드다. 방금 이 프로젝트 알림을 열었다. 어느 보고가 (a)이게 뭐였는지 즉시 떠올리게 하고 (b)지금 내려야 할 *단 하나의 결정*을 가장 빠르고 정확하게 짚어주나?"
- **결정론 백스톱:** 첫 N줄 안에 ① 1줄 Context, ② file:line 포함 단일 Action-Required가 명확히 존재하는가(0/1); "결정 위치까지의 글자수"(작을수록↑).
- **성공 임계:** B가 **두 심판 모두 ≥70% 선호 & p<0.05**, 그리고 결정론 백스톱 동일 방향 → **출시(트리거형)**. 한 심판만 유의 → 보류·라운드2.

### E2 — 불필요 맥락 비용/소음 체크 (안티블로트)
- **tasks:** 짧고 단일프로젝트·결정필요 없음 12개. arms 동일(A 무 / B Handoff).
- **측정:** B의 군더더기 단어 증가율, 심판 "여기서 Handoff 블록은 소음인가?"(yes 비율).
- **성공 임계:** 짧은 과제에서 B가 소음↑·이해 이득 0이면 → **트리거 게이팅 정당화 확정**(무조건 금지).

### E3 — 상태파일 목표이탈 방지 (다중단계 합성)
- **설계:** 중간에 distractor가 끼는 장기 다단계 합성과제. arm: `.fablever_state.md` 재독 루프 有/無. 측정: 최종 산출의 **원목표 적합도**(2-랩 오라클) + 곁길 비율.
- **주의:** 헤드리스 다중턴은 까다로움 → 세션 resume 또는 스크립트 합성 컨텍스트로 구현(다음 세션 설계 항목).

### E4 — 3-retry 경계의 조기 escalation 감소
- **tasks:** 복구가능 오류가 1개 박힌 과제 12개. arm: 경계문구 有/無. 측정: **"자율수정 가능했는데 사용자에게 물어버린"(조기 escalation) 비율** + 과수정(over-retry) 비율.
- **성공 임계:** 경계文 有가 조기 escalation을 유의 감소 & 과수정 증가 없음.

### E5 — 종단(holdout) 연동 (진짜 다중세션 가치)
- 기존 `measurement/` holdout에 **Handoff 결과신호** 추가: 운영자 재질문("이게 뭐였지?" 류)·재지시(re-instruction) 비율을 out-of-band로 수확해 ON/OFF 비교. 단발이 못 보는 종단 효과를 측정. 실제 사용 데이터 필요(운영자 캠페인).

**사전등록 표(요지):** E1 핵심게이트(2-랩 70%/p<.05) · E2 게이팅 정당화 · E3 목표적합 · E4 조기escalation↓ · E5 종단. E1 통과 못하면 **출시 안 함**(증거 우선).

---

## 7. 마일스톤 / 다음 세션 작업 분해

1. **확정 설계:** §3 트리거 조건 수치화(도구호출·벽시계 임계), state 디렉터리 스키마 확정, governor 문구 최종화.
2. **구현 MVP:** governor 트리거 문구(§8.1) + `fable-handoff` 스킬(§8.2) + state 스키마(§8.3). install 경로·테스트(npm test) 무회귀.
3. **사전등록 실행:** E1→E2 우선(헤드리스 즉시 가능), E4 다음, E3/E5는 설계 후.
4. **판정:** E1 2-랩 통과 시 트리거형 출시(profiles 심링크 라이브) + dogfood. 미통과면 보고·보류.
5. **문서:** RESULTS-handoff*.md + README/EVIDENCE 반영 + 메모리.

---

## 8. 부록 — 초안 산출물(다음 세션이 바로 A/B에 투입)

### 8.1 governor 트리거 문구(드래프트 — `profiles/full.md`에 *조건부로* 추가 후보)
> **Hand the work off cleanly.** When you finish a long or multi-step task, or are reporting back into a project the operator has been away from, open the report with a 3-line **[Handoff Summary]**: one line of *context* (what this work was for), one line of what *changed* (key files/logic), and the *single* decision or check the operator must act on now — with a `file:line` or the exact point, or "none — done". Keep it tighter than the body below it; it replaces, not duplicates, a buried conclusion. Skip it entirely on short, single-shot, or conversational turns — there it is noise. It is the top-of-report companion to the Decision trail (which stays at the bottom as the evidence ledger); never state the same action item in both.

### 8.2 `fable-handoff` 스킬 골격(드래프트)
- name: `fable-handoff` (on-demand)
- 트리거: "핸드오프 정리", "상태파일 갱신", 장기작업 마감 보고 직전.
- 동작: ① 임계 충족 확인 → ② `.fablever_state/<session-id>.md` 생성/갱신(§8.3) → ③ 보고용 [Handoff Summary] 3줄 산출(Action Required는 단 하나, file:line) → ④ 짧은/대화형이면 "불필요"로 no-op.

### 8.3 `.fablever_state.md` 스키마(위 §3.2 재수록, 최종본은 다음 세션 확정)

### 8.4 Dogfood 예시 — *이 세션*을 Handoff로 요약하면
```
[Handoff Summary]
· 맥락: fablever를 plain Opus보다 낫게 만드는 증거기반 작업 — 헤드리스 자율 검증 트랙
· 한 일: directive 감사(3 ablation, 단발 null) + 출시본 2-랩 교차검증(증거규율 30–2, 자동시딩 88.9%) 커밋·푸시(344a985); plain-Opus 비교 HTML 보고서 저장
· 결정 필요: 이 Handoff 레이어를 "트리거형 + A/B 선검증"으로 갈지(권장) vs always-on으로 갈지 — 다음 세션 시작 전 1줄 컨펌
```

---

## 9. 다음 세션용 프롬프트(그대로 붙여넣기)

```
[다음 세션 시작 프롬프트 — fablever Handoff 레이어 깊은 설계+구현+검증]

맥락: 지난 세션에서 fablever에 "Handoff / Context-Reload 레이어"(보고 최상단 3줄
[Handoff Summary] + .fablever_state 상태파일 + 3-retry 자율마감)를 추가하기로 하고,
기획안·테스트계획·이 프롬프트를 만들어 뒀다. 기획안 위치:
  ~/work/fable-profile/docs/proposals/HANDOFF-LAYER-PLAN.md   (먼저 정독)
관련 자산: profiles/full.md(Lead-outcome·Decision trail), profiles/decision-trail.md,
  claude-code/hooks/fable-reinject.sh·fable-subagent.js, claude-code/skills/fable-seed,
  measurement/(holdout), eval/technique-ab/(A/B 하네스 — run-*.mjs, rejudge/regrade-gemini.mjs).

원칙(반드시 준수):
- 증거 우선·안티블로트. always-on으로 그냥 붙이지 말 것. 트리거형으로 설계하고
  출시 전 2-랩(GPT-5.5 Codex + Gemini 3.1) A/B를 통과해야만 라이브 적용.
- 기존 Lead-outcome/Decision-trail과 중복 금지(기획안 §3.1 분리규칙).
- 헤드리스 A/B는 FABLE_PROFILE=off로 reinject 훅 차단(스타일이 유일 변수).
- 운영 코드는 승인 없이 수정 금지(CLAUDE.md 4~7). 3-retry는 가역 작업 한정,
  파괴/비가역/소유자결정은 즉시 escalate.
- 한글 결과 브리핑. Documents 접근은 docbroker. ultracode면 Workflow로 적대적 검증.

이번 세션 목표(기획안 §6·§7 실행):
1) 확정 설계: 트리거 임계 수치화(도구호출수/벽시계), .fablever_state/ 디렉터리 스키마,
   governor 트리거 문구 최종화(§8.1 드래프트 기반).
2) MVP 구현: governor 트리거 문구 + fable-handoff 스킬(state 생성/갱신 + 3줄 산출) +
   .gitignore. npm test 무회귀 확인.
3) 사전등록 A/B 실행: E1(이해속도/정확도, 핵심 게이트: 2-랩 ≥70% & p<0.05) →
   E2(짧은과제 소음/게이팅 정당화) → E4(조기 escalation 감소). E3/E5는 설계만.
4) 판정: E1 통과면 트리거형 출시(profiles 심링크 라이브)+dogfood, 미통과면 보고·보류.
5) 문서·메모리: RESULTS-handoff*.md + README/EVIDENCE 반영 + 프로젝트 메모리 갱신.

먼저 기획안을 읽고, 확정 설계(1)에서 내릴 결정 3가지를 1줄씩 추천안과 함께 제시한 뒤
바로 구현·A/B로 진행해라(중간에 묻지 말고, 막히면 3-retry 후 Handoff로 질문).
```

---

### 메타: 이 기획안 자체의 한계(정직)
- E1~E5 임계는 *제안*이며 다음 세션 착수 시 재확인 필요. "이해속도/만족도"는 인적요인이라 심판 프록시로 근사 — 종단 가치(E5)는 결국 실사용 holdout이 결정.
- Handoff가 단발 A/B에서 lead-outcome 대비 *추가* 우위를 못 내면(이번 세션의 단발-null 패턴), 출시 근거는 **종단(E5)** 으로 이동한다 — 그 경우에도 "출시 보류·holdout 대기"가 정직한 결론이다.

---

## 10. 리뷰 부록 — 사전등록 수정(데이터 생성 전, 봉인)

> 작성: 2026-06-24(구현 세션). 구현 직전 **21-에이전트 적대적 리뷰**(레드 4렌즈 → 각 결함 적대적 검증)를 돌려
> 방법론 결함을 잡은 뒤, **데이터를 한 건도 만들기 전에** 게이트를 강화하고 결정 규칙을 봉인했다.
> (`hh*-raw`, `results-handoff.json` 모두 부재 상태에서 수정 — p-hacking 아님.)

**리뷰의 핵심(keystone) 결함 — 확인됨.** E1 심판 루브릭이 arm B에만 지시된 표면형식(상단 고정 `[Handoff Summary]`
블록 + `file:line` + "본문보다 짧게")을 그대로 보상한다. 그 블록은 강제선택 심판에게 **블라인드가 불가능**하므로,
심판의 B 승리는 "재로딩 가치"가 아니라 "B가 emit하도록 지시받은 패키징을 알아본 것"과 교란된다. 두 랩(GPT+Gemini)도
같은 누수를 읽으므로 교란을 제거하지 못한다. → 따라서 **단발 강제선택만으로 always-on 프로필을 편집해선 안 된다.**

**게이트 강화(§6 E1 재정의 — 양 랩 모두 충족해야 always-on '자격').** ① 심판 p<0.05(n=16에서 실효 바;
70%는 구속하지 않는 바닥값) **AND** ② **arm-중립 결정론 백스톱 동일 방향**(B가 head에서 결정을 *더 일찍/더 자주*
노출 — arm A의 자연스러운 한글 표현도 공정 인정하도록 `reAction` 확장) **AND** ③ **E2 자기게이팅**(짧은 과제에서
B의 블록 emit ≤ ~20% — always-on이 사소한 턴을 오염시키지 않음). 단발 통과는 *필요조건일 뿐 충분조건 아님*.

**봉인된 결정 규칙(이번 세션, 모든 분기 공통).**
1. **온디맨드 스킬(`fable-handoff`)은 무조건 출시** — 옵트인·자기게이팅·순수 추가물(always-on 비용 0).
2. **always-on 프로필 편집은 이번 세션에서 보류(HOLD)** — 블록이 블라인드 불가이므로 단발은 최종 게이트가 될 수
   없다. 최종 always-on 게이트 = **E5/holdout(실사용 종단 신호)**, 헤드리스 불가 → E5까지 대기. 단발 자격이
   green이어도 "전제 충족, 종단 게이트 대기"로 보고할 뿐 프로필은 건드리지 않는다(CLAUDE.md 4~7 존중).
3. **E1/E2/E4는 특성화(characterize)용** — E1=패키징 선호+조기노출 신호(가치 증명 아님), E2=스킬 자기게이팅 검증,
   E4=재시도 처분 프록시(게이트 권한 0). 결과가 null이어도 그대로 정직하게 문서화한다.

**적용한 하네스 수정(리뷰 confirmed findings).** (a) E1 게이트에 백스톱-동일방향 conjunct 복원(plan §6 사전등록
복원, run-leadoutcome.mjs `judgeSig && metricWin` 미러). (b) `reportE` 심판 집계를 `r.A&&r.B`로(메트릭 미실행 시
게이트가 조용히 비는 desync 차단). (c) E4 destructive 메트릭을 "retry 횟수"가 아닌 "destructive에서 사인오프 없이
진행(wrong-direction) 첫 처분"으로 재명명 + 루브릭 정교화(안전한 대안 제시도 사인오프 없으면 wrong). (d) E1 PASS
문구를 "측정된 재로딩 속도"가 아니라 "선호+조기노출(블라인드 불가)"로 reframe, 블록-emit/file:line은 manipulation-
check로 강등. **리뷰가 반증한 것**: "Gate result: PASS 프리앰블" 교란(4회 실증 반증 — `claude -p`에서 모델은 게이트
배너를 날조하지 않음), winner-parse `.includes('B')` 편향(순서 스왑이 상수-substring을 무승부로 처리), 최소-decided
바닥 부재(기존 수용 패턴과 동일·전수 가시).
