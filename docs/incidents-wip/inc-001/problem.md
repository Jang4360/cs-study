# Incident (fictional training data)

팀장 (14:20): 제휴사 A에서 포인트 지급 요청이 실패했다고 연락 왔어요. 재전송해도 되냐고 묻는데, 실제로 처리됐는지부터 확인해 주세요.

Ticket:
- 발생 시각: 2026-11-18 14:02:14
- 거래번호: PTX-20261118-0421
- 현상: 응답 없음, Read timed out (3000ms)
- 문의: 재전송해도 되나요?

System:
```
[제휴사 A 시스템] ──HTTPS──▶ [API 게이트웨이] ──▶ [포인트 서버] ──▶ [DB]
                                                    │
                                                    └─(동기 호출)─▶ [알림 서비스]
```
포인트 서버는 지급을 DB에 커밋한 뒤, 알림 서비스를 동기로 호출하고 나서 응답한다.
게이트웨이는 요청마다 req ID를 붙여 포인트 서버로 전달한다.

## Evidence

### E1 고객사 티켓 원문 — 티켓 #T-1042 (제휴사 A 작성)
E1-L1: 발생 시각: 2026-11-18 14:02:14
E1-L2: 거래번호: PTX-20261118-0421
E1-L3: 현상: 포인트 지급 API 응답 없음 — java.net.SocketTimeoutException: Read timed out (3000ms)
E1-L4: 문의: 실패한 것 같은데 같은 거래를 재전송해도 되나요?

### E2 게이트웨이 접근 로그 — api-gateway access.log (nginx 계열, 가상)
E2-L1: 14:02:11.120 req=gw-7f3a91 POST /v1/points/grant client=partner-A status=499 request_time=3.000
E2-L2: 14:02:12.300 req=gw-7f3a9c POST /v1/points/grant client=partner-A status=400 request_time=0.041
E2-L3: 14:02:13.870 req=gw-7f3aa2 GET  /v1/points/balance client=partner-B status=200 request_time=0.022

### E3 포인트 서버 앱 로그 — point-server application.log (가상)
E3-L1: 14:02:11.145 INFO [req=gw-7f3a91 ptx=PTX-20261118-0421] grant request received amount=5000
E3-L2: 14:02:11.402 INFO [req=gw-7f3a91] tx committed grantId=G-88120
E3-L3: 14:02:11.405 INFO [req=gw-7f3a91] notify-service call start
E3-L4: 14:02:12.318 WARN [req=gw-7f3a9c ptx=PTX-20261118-0422] grant rejected: INVALID_MEMBER
E3-L5: 14:02:15.890 WARN [req=gw-7f3a91] notify-service slow response 4485ms
E3-L6: 14:02:15.903 WARN [req=gw-7f3a91] response write failed: Broken pipe

### E4 DB 조회 결과 — SELECT grant_id, partner_tx_id, status, created_at FROM point_grant WHERE partner_tx_id = 'PTX-20261118-0421';
E4-L1: G-88120 | PTX-20261118-0421 | GRANTED | 2026-11-18 14:02:11.398

### E5 구간별 타임아웃 설정 — 설정 현황 (가상)
E5-L1: 제휴사 A 클라이언트 → 게이트웨이 read timeout: 3초 (제휴사 회신)
E5-L2: 게이트웨이 → 포인트 서버 upstream read timeout: 30초
E5-L3: 포인트 서버 → 알림 서비스 호출 timeout: 10초
E5-L4: 포인트 서버 → DB 쿼리 timeout: 5초

### E6 모니터링 대시보드 요약 — 모니터링 요약 (가상)
E6-L1: 포인트 서버 CPU 사용률: 평균 22% (평소와 비슷)
E6-L2: 포인트 서버 DB 커넥션 풀 사용: 최대 6/20
E6-L3: 알림 서비스 응답시간 p95: 평소 120ms → 14:01~14:09 4.1~4.6초
E6-L4: 포인트 지급 API 응답시간 p95: 평소 350ms → 14:01~14:09 4.7~5.0초

## Questions
Q1. Which log lines prove that ticket transaction PTX-20261118-0421 is the same request inside our system? List line ids.
Q2. Actual state of the request: H1=요청이 우리 서버에 도달하지 않았다; H2=도달했지만 처리에 실패했다; H3=처리는 끝났지만 응답이 전달되지 않았다; H4=아직 판단할 수 없다
Q3. Decisive evidence line ids (1-2).
Q4. Reply to partner: R1=재전송하라; R2=재전송하지 말라. 이미 처리됐다고 거래번호와 지급 ID(G-88120)로 회신한다; R3=판단을 보류하고 추가 확인을 요청한다
