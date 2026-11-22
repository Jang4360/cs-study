1. 콘텐츠: content/(웹에 그대로 공개되는 완성본: catalog.json · incidents/ · topics/) · 사건 초안·문제지·교차검증 기록은 docs/incidents-wip/<사건 id>/(비공개)
2. 문서: docs/decisions.md(확정 결정 — 먼저 읽기) · docs/spec/SPEC.md(구현 명세 v0.3) · docs/research/(CASES.md 사례 조사, design/ 레퍼런스) · docs/playbooks/(반복 절차) · docs/intent/(인터뷰 결과)
3. 코드: public/(화면, js/boards/ 사건별 보드) · server/server.mjs(정적 서버) · tests/acceptance/(수용 테스트) · scripts/validate-content.mjs · deploy/(OCI-2 배포)
4. 실행: 미리보기 http://100.111.173.69:8790 (OCI-1, 저장소를 실시간 서빙) · 배포: `npm run build`로 dist/ 갱신·커밋 → main push → OCI-2가 2분 안에 받아 dist/ 서비스(deploy/README.md) · 테스트 `npm test`
5. 작업 방식: 전역 규칙(인터뷰 → intent → Claude 구현·테스트 → NEON 읽기 전용 검수) · 새 사건은 docs/playbooks/answer-key-cross-check.md 로 블라인드 교차검증 후 content/ 반영

# cs-study — 사건 기반 CS 학습 웹앱 (인시던트 랩, 가칭)

## 이 저장소에서만 지킬 것
- 정답·초안을 `content/`에 두지 않는다. `content/`는 정적 서버가 그대로 공개한다.
- 사건의 가상 로그·수치는 서로 맞아야 한다(RSS = 힙 + 힙 밖, 타임스탬프 순서, 상태 코드 의미 등). 바꾸면 교차검증을 다시 돌린다.
- 사건·주제 텍스트는 JSON에만 둔다. JS에 하드코딩하지 않는다. 바꾼 뒤 `npm run validate`.
- 서버는 `HOST`·`PORT`로만 바인딩한다(기본 127.0.0.1). `0.0.0.0` 금지. 런타임 외부 요청(CDN·웹폰트) 금지, 런타임 의존성 0.
- e2e는 `.cjs`로 쓰고 `timeout 600 npx playwright test -c tests/acceptance/playwright.config.cjs --reporter=line`로 돌린다. Node 24에서 Playwright 1.49.1 러너는 ESM 설정에서 말없이 멈춘다.
- 확정되지 않은 것(제품명, 역량 산식, 참고 사례 노출 등)은 docs/decisions.md 의 '미정'을 보고, 정하지 말고 묻는다.
