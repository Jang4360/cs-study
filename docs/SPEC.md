# 인시던트 랩 (가칭) — v0.2 구현 명세

> 작성: Claude (기획·콘텐츠·검증). 구현: GEMINI-4-NEON. 이 문서, `content/**`, `tests/acceptance/**`, `docs/design-skills/**`는 Claude 소유다.
> v0.1에서 바뀐 것: 애플 스타일 폐기, 두 모드 분리(퀘스트=동적, 학습=정돈), 보조 학습(S1/S2) 삭제, 퀘스트 화면은 사건별 "보드" 중심, 증거 카드 목록 제거, 일반 학습(카테고리 → 주제 → 완료) 신설, 역량 점수 도입.

## 0. 제품 개요

- **퀘스트 모드**: 실제 장애 사례를 바탕으로 만든 가상 사건을 단계별로 해결한다. 사건마다 **보드**(요청 흐름 뷰어, 터미널 등)가 화면 중심에 나오고, 학습자는 보드에서 증거를 직접 찾아 판정한다.
- **일반 학습 모드**: 사건 없이 개념을 빠르게 익힌다. 카테고리(OS·네트워크·인프라·DB·AI) → 주제 → 개념 페이지, 완료 표시.
- 두 모드는 학습 기록과 역량 점수를 공유한다.

## 1. 절대 제약 (위반 시 실패)

1. 수정 금지: `content/**`, `tests/acceptance/**`, `docs/SPEC.md`, `docs/design-skills/**`. 틀렸다고 판단되면 고치지 말고 보고한다.
2. 실행 금지: `sudo`, `systemctl`, `git commit`, `git push`, `/srv/orca/cs-study` 밖 수정.
3. 서버는 `HOST`(기본 127.0.0.1)·`PORT`(기본 8790)로만 바인딩. `0.0.0.0` 금지. 현재 `server/server.mjs`는 유지(필요하면 MIME만 추가).
4. 런타임 외부 요청 금지(CDN, 웹폰트, 분석). 런타임 의존성 0, 빌드 단계 없음. devDependency는 `@playwright/test@1.49.1`만.
5. 모든 테스트 명령은 `timeout`으로 감싼다. e2e는 반드시: `timeout 600 npx playwright test -c tests/acceptance/playwright.config.cjs --reporter=line` (Node 24에서 ESM 설정은 멈춘다. 백그라운드 실행 금지).

## 2. 코드 구조 (모듈 분리 필수)

현재 `public/js/app.js`(1800줄 단일 파일)를 다음처럼 나눈다. ES 모듈, 프레임워크 없음.

```
public/js/
  main.js                 # 진입점: 콘텐츠 로드, 라우터 시작
  router.js               # 해시 라우터, body[data-mode] 설정
  store.js                # localStorage 상태 (기존 확장)
  grading.js              # 순수 함수 (시그니처 4장)
  competency.js           # 순수 함수 computeCompetency (시그니처 5장)
  content.js              # catalog/incident/topic 로더 + 캐시
  ui/                     # 공통 컴포넌트: term-popover, radar, flip-card, sheet
  views/quest-home.js
  views/incident.js       # 브리핑·가설·조사·결과 단계 + 노트 패널
  views/learn-home.js
  views/learn-category.js
  views/learn-topic.js
  boards/registry.js      # type → board 모듈 매핑. 미지원 type은 sources 보드로 대체
  boards/request-flow.js  # 이번 버전 구현
  boards/sources.js       # 원본 자료(증거 줄 목록) — request-flow의 두 번째 탭에서도 재사용
public/styles/
  base.css                # 리셋, 공통 토큰(간격·반경·폰트 스택)
  quest.css               # body[data-mode="quest"] 테마
  learn.css               # body[data-mode="learn"] 테마
```

**보드 인터페이스** (이후 terminal, pool, timeline, packet 보드를 같은 방식으로 추가한다):

```js
// boards/<type>.js
export function mountBoard(container, { incident, attempt, onTogglePin, isPinned, onEventView }) -> { update(attempt), destroy() }
```
- 보드는 증거 줄을 `line-<lineId>` 버튼(`aria-pressed`)으로 렌더링하고, 누르면 `onTogglePin(lineId)`를 부른다. 핀 상태는 `isPinned(lineId)`로 묻는다. 체크포인트·채점 로직은 보드가 모른다.

## 3. 콘텐츠 (읽기 전용)

- `content/catalog.json`: 제품명, 5개 분야(설명 포함), 역량 산식(`competency`), 퀘스트 시즌과 `stages`(첫 단계만 `file` 있음, 나머지는 `available:false` 잠금 자리), 보드 이름표(`boards`), 학습 주제 id 목록(`learn.topics`, 파일은 `content/topics/<id>.json`).
- `content/incidents/inc-001.json`: v0.1 필드 + `objective`(한 줄 목표), `criteria`(판정 기준 공개 목록), `board`(request-flow 데이터), cards[].topic(연결된 학습 주제), patterns[].suggestTopic. `sides` 없음.
- `content/topics/*.json`: `id, domain, order, title, summary, minutes, keyword, prerequisites[], definition, why[], flow{title, steps[{label, detail}]}, misconceptions[{wrong, right}], inPractice[{caption, code}], checks[{id, prompt, options[{id,text}], answer, explanation}], terms[{term, definition}], relatedIncidents[], sources[{title,url}]`.
- 사건 텍스트·주제 텍스트를 JS에 하드코딩하지 않는다.

`scripts/validate-content.mjs`를 v0.2에 맞게 갱신(실패 시 exit 1):
- 기존 검사 + `board.events[].lines`가 실제 line id를 참조, 한 line은 최대 한 이벤트에만 속함, events의 `from/to`가 lanes에, `trace`가 traces에 존재, `t`가 숫자.
- cards[].topic과 patterns[].suggestTopic이 catalog `learn.topics`에 존재.
- 모든 topic 파일: 필수 필드 존재, `checks[].answer`가 options에 존재, domain이 5개 중 하나, catalog의 topics와 파일이 1:1.
- catalog stages의 `requires`가 앞선 stage id를 가리킴.

## 4. 채점 (`grading.js`) — v0.1과 같음, 이름만 변경

- `evaluateRule`, `gradeCheckpoint`, `computeOutcome` 시그니처·동작은 v0.1과 동일.
- 단 `suggestSide` → **`suggestTopic`**: cp1 실패 시 만족한 패턴 중 `suggestTopic`을 가진 첫 값, 없으면 null.
- 판정 원칙: 용어 팝오버·학습 페이지 열람·증거 열람은 도움 아님. 힌트 1단계 이상 또는 cp2 오답 후 재제출이면 도움. cp1 오답은 영향 없음.

## 5. 역량 (`competency.js`)

```js
export function computeCompetency({ learnDone: string[], history: [{incidentId, outcome}] },
                                  { topics: [{id, domain}], incidents: [{id, primary, secondary: []}], rule })
  -> { os, network, infra, db, ai }   // 정수 점수
```
- 학습 완료 주제마다 해당 domain에 `rule.learnPoints`.
- 사건마다 history 중 **최고 결과 하나만**: independent → primary에 `questIndependent`, assisted → `questAssisted`. 해결했으면 secondary 각각에 `secondaryBonus`.
- 각 분야 `maxPerDomain`으로 상한. 모르는 id는 무시.

## 6. 상태 (`localStorage` 키 `csq:v2`; v1 데이터는 무시하고 새로 시작)

```js
{ version: 2,
  attempts: { 'inc-001': { step: 'briefing'|'hypothesis'|'investigate'|'result', initialHypothesis,
      checkpoint: 'cp1'|'cp2', selections: {cp1:[], cp2:[]}, drafts: {cp1:'', cp2:''}, cp2Choices: {state, reply},
      submissions: {cp1:[], cp2:[]}, lastResult: {cp1, cp2}, hintLevel, viewedTerms: [], viewedEvents: [],
      board: { tab: 'flow'|'sources', clockIndex, traceFilter, selectedEvent }, selfCheck: {}, finishedAt, outcome } },
  history: [ { incidentId, outcome, finishedAt, hintLevel, initialHypothesis, finalRationale } ],
  learn: { done: { [topicId]: finishedAtISO } } }
```
- 새로고침·학습 페이지 왕복 후에도 진행 중 시도를 그대로 복원한다(보드 상태 포함).

## 7. 화면과 테스트 계약 (`data-testid` 고정)

라우트: `#/`(퀘스트 홈), `#/incident/:id`, `#/incident/:id/result`, `#/learn`(학습 홈), `#/learn/:domain`(카테고리), `#/learn/topic/:topicId`(주제, 쿼리 `?from=:incidentId` 선택).
- 라우트에 따라 `document.body.dataset.mode = 'quest' | 'learn'`(learn/* 경로만 learn).
- **전역 상단 바**(두 모드 공통 구조, 테마만 다름): 제품명, `nav-quest`("퀘스트"), `nav-learn`("학습"). 현재 모드 표시.
- 화면의 큰 덩어리(카드·패널)마다 `data-panel` 속성을 붙인다. **사건 조사·결과 화면에서 보이는 `[data-panel]`은 4개 이하**(테스트 B, C).

### 7.1 퀘스트 홈 `quest-home` (#/)
- 상단: 시즌 이름, 짧은 안내 1줄.
- **단계 지도**: catalog `quest.stages` 순서대로, Nod 레퍼런스의 "선 위의 동그란 노드" 모티프로 경로를 그린다(데스크톱: 지그재그/가로 흐름, 모바일: 세로). 각 노드 `stage-<id>` (`data-status` = `current|locked|solved-independent|solved-assisted`).
  - 상태 규칙: 해결 기록이 있으면 solved-*. 아니면 `requires`를 모두 해결했고 `available !== false`이면 current. 그 외 locked.
  - current: 크고 색이 있는 도형 + 제목 + 분야 칩 + 보드 이름표(catalog.boards) + 버튼 `stage-start-<id>`("시작하기" 또는 진행 중이면 "이어서").
  - solved: 체크 + "독립 해결/도움받아 해결" + `stage-start-<id>`("다시 보기").
  - locked: 회색, 자물쇠 아이콘, 번호, 제목, 분야 칩, "이전 사건을 해결하면 열립니다". **`stage-start-*` 없음, 클릭해도 이동 없음.**
- 옆(데스크톱) 또는 아래(모바일): 역량 오각형 `competency-radar` — 꼭짓점 순서 OS·네트워크·인프라·DB·AI, 각 축 `axis-<domain>`(`data-points` = 정수 점수, 텍스트 "n점"), 점수 다각형을 그린다(최대값 `maxPerDomain`). 캡션에 `competency.rule` 문구.
- 하단: `reset-progress` → 확인 시트 `reset-confirm`/취소. 퀘스트·학습 기록 모두 초기화.

### 7.2 사건 화면 (#/incident/inc-001)
상단 사건 바(data-panel 아님): 뒤로(홈), 사건 제목, `sim-badge`("학습용 가상 자료"), 단계 표시(브리핑 → 가설 → 조사 → 결과), 조사 중에는 목표 한 줄.
1. **브리핑** `briefing-view` (data-panel 1개): 메신저 버블 + 티켓 + `objective`(굵은 한 줄) + `criteria` 목록("판정 기준") + 버튼 `start-investigation`.
2. **첫 가설** (data-panel 1개): `hypothesis-option-H1..H4`, `hypothesis-submit`. "채점하지 않습니다" 안내.
3. **조사**: 두 영역만 — 보드(`board`, data-panel) + 노트 패널(`notes-panel`, data-panel). 데스크톱 ≥1024px: 보드 약 68% / 노트 32%(노트는 sticky). 그 미만: 세로 스택 + 하단 `mobile-cp-bar`(v0.1과 동일 계약: `mobile-cp-bar-count`, `mobile-cp-bar-go` → 노트로 스크롤 + `rationale-input` 포커스, 데스크톱에서는 숨김).
   - **보드** `board` (`data-board-type` = incident.board.type). 상단 탭: `board-tab-flow`("요청 흐름"), `board-tab-sources`("원본 자료"). 활성 탭만 렌더링.
   - **요청 흐름 뷰어** (request-flow):
     - 레인 `lane-<laneId>`: 세로 열(데스크톱) — 이름 + note(타임아웃 설정). 모바일은 레인 이름을 축약하고 가로 스크롤 **보드 내부에서만** 허용(페이지 가로 스크롤 금지).
     - 이벤트 `flow-event-<evId>` (button): 시간축(위→아래) 위에서 from 레인 → to 레인 화살표 + 라벨. kind별 표현: request(실선), response(점선), close(굵은 끝 표시), error(경고색). 트레이스별 색(트레이스 순서대로 팔레트 배정 — 정답을 암시하는 의미 색 금지).
     - **재생 상태**: `clockIndex` = 공개된 마지막 이벤트 index(시간순). 공개되지 않은 이벤트는 **DOM에 렌더링하지 않는다.** 초기값 0(첫 이벤트만 보임).
     - 컨트롤: `flow-reset`(index 0), `flow-step-back`(index−1, 최소 0), `flow-step`(index+1 → 그 이벤트를 선택해 상세 표시), `flow-play`(재생/정지 토글, 800ms마다 step, 끝에서 자동 정지), `flow-end`(전체 공개), `flow-clock`(현재 시각 `HH:MM:SS.mmm`과 `+s.sss초` — `board.t0` + 이벤트 t ms로 계산). 애니메이션은 화살표가 나타날 때 150ms 페이드 정도만. `prefers-reduced-motion`이면 없음.
     - 트레이스 필터: `trace-filter-all`, `trace-filter-<traceId>`. 선택한 트레이스 외 이벤트는 렌더링하지 않는다.
     - 이벤트 상세 `flow-detail` (`data-event-id`): 보드 하단(또는 옆) 영역. 시각, from→to, 라벨, details 키·값, **관련 기록 줄**(lines → `line-<lineId>` 핀 버튼, 고정폭 글꼴, 긴 줄 줄바꿈), 용어 버튼 `term-<cardId>`(events[].terms). 이벤트를 보면 `viewedEvents`에 기록.
   - **원본 자료** 탭 (sources 보드): evidence별 그룹 `source-<evidenceId>`(caption 포함) → 모든 줄 `line-<lineId>` 핀 버튼.
   - **용어 팝오버**: `term-<cardId>` 클릭 → `term-popover`(용어, 정의, `term-open-topic` 링크 = `#/learn/topic/<card.topic>?from=<incidentId>`), Esc·바깥 클릭으로 닫힘. 열람은 `viewedTerms`에 기록(도움 아님). 브리핑·노트의 텍스트 안에는 넣지 않아도 된다.
   - **노트 패널** `notes-panel`: 첫 가설(작게), `checkpoint-panel`(`data-checkpoint`) — v0.1 계약 유지: `selected-line-<id>`(×로 해제), `rationale-input`(라벨, maxlength 200, 글자수), cp2의 `final-state-H1..H4`·`final-reply-R1..R3`(보이는 input radio), cp2 최대 2줄(3번째 핀은 무시하고 안내), `cp-submit`(조건 충족 시 활성), `cp-result`(`data-result`) 안 `cp-feedback`, cp1 통과 시 `cp-continue`, cp2 통과 시 결과로 이동.
     - cp1 실패 결과에 `suggestTopic`이 있으면 `concept-suggest-<topicId>` 링크("개념 보기: <주제 제목>") → `#/learn/topic/<id>?from=inc-001`.
     - 힌트: `hint-button`, `hint-note`("힌트를 보면 '도움받아 해결'로 기록됩니다"), `hint-level-<n>` 누적.
4. **결과** `result-view` (#/incident/inc-001/result), data-panel 4개 이하:
   ① `result-outcome`(`data-outcome`) + `result-hypothesis-compare` ② passFeedback + notes + `model-rationale` + `my-rationale` ③ 자기 점검 `selfcheck-<id>` ④ `remedies-table` + `next-incident`(다음 사건 제목·예고·"준비 중") + `go-home` + `replay`.

### 7.3 학습 홈 `learn-home` (#/learn)
- 제목 "학습", 한 줄 안내. 5개 카테고리 카드 `category-<domain>`(아이콘, 이름, 설명, 진행 `category-progress-<domain>` = "완료/전체", 주제 0개면 "준비 중"). 클릭 → `#/learn/<domain>`.
- 작은 역량 오각형(같은 컴포넌트, testid 없이 또는 `learn-radar`).

### 7.4 카테고리 `category-view` (#/learn/:domain)
- 왼쪽 사이드바: 카테고리 목록 `side-category-<domain>`(현재 강조, 진행 수).
- 본문: 카테고리 이름·설명, 주제 카드 그리드 — `topic-card-<topicId>`(`order` 순, 번호 "01", 제목, summary, `minutes`분, keyword 칩, `data-done`). **완료한 카드는 배경색이 다르다**(학습 테마의 완료색 + 체크). 클릭 → 주제 페이지.
- 주제가 없으면 `category-empty`("아직 준비 중입니다").
- 하단 **복습 덱** `review-deck`: 이 카테고리 모든 주제의 `terms`를 플립카드 `deck-card-<n>`(button, `data-flipped`; 앞=용어, 뒤=정의)로. 주제가 없으면 렌더링하지 않는다.

### 7.5 주제 페이지 `topic-view` (#/learn/topic/:id) — Vercel Marketplace 상세 페이지 레이아웃
- 상단: `topic-back`("← <카테고리명>", 카테고리로), 큰 제목, keyword를 명령 칩처럼(고정폭, 테두리), summary.
- `?from=<incidentId>`이면 상단에 `topic-return-incident`("← 사건으로 돌아가기") → `#/incident/<id>`(상태 복원).
- 본문(최대 720px) 섹션 순서: `topic-definition`(한 줄 정의, 강조), `topic-why`, `topic-flow`(흐름 다이어그램: steps를 번호 노드 + 연결선으로, 현재 단계 강조 `diagram-step-<n>`(`data-active`), `diagram-prev`/`diagram-next`, 단계 클릭으로도 이동), `topic-misconceptions`(오해 → 바로잡기 2열), `topic-practice`(caption + 코드 블록), `topic-checks`(문항별 `check-<qid>-<optId>` 버튼, 선택 즉시 `check-result-<qid>`(`data-result` correct|incorrect) + explanation; 여러 번 시도 가능, 기록만), `topic-related`(관련 사건 `related-incident-<id>`, 출처 링크 목록).
- 오른쪽 메타 사이드바 `topic-meta`(모바일은 본문 위로): 분야, 예상 시간, 선행 주제(링크), 관련 사건, **`topic-complete`** 버튼(`data-done`; 미완료 "학습 완료로 표시", 완료 "완료됨 ✓ (취소)" 토글).
- 하단 `topic-prev`/`topic-next`: 같은 카테고리 order 순 이전/다음(없으면 비활성).

## 8. 디자인

공통: 같은 폰트 스택(`-apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif`, 고정폭 `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`). 두 모드의 차이는 **배경·색·형태·밀도**로만 낸다. 375px에서 페이지 가로 스크롤 없음, 터치 타깃 44px, `:focus-visible`, 라이트/다크 모두 지원(body 배경 명시).

### 8.1 퀘스트 = Nod Coding 참고 (동적이되 애니메이션은 절제)
레퍼런스: nodcoding.com (Awwwards SOTD). 가져올 것: 따뜻한 크림 배경, 바우하우스풍 원·반원·알약 도형, 원색 팔레트, 선 위의 동그란 노드, 큰 굵은 제목. **가져오지 않을 것**: 스크롤 연동 애니메이션, 패럴랙스, 큰 모션, 영상.
- 라이트 토큰: bg `#FBF7F0`, surface `#FFFFFF`, ink `#2F2A2A`, muted `#6B625C`, line `#2F2A2A`(지도 경로 2px), blue `#3A5BD9`, orange `#E9581F`, yellow `#FFD27A`, pink `#FFB9B5`, mint `#7CC7B2`.
- 다크 토큰: bg `#1B1816`, surface `#262220`, ink `#F3EDE6`, muted `#A79D94`, 강조색은 동일 계열에서 명도 조정.
- 형태: 카드 radius 20px, 버튼은 알약형, 굵은 2px 테두리 허용. 홈 상단·현재 단계 노드 주변에 **정적인** 기하 도형 장식(SVG). 호버는 2px 이동·그림자 정도.
- 보드는 surface 위에 그린다. 레인 헤더는 굵게, 시간축은 얇은 점선.
### 8.2 학습 = Vercel Marketplace 참고 (정돈)
레퍼런스: vercel.com/marketplace/sanity. 가져올 것: 흰 배경, 얇은 회색 테두리(1px `#EAEAEA`), 검은 기본 버튼, 칩 형태 카테고리 태그, 본문 칼럼 + 오른쪽 메타 사이드바, `$ 명령` 칩, 넉넉한 여백, 그림자 없음.
- 라이트: bg `#FFFFFF`, surface `#FAFAFA`, ink `#171717`, muted `#666666`, border `#EAEAEA`, primary `#171717`(버튼 글자 흰색), done 배경 `#EEF8F1` + 테두리 `#2E9E5B`.
- 다크: bg `#0A0A0A`, surface `#111111`, ink `#EDEDED`, muted `#A1A1A1`, border `#2E2E2E`, primary `#EDEDED`(글자 검정), done `#0F2418` + `#3FBF74`.
- radius 8px, 카드 호버는 테두리 진하게만.

## 9. 완료 기준 (Definition of Done)

1. `timeout 60 npm run validate` exit 0.
2. `timeout 60 node --test tests/acceptance/grading.test.mjs tests/acceptance/competency.test.mjs tests/unit/*.test.mjs` 전부 통과 (tests/unit은 v0.2에 맞게 고치거나 정리 가능).
3. `timeout 600 npx playwright test -c tests/acceptance/playwright.config.cjs --reporter=line` → **9 passed (A~I), 0 failed**.
4. 수정 금지 파일의 `git diff`가 비어 있음(새 파일 생성도 금지 영역 밖에서만).
5. `grep -rnE "https?://" public/`에 외부 리소스 로드 없음.
6. `package.json` scripts의 `test:unit`/`test:e2e`가 위 2·3 명령과 일치.

## 10. 최종 보고 형식

변경·추가·삭제 파일 목록, 9장 1~5의 실제 명령과 결과 수치, 수정 금지 파일에 대한 이견(있으면), 알려진 한계만 쓴다.

## 11. v0.2.1 수정 (Claude 검증 후, 2026-11-20) — 테스트 J

1. **라벨 전체 표시**: 각 `flow-event-*` 안 라벨 요소에 `data-role="event-label"`. 말줄임(…) 금지 — 필요하면 줄바꿈. 데스크톱 레인 레이아웃에서 라벨은 화살표 구간 폭에 갇히지 않고, 화살표 위 행 전체(시간 열 오른쪽 ~ 보드 끝)를 쓸 수 있다(시작점은 from/to 중 왼쪽 레인).
2. **대비**: 공개된 이벤트와 그 조상 요소에 opacity < 1 금지. 라벨·시간 글자는 배경 대비 4.5:1 이상. 선택된 이벤트는 배경 하이라이트/테두리로만 구분.
3. **상세가 보이게**: 타임라인 영역 `flow-timeline`은 max-height(데스크톱 440px, 모바일 380px) + 내부 세로 스크롤. `flow-step`/이벤트 선택 시 해당 이벤트를 타임라인 안에서 보이게 스크롤하고, `flow-detail`이 창에 보이도록 `scrollIntoView({block:'nearest'})`. `prefers-reduced-motion`이면 즉시 스크롤.
4. **레이아웃 전환**: `board`에 `data-layout`. 보드 폭 ≥ 720px이면 `lanes`, 미만이면 `list`. list는 레인 열 없이 이벤트를 세로 목록으로(시간 · "제휴사 A 클라이언트 → API 게이트웨이" · 라벨 · 트레이스 점), 레인은 상단에 범례 칩(`lane-<id>`)으로. list에서 보드 가로 넘침 없음.
5. **학습 코드 블록**: `topic-practice`의 `pre`는 `overflow-x:auto`(스크롤 가능)로 잘림 없이 표시.

완료 기준: 테스트 A~J **10 passed**, 기존 9장 1·2·4·5 유지.

## 12. v0.3 — 터미널 보드 (inc-003) · 테스트 K, L, terminal-engine

### 12.1 콘텐츠
- `content/incidents/inc-003.json`의 `board.type = "terminal"`. 필드: `host`, `user`, `home`, `now`, `motd[]`, `commands[]`(`name, usage, desc, category, patterns[](정규식 문자열), output[{id?, text}], terms[]`), `files{path: [{id?, text}]}`, `dirs{path: [entry]}`, `sudo: "strip"`.
- `evidence[]`는 모든 증거 줄의 정본 목록(채점·노트·결과 화면이 이 텍스트를 쓴다). 출력 속 `{id, text}`의 text는 표시용이며 정본과 다를 수 있다(예: `dmesg`와 `dmesg -T`의 시각 형식).
- 새 필드 `references[{title, publisher, url}]`, `referenceNote`(inc-001). catalog에서 inc-003은 `requires: ["inc-001"]`(inc-002는 아직 잠금 — 순서를 건너뛰어 열리는 것이 정상).
- validate-content 갱신: terminal 보드의 output/files의 모든 id가 evidence에 존재, patterns가 유효한 정규식, 체크포인트 규칙의 id가 evidence에 존재, references url이 https.

### 12.2 엔진 `public/js/boards/terminal-engine.js` (DOM 없음, 시그니처 고정)
```js
export function runCommand(spec, input) -> { kind: 'ok' | 'error' | 'clear', lines: [{ id?, text }] }
```
1. 정규화: 앞뒤 공백 제거, 따옴표 밖 연속 공백 1칸. 빈 입력 → `{kind:'ok', lines:[]}`.
2. 따옴표 밖 `|`로 분리. 첫 단계 앞의 `sudo `는 `spec.sudo === 'strip'`이면 제거.
3. 첫 단계 해석 순서:
   a. `spec.commands`에서 patterns(앵커 포함 정규식) 중 하나라도 맞는 첫 명령 → output 복사.
   b. 내장 명령: `help`, `clear`, `history`(이 세션의 명령 목록 — 엔진은 상태가 없으므로 UI가 처리해도 됨), `pwd`, `whoami`, `hostname`, `date`(now), `ls [경로]`(dirs 항목 + files 경로에서 파생한 직속 항목, 정렬), `cat|less|more 파일…`, `head [-n N|-N] 파일`, `tail [-n N|-N] 파일`, `grep [-i] [-v] [-E] 패턴 파일`, `wc -l 파일`.
   c. 이름(`name`)은 commands에 있지만 패턴이 안 맞으면 → error: `이 가상 환경에서는 지원하지 않는 형태입니다. 지원: <해당 name의 usage 목록>`.
   d. 그 외 → error: `bash: <첫 단어>: command not found` + 다음 줄 `help로 사용 가능한 명령을 볼 수 있습니다.`
   - 없는 파일 → error `cat: <path>: No such file or directory`(명령 이름에 맞게).
4. 이후 단계(필터)는 줄 배열에 차례로 적용: `grep [-i] [-v] [-E] 패턴`(패턴은 정규식으로 해석, 잘못된 정규식이면 문자열 포함으로), `head [-n N|-N]`(기본 10), `tail [-n N|-N]`(기본 10), `wc -l`(결과 한 줄: 줄 수). 그 외 필터 → error `지원하지 않는 파이프 명령: <이름>`. 필터는 id를 보존한다.
5. `help`: 범주(category)별로 commands의 `usage — desc`를 모두 나열 + 내장 명령 목록(cat/less, head, tail, grep, ls, wc -l, 파이프 `|`, clear, history) + "로그 위치: /var/log 아래를 ls로 살펴보세요".

### 12.3 터미널 보드 UI `boards/terminal.js`
- `board`(`data-board-type="terminal"`) 안: 상단 바(호스트명, "가상 터미널" 배지, 접속 정보) → `terminal-output`(스크롤 영역, 고정폭, 어두운 배경은 퀘스트 테마의 다크 토큰 사용) → 입력 줄(프롬프트 `ops@point-api-02:~$` + `terminal-input`, 라벨 있음, 모바일 font-size 16px 이상, autocapitalize/autocorrect off) → 관련 용어 칩 영역.
- 시작 시 motd 출력, 입력에 포커스.
- 명령 실행: Enter. 출력 블록 = 프롬프트+명령 줄 + 결과 줄. id가 있는 줄은 `line-<id>` 버튼(`aria-pressed`, 누르면 핀 토글, 핀된 줄은 강조). id 없는 줄은 일반 텍스트. 같은 id가 여러 블록에 있어도 핀 상태는 같이 반영.
- help 출력의 각 명령 usage는 `help-cmd` 버튼(`data-command=<usage>`)으로: 누르면 입력창에 채우고 포커스(실행은 하지 않음). usage에 `<PID>` 같은 자리표시자가 있으면 그대로 채운다.
- 입력 기록: ↑/↓로 이전 명령, Tab으로 명령 이름·파일 경로 자동완성(가능한 후보가 하나일 때).
- `clear`는 화면만 지운다(기록·핀 유지).
- 실행한 명령의 `terms`(content 명령에만 있음)를 누적해 칩 `term-<cardId>`로 표시 → 기존 용어 팝오버 재사용.
- 상태 저장: attempt.board = `{ history: [명령 문자열...] }`. 새로고침 시 history를 엔진으로 다시 실행해 출력 복원(마지막 clear 이후만).
- 새 출력이 생기면 출력 영역을 맨 아래로 스크롤. 가로로 긴 줄은 줄바꿈(`white-space: pre-wrap; overflow-wrap:anywhere`) — 페이지 가로 스크롤 금지.
- 보드 높이: 데스크톱 약 `min(70vh, 640px)`, 모바일 `60vh`.

### 12.4 노트·결과
- 노트 패널·채점·힌트·결과는 기존과 동일(보드 종류와 무관). selected-line 목록의 텍스트는 evidence 정본.
- 결과 화면 ④ 패널 안에 `result-references`: references가 있으면 "참고한 공개 사례" 링크 목록(새 탭, `rel="noopener"`), 없으면 referenceNote 문구. "이 사건은 공개 사례를 바탕으로 회사·수치·시스템을 바꾼 가상 사건입니다" 안내.
- 결과 라우트는 진행 중 시도가 없어도 history의 최신 기록으로 렌더링한다(테스트 L).

### 12.5 완료 기준
- `timeout 60 npm run validate` exit 0
- `timeout 60 node --test tests/acceptance/grading.test.mjs tests/acceptance/competency.test.mjs tests/acceptance/terminal-engine.test.mjs tests/unit/*.test.mjs` 전부 통과
- e2e **A~L 12 passed**, 0 failed
- package.json `test:unit`에 terminal-engine.test.mjs 포함
