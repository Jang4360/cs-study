# 배포 (OCI-2)

흐름(2026-11-22 사용자 확인):
1. OCI-1에서 작업하고 GitHub `main`에 push한다.
2. OCI-2의 systemd 타이머 `site-pull.timer`가 2분마다 site-pull 스크립트를 실행한다.
3. 스크립트가 저장소를 `git fetch`해 `main` 최신 커밋으로 맞춘다.
4. 저장소에 `dist/index.html`이 있으면 nginx가 `dist/`를, 없으면 저장소 루트를 서비스한다.

그래서 이 저장소는 **`dist/`를 커밋한다.**
- `npm run build` = 콘텐츠 검사 + `public/` 와 `content/` 를 `dist/` 로 복사(scripts/build-dist.mjs).
- push 전에 반드시 `npm run build` 후 `dist/` 변경까지 커밋한다. 안 하면 OCI-2에는 이전 화면이 남는다.
- `dist/` 에는 `docs/`·`tests/`·`server/` 가 들어가지 않는다(초안·교차검증 기록 비공개 유지).
- 화면은 상대 경로로 자원을 불러오므로 nginx가 어떤 URL 경로에 붙여도 동작한다.

OCI-2의 접속 주소와 nginx 경로는 OCI-2 쪽 설정이라 이 저장소에서 확인할 수 없다. 확인되면 여기 적는다.
