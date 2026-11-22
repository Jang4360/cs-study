# 사건 답안지 블라인드 교차 검증 (cs-study)

언제: cs-study 에 장애 사건(incident)을 새로 만들거나 증거 로그를 고쳤을 때. 사용자 원칙: "실제 답안지를 만들고 교차 검증 후 그걸로 채점한다. 동료 답안으로 평가하지 않는다."
기록: 2026-11-20(inc-001, nginx 499·Broken pipe), 2026-11-21(inc-003, OOM·direct buffer) 2회.

## 순서
1. Claude가 사건을 쓴다: 공개 기술 블로그 트러블슈팅 사례를 각색(실명·회사 제거), 증거 줄마다 ID(E1-L1, K-L2 …), 질문 Q1~Q4, 정답과 근거 줄 ID.
2. **문제만** 담은 `problem.md` 를 `docs/incidents-wip/<사건 id>/` 에 둔다(정답·해설은 넣지 않는다). `content/` 는 웹에 그대로 공개되므로 초안·정답 메모를 두지 않는다.
3. 새 NEON 세션에 맡긴다(이전 맥락 없음, 읽기 전용 — 전역 CLAUDE.md 의 검수 명령 형식으로 `docs/incidents-wip/<사건 id>/` 에서 실행):
   - Q1~Q4 를 근거 줄 ID 와 1~2문장 근거로 답하게 한다.
   - 이어서 **엄격한 기술 리뷰어**로서 증거의 불일치·비현실성을 전부 나열하게 한다(타임스탬프 순서, 상태 코드·request_time 의미, 타임아웃 값, RSS/heap/direct/NMT 합계, PID, systemd·dmesg 메시지 형식, JVM 플래그 의미), 답이 둘 이상 가능한 곳도.
4. Claude의 정답과 비교한다. 다르면 누가 맞는지 근거 줄로 판단하고, 숫자 불일치·형식 오류는 증거를 고친다. 답이 둘 이상 가능하면 증거를 보강해 하나로 좁힌다.
5. 고친 증거로 필요하면 한 번 더 돌린다. NEON 출력은 `docs/incidents-wip/<사건 id>/neon-blind-review.txt` 로, 결과(일치 여부, 고친 줄)는 사건 JSON 의 `verification` 과 커밋 메시지에 남긴다.
6. 채점 기준은 이 확정 답안지(근거 줄 집합)다. 사용자가 쓴 서술형 근거는 자기 점검용으로만 쓴다.

## 결과물 형식
- NEON 출력: `PART 1: ANSWERS` (Q별 Line IDs + Justification) → `PART 2: REVIEW` (불일치 목록, 줄 ID 와 함께).
- Claude 정리: 일치/불일치 표, 고친 증거 줄 목록, 최종 답안지.

## 잘 된 예시 (2026-11-20, inc-001)
NEON 에 준 지시:
```
Read problem.md in this directory. It is a fictional troubleshooting exercise. Work independently from first principles.
Answer Q1-Q4 with line ids and a 1-2 sentence justification each.
Then act as a strict technical reviewer: list ANY technical inconsistency or implausibility in the evidence
(timestamps, HTTP/nginx semantics such as status 499 and request_time, timeout values, log ordering,
DB timestamps vs log timestamps, Broken pipe semantics), and any place where the evidence supports more
than one reasonable answer. Be concrete. Do not create or modify files. Output plain text only.
```
NEON 답 요지: Q2 = H3 "처리는 끝났지만 응답이 전달되지 않았다"(E3-L2, E4-L1 커밋 완료 + E2-L1 499·3.000s + E3-L6 Broken pipe), Q4 = R2 "재전송하지 말고 거래번호와 지급 ID(G-88120)로 회신".
→ 이 답과 리뷰 목록을 Claude 정답과 대조하고, 리뷰가 짚은 수치·형식 불일치는 증거를 고쳐 답안지를 확정하는 것이 이 작업의 마무리다. (이 예시는 NEON 지시와 답변 원문만 기록에 남아 있어, 대조 결과 자체는 cs-study 저장소의 사건 파일에서 확인한다.)
