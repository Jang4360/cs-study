# cs-study — 인시던트 랩 (가칭)

실제 장애 사례를 바탕으로 만든 가상 사건을 보드(요청 흐름 뷰어, 가상 터미널 등)에서 직접 조사해 판정하고, 일반 학습 모드에서 개념을 빠르게 익히는 개인용 CS 학습 웹앱.

```bash
npm install                       # devDependency(@playwright/test)만 설치
HOST=127.0.0.1 PORT=8790 npm start
npm test                          # 콘텐츠 검사 → 단위 → e2e
```

지도와 작업 규칙은 CLAUDE.md, 확정 결정은 docs/decisions.md, 구현 명세는 docs/spec/SPEC.md.
