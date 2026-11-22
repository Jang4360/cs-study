# 사건 소재: 국내 기업 기술 블로그 트러블슈팅 사례

> 목적: 실제 장애 사례에서 **판단해야 했던 갈림길 · 확인한 증거 · 미리 알아야 했던 개념**을 뽑아 사건 콘텐츠의 뼈대로 쓴다.
> 사건은 원문을 그대로 옮기지 않는다. 회사·수치·시스템을 바꾼 학습용 가상 사건으로 다시 만들고, 해결 후 화면에서만 "참고한 공개 사례"로 원문 링크를 보여 준다.
> 2026-11-20 원문 확인. AI 주제는 제외했다.

기둥: ① 요청이 끝까지 흐르는 과정(OS·네트워크) ② DB와 동시성 ③ 분산 시스템 실패 처리 ④ 관측과 안전한 변경

## 시즌 1에 배치한 사례

| 단계 | 사건(가칭) | 참고 사례 | 기둥 | 판단의 갈림길 | 확인할 증거 | 사전 개념 | 보드 |
|---|---|---|---|---|---|---|---|
| inc-001 | 타임아웃 났는데, 처리된 건가요? | (자체 설계, 로컬 재현으로 검증) | ①③ | 타임아웃 = 실패인가, 모름인가 | 요청 ID로 이은 게이트웨이·앱 로그, DB 행 | 타임아웃, 요청 식별자, 커밋, FIN/499/Broken pipe | 요청 흐름 |
| inc-002 | 두 번 지급된 포인트 | inc-001의 후속(자체 설계) | ③② | 재시도를 막을까, 재시도를 안전하게 만들까 | 같은 거래번호의 중복 행, 재시도 간격, 유니크 제약 유무 | 멱등성, 멱등키, 유니크 제약 | 요청 흐름 |
| inc-003 | 로그 없이 사라진 서버 | [토스 Reactor Netty Memory Leak 이슈 탐방기](https://toss.tech/article/reactor-netty-memory-leak), [컬리 DB Connection 누수 문제](https://helloworld.kurly.com/blog/connection-leak/) | ①④ | 힙은 정상인데 RSS만 오른다 — 힙 밖을 볼 것인가 / 트래픽 급증으로 착각하지 않기 | `dmesg`의 OOM 기록, RSS vs 힙 그래프, 특정 경로에만 몰린 접근 로그, 힙 덤프 객체 수 | RSS와 힙, 다이렉트 버퍼, OOM Killer, 참조 카운트, 힙 덤프 | 터미널 |
| inc-004 | 6시 이벤트, DB 연결이 안 된다 | [우아한형제들 빌링 시스템 장애, 이러지 말란 Maria~](https://techblog.woowahan.com/2517/) | ①② | DB 서버 문제인가, 클라이언트가 연결을 만드는 경로의 문제인가(DB 쪽 `skip_name_resolve`는 이미 ON) | DB 에러 로그의 `Aborted connection ... unauthenticated`, 드라이버 버전·변경 이력, 연결 생성 중 DNS 조회 시간 | DNS 조회, DB 핸드셰이크와 인증, connect timeout, 풀의 신규 연결 생성 | 터미널 + 요청 흐름 |
| inc-005 | 풀은 넉넉한데 커넥션이 없다 | [우아한형제들 HikariCP Dead lock에서 벗어나기 (이론편)](https://techblog.woowahan.com/2664/), [(실전편)](https://techblog.woowahan.com/2663/) | ② | 풀을 늘릴 것인가, 한 작업이 연결을 몇 개 쥐는지 볼 것인가 | 스레드 수 16 vs 풀 10, 한 작업의 동시 연결 2개(JPA AUTO 채번 서브 트랜잭션), 풀 1개로 재현 | 커넥션 풀, 스레드 풀, 채번 테이블과 `FOR UPDATE`, 풀 크기 공식 `Tn×(Cm−1)+1` | 커넥션 풀 보드 |
| inc-006 | 배포 직후에만 느리다 | [카카오페이 배포 직후 응답 지연 (JVM 웜업)](https://tech.kakaopay.com/post/jvm-warm-up/) | ④② | 풀을 늘릴 것인가(30→50 무효), 연결을 쥐는 시간이 왜 늘었나 | 풀 acquire 5~10초·usage 1~1.5초, DB 쿼리 시간은 평소와 같음, 클래스 로딩 로그 | 커넥션 acquire/usage 시간, JVM 지연 로딩, startup/readiness probe | 타임라인 보드 |
| inc-007 | 같은 파일이 두 번 왔어요 | [우아한형제들 장시간 비동기 작업, Kafka 대신 RDB 기반 Task Queue](https://techblog.woowahan.com/23625/) | ③ | 타임아웃을 늘릴 것인가(장애 감지 지연), 즉시 ACK(유실 위험), 재설계 | 같은 메시지를 두 컨슈머가 처리한 로그, 작업 30분 vs `max.poll.interval.ms` 5분, 리밸런싱 시점 | 컨슈머 그룹, 오프셋 커밋, at-least-once, 리밸런싱, 하트비트, 멱등 처리 | 타임라인 보드 |
| inc-008 | 헬스체크가 서버를 내렸다 | [토스 Spring Boot Actuator의 헬스체크 살펴보기](https://toss.tech/article/how-to-work-health-check-in-spring-boot-actuator) | ③④ | 의존성 하나가 죽었을 때 서버 전체를 빼야 하는가 | `/actuator/health` 상세(구성 요소별 상태), LB 대상 제외 기록, 죽은 의존성 | liveness vs readiness, 헬스 상태 집계, 부분 실패와 장애 전파 | 요청 흐름 |
| inc-009 | 주말마다 5xx, 증설하면 낫는다 | [우아한형제들 SRE 팀에서 장애의 root cause를 찾고 재발방지 하는 방법](https://techblog.woowahan.com/2700/) | ①④ | 증설로 덮을 것인가, 근본 원인을 찾을 것인가 / 출발지·목적지·중간 구간 중 어디인가 | tcpdump의 SYN 재전송과 잘못된 ACK, 구간을 하나씩 빼며 재현, NAT IP당 TIME_WAIT 임계 | TCP 3-way handshake, TIME_WAIT, 포트 재사용, NAT, L4, 커넥션 풀의 연결 재사용 | 패킷 보드 |
| inc-010 | CPU는 한가한데 커밋이 느리다 | [토스 평균 CPU는 여유로운데, 커밋은 왜 느릴까?](https://toss.tech/article/nic-interrupt-bottleneck) | ① | 평균 지표를 믿을 것인가, 코어 단위로 내려갈 것인가 | `pidstat`로 본 프로세스 실행 CPU, `/proc/interrupts` 차분, NIC 본딩 모드 | 인터럽트(IRQ), NUMA, 커밋 로그 쓰기, 평균의 함정 | 터미널 |

## 다음 시즌 후보 (확인 완료)

| 참고 사례 | 기둥 | 판단의 갈림길 | 핵심 개념 |
|---|---|---|---|
| [하이퍼커넥트 지역 통신사 네트워크 이슈 트러블슈팅](https://hyperconnect.github.io/2024/06/24/global-network-troubleshooting.html) | ① | 서버 문제인가, 특정 지역망·클라이언트 설정의 조합인가 (오류를 국가·플랫폼·통신사로 분해) | TLS 핸드셰이크, SNI, 클라이언트 측 관측, 프록시 재현 |
| [LINE messaging-hub 트러블 슈팅](https://engineering.linecorp.com/ko/blog/messaing-hub-troubleshooting) | ④③ | "인프라 문제없음" 답변을 믿을 것인가 / 유력 가설(Nginx timeout)을 재현으로 기각 | half-open 연결, 하트비트, HAProxy reload와 hard-stop-after, 공유 인프라 변경 |
| [우아한형제들 응? 이게 왜 롤백되는거지?](https://techblog.woowahan.com/2606/) | ② | 예외를 잡았는데 왜 롤백되는가 | 트랜잭션 전파, rollback-only |
| [우아한형제들 Redis New Connection 증가 이슈](https://techblog.woowahan.com/23121/) | ②④ | 풀을 쓰는데 왜 신규 연결이 많은가(피크보다 자정에 더 많음) | 파이프라이닝 전용 연결, 풀 반납 순서, 유휴 연결 정리 |
| [토스 해외주식 서비스 안정화](https://toss.tech/article/overseas-securities-server) | ③ | 외부 브로커 지연을 어디서 흡수할 것인가 | rate limiting, 백프레셔, 장애 감지와 failover |
| [카카오페이 Next.js CORS와 Version Skew](https://tech.kakaopay.com/post/nextjs-troubleshooting-cors-version-skew/) | ④ | 임시 우회와 근본 해결 중 무엇을 택할 것인가 / 임시 조치가 새 장애를 만듦 | 카나리·블루그린, version skew, HTTP 캐시와 `Vary` |
| [카카오페이 R2DBC Connection Pool 실종 사건](https://tech.kakaopay.com/post/r2dbc-connection-pool-missing/) | ②④ | 왜 로컬에서는 되고 운영 실행에서는 안 되는가 | 지연 할당 풀, 실행 환경 차이, 헬스체크의 부수 효과 |

## 사례에서 반복되는 판단 패턴 (콘텐츠 설계 원칙)

1. **증상의 위치 ≠ 원인의 위치**: DB 연결 오류의 원인이 DNS(inc-004), 커밋 지연의 원인이 NIC 인터럽트(inc-010).
2. **평균은 숨긴다**: 평균 CPU 정상, 전체 오류율 낮음 → 코어·지역·플랫폼·경로 단위로 쪼개야 보인다.
3. **증설·타임아웃 연장은 덮개일 수 있다**: 증설로 해소(inc-009), 풀 30→50 무효(inc-006), 타임아웃 1시간 연장의 부작용(inc-007).
4. **재현으로 가설을 기각한다**: 구간을 하나씩 빼며 재현(inc-009), 풀 크기 1로 재현(inc-005), 유력 가설을 재현으로 폐기(LINE).
5. **임시 조치의 부작용을 따진다**: 즉시 ACK는 유실 위험, crossOrigin 옵션은 두 번째 장애.
