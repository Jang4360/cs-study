# 사건 작업 공간 (비공개)

사건 초안, 블라인드 교차검증용 문제지, 검수 기록을 사건별 폴더에 둔다. 웹에 공개되지 않는다(정적 서버는 `content/`와 `public/`만 서빙).

- `<사건 id>/problem.md` — 정답 없이 문제만 담은 파일(검증 당시 버전)
- `<사건 id>/ask.md` — NEON에 준 지시
- `<사건 id>/neon-blind-review.txt` — NEON 답과 기술 리뷰 원문
- 그 밖의 재현 스크립트 등

주의: inc-001, inc-003의 problem.md는 **수정 전** 증거 기준이다. 리뷰 지적을 반영해 고친 최종본은 `content/incidents/<id>.json`이고, 반영 내역은 그 파일의 `verification`에 있다.
