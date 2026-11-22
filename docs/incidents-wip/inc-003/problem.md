# Incident (fictional training data)

팀장 (06:30): point-api-02가 새벽에 두 번 재시작됐다는 알림이 왔어요. 앱 로그엔 에러가 하나도 없대요. 왜 죽었는지, 또 죽을지 보고 조치 방향 정해 주세요. 같은 서비스인 01번 서버는 멀쩡하답니다.

Alert:
- 서버: point-api-02 (4 vCPU · 4GB RAM)
- 서비스: point-api (Java 17 · Spring Boot · systemd)
- 감지: 프로세스 재시작 2회 — 03:12, 05:47
- 비교: point-api-01: 같은 기간 재시작 없음

System:
[로드밸런서] ──▶ point-api-01 (재시작 없음)
            └─▶ point-api-02 (재시작 2회)  ← 지금 접속한 서버
두 서버는 같은 트래픽을 나눠 받는다.
point-api는 systemd 서비스로 실행되며, 종료되면 5초 뒤 자동으로 다시 시작된다.

## Terminal transcript (every available command run once, on point-api-02, now = 2026-11-21 06:40:12)

$ uptime
[U-L1]  06:40:12 up 41 days,  3:02,  1 user,  load average: 0.62, 0.71, 0.69

$ free -m
               total        used        free      shared  buff/cache   available
[FR-L1] Mem:            3933        2241        1148          12         543        1450
[FR-L2] Swap:              0           0           0

$ df -h
Filesystem      Size  Used Avail Use% Mounted on
[DF-L1] /dev/nvme0n1p1   50G   20G   30G  41% /
[DF-L2] /dev/nvme1n1     20G  6.1G   13G  32% /var/log

$ top -b -n 1
top - 06:40:12 up 41 days,  3:02,  1 user,  load average: 0.62, 0.71, 0.69
Tasks: 132 total,   1 running, 131 sleeping,   0 stopped,   0 zombie
%Cpu(s):  9.1 us,  2.0 sy,  0.0 ni, 88.4 id,  0.3 wa,  0.0 hi,  0.2 si,  0.0 st
MiB Mem :   3933.0 total,   1148.2 free,   2241.4 used,    543.4 buff/cache
MiB Swap:      0.0 total,      0.0 free,      0.0 used.   1450.6 avail Mem

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
[P-L2]   24817 pointapi  20   0 6912.4m   1.8g  28.1m S  11.3  47.9   6:12.44 java
    603 root      20   0  728.1m  61.2m  24.4m S   0.7   1.6  31:10.02 filebeat
    588 node_ex+  20   0  726.4m  22.9m  11.0m S   0.3   0.6  12:41.73 node_exporter

$ ps aux
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
[P-L3] pointapi   24817 11.3 47.9 7078300 1884312 ?    Ssl  05:47   6:12 /usr/lib/jvm/java-17/bin/java -Xms1g -Xmx1g -XX:MaxDirectMemorySize=3g -XX:NativeMemoryTracking=summary -jar /opt/point-api/current/point-api.jar
root         603  0.7  1.5 745580 62668 ?        Ssl  Oct11  31:10 /usr/share/filebeat/bin/filebeat
node_ex+    588  0.3  0.5 743832 23450 ?        Ssl  Oct11  12:41 /usr/local/bin/node_exporter

$ ps -o pid,rss,etime,args -p 24817
    PID   RSS     ELAPSED COMMAND
[P-L1]   24817 1884312      52:58 /usr/lib/jvm/java-17/bin/java -Xms1g -Xmx1g -XX:MaxDirectMemorySize=3g -XX:NativeMemoryTracking=summary -jar /opt/point-api/current/point-api.jar

$ systemctl status point-api
● point-api.service - Point API (Spring Boot)
     Loaded: loaded (/etc/systemd/system/point-api.service; enabled; vendor preset: enabled)
[SYS-L1]      Active: active (running) since Sat 2026-11-21 05:47:14 KST; 52min ago
[SYS-L2]    Main PID: 24817 (java)
[SYS-L3]      Memory: 1.8G
        CPU: 6min 12.441s

[SYS-L4] Nov 21 05:47:09 point-api-02 systemd[1]: point-api.service: Failed with result 'oom-kill'.
[SYS-L5] Nov 21 05:47:14 point-api-02 systemd[1]: point-api.service: Scheduled restart job, restart counter is at 2.
Nov 21 05:47:14 point-api-02 systemd[1]: Started Point API (Spring Boot).

$ journalctl -u point-api | journalctl -k
Nov 20 23:40:05 point-api-02 systemd[1]: Started Point API (Spring Boot).
[J-L1] Nov 21 03:12:40 point-api-02 systemd[1]: point-api.service: A process of this unit has been killed by the OOM killer.
[J-L2] Nov 21 03:12:40 point-api-02 systemd[1]: point-api.service: Main process exited, code=killed, status=9/KILL
[J-L3] Nov 21 03:12:40 point-api-02 systemd[1]: point-api.service: Failed with result 'oom-kill'.
[J-L4] Nov 21 03:12:45 point-api-02 systemd[1]: point-api.service: Scheduled restart job, restart counter is at 1.
Nov 21 03:12:45 point-api-02 systemd[1]: Started Point API (Spring Boot).
[J-L6] Nov 21 05:47:09 point-api-02 systemd[1]: point-api.service: A process of this unit has been killed by the OOM killer.
[J-L7] Nov 21 05:47:09 point-api-02 systemd[1]: point-api.service: Main process exited, code=killed, status=9/KILL
[J-L8] Nov 21 05:47:09 point-api-02 systemd[1]: point-api.service: Failed with result 'oom-kill'.
[J-L9] Nov 21 05:47:14 point-api-02 systemd[1]: point-api.service: Scheduled restart job, restart counter is at 2.
Nov 21 05:47:14 point-api-02 systemd[1]: Started Point API (Spring Boot).

$ dmesg -T
[Sat Nov 21 01:00:01 2026] systemd-journald[412]: Data hash table of /var/log/journal/system.journal has a fill level at 75.0 (8533 of 11377 items), suggesting rotation.
[K-L1] [Sat Nov 21 03:12:40 2026] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L2] [Sat Nov 21 03:12:40 2026] Out of memory: Killed process 11820 (java) total-vm:7712484kB, anon-rss:3561208kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:7884kB oom_score_adj:0
[K-L4] [Sat Nov 21 05:47:09 2026] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L5] [Sat Nov 21 05:47:09 2026] Out of memory: Killed process 19044 (java) total-vm:7798120kB, anon-rss:3612344kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:8012kB oom_score_adj:0

$ dmesg
[3532909.412000] systemd-journald[412]: Data hash table of /var/log/journal/system.journal has a fill level at 75.0 (8533 of 11377 items), suggesting rotation.
[K-L1] [3540868.412000] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L2] [3540868.412000] Out of memory: Killed process 11820 (java) total-vm:7712484kB, anon-rss:3561208kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:7884kB oom_score_adj:0
[K-L4] [3550137.412000] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L5] [3550137.412000] Out of memory: Killed process 19044 (java) total-vm:7798120kB, anon-rss:3612344kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:8012kB oom_score_adj:0

$ journalctl -k
[Sat Nov 21 01:00:01 2026] systemd-journald[412]: Data hash table of /var/log/journal/system.journal has a fill level at 75.0 (8533 of 11377 items), suggesting rotation.
[K-L1] [Sat Nov 21 03:12:40 2026] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L2] [Sat Nov 21 03:12:40 2026] Out of memory: Killed process 11820 (java) total-vm:7712484kB, anon-rss:3561208kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:7884kB oom_score_adj:0
[K-L4] [Sat Nov 21 05:47:09 2026] java invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
[K-L5] [Sat Nov 21 05:47:09 2026] Out of memory: Killed process 19044 (java) total-vm:7798120kB, anon-rss:3612344kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:8012kB oom_score_adj:0

$ jcmd 24817 GC.heap_info
24817:
[H-L1]  garbage-first heap   total 1048576K, used 626688K [0x00000000c0000000, 0x0000000100000000)
  region size 1024K, 212 young (217088K), 9 survivors (9216K)
[H-L2]  Metaspace       used 92011K, committed 93120K, reserved 1114112K

$ jcmd 24817 VM.native_memory summary
24817:

Native Memory Tracking:

[N-L1] Total: reserved=4672120KB, committed=2361844KB
[N-L2] -                 Java Heap (reserved=1048576KB, committed=1048576KB)
[N-L3] -                     Class (reserved=1067301KB, committed=98213KB)
[N-L4] -                    Thread (reserved=52398KB, committed=52398KB)
[N-L5] -                      Code (reserved=251684KB, committed=44120KB)
[N-L6] -                        GC (reserved=60932KB, committed=60932KB)
[N-L7] -                  Internal (reserved=1204KB, committed=1204KB)
[N-L8] -                     Other (reserved=926981KB, committed=926981KB)
                            (malloc=926981KB #21877)
[N-L9] -                    Symbol (reserved=28917KB, committed=28917KB)

$ jcmd 24817 VM.flags
24817:
[P-L4] -XX:InitialHeapSize=1073741824 -XX:MaxHeapSize=1073741824 -XX:MaxDirectMemorySize=3221225472 -XX:NativeMemoryTracking=summary -XX:+UseG1GC

$ jstat -gcutil 24817
  S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     CGC    CGCT     GCT
[H-L3]   0.00 100.00  27.51  56.80  98.81  94.12    211    2.071     0    0.000     8    0.041    2.112

$ jcmd
24817 /opt/point-api/current/point-api.jar
25290 jdk.jcmd/sun.tools.jcmd.JCmd

$ curl -s localhost:8080/actuator/metrics/jvm.buffer.memory.used?tag=id:direct
[C-L1] {"name":"jvm.buffer.memory.used","baseUnit":"bytes","measurements":[{"statistic":"VALUE","value":9.49223424E8}],"availableTags":[{"tag":"id","values":["mapped","direct"]}]}

$ curl -s localhost:8080/actuator/metrics/jvm.memory.used?tag=area:heap
[C-L2] {"name":"jvm.memory.used","baseUnit":"bytes","measurements":[{"statistic":"VALUE","value":6.41728512E8}],"availableTags":[{"tag":"id","values":["G1 Eden Space","G1 Old Gen","G1 Survivor Space"]}]}

$ curl -s localhost:8080/actuator/health
[C-L3] {"status":"UP"}

$ cat /var/log/point-api/app.log
[A-L1] 2026-11-21 03:12:38.902 INFO  [req=gw-1a21] POST /v1/points/receipts 200 38ms
[A-L2] 2026-11-21 03:12:39.417 INFO  [req=gw-1a22] GET /v1/points/balance 200 6ms
[A-L3] 2026-11-21 03:12:40.011 INFO  [req=gw-1a23] POST /v1/points/receipts 200 41ms
[A-L4] 2026-11-21 03:12:58.233 INFO  Started PointApiApplication in 12.4 seconds (process running for 13.1)
[A-L5] 2026-11-21 05:47:08.770 INFO  [req=gw-7c02] POST /v1/points/receipts 200 44ms
[A-L6] 2026-11-21 05:47:27.105 INFO  Started PointApiApplication in 12.6 seconds (process running for 13.2)
[A-L7] 2026-11-21 06:40:05.310 INFO  [req=gw-9e11] POST /v1/points/receipts 200 39ms
[A-L8] 2026-11-21 06:40:09.884 INFO  [req=gw-9e12] GET /v1/points/balance 200 5ms

$ cat /var/log/point-api/gc.log
[G-L1] [2026-11-21T06:38:02.511+0900][info][gc] GC(209) Pause Young (Normal) (G1 Evacuation Pause) 698M->579M(1024M) 9.104ms
[G-L2] [2026-11-21T06:38:51.087+0900][info][gc] GC(210) Pause Young (Normal) (G1 Evacuation Pause) 701M->583M(1024M) 9.977ms
[G-L3] [2026-11-21T06:39:41.120+0900][info][gc] GC(211) Pause Young (Normal) (G1 Evacuation Pause) 702M->588M(1024M) 9.812ms

$ cat /var/log/point-api/memstat.log
time              version  pid    rss_mb  heap_used_mb  direct_mb
[M-L1] 2026-11-20 22:00  v2.3.0   8812   971     540           61
[M-L2] 2026-11-20 22:30  v2.3.0   8812   945     515           60
[M-L3] 2026-11-20 23:00  v2.3.0   8812   1022    590           62
[M-L4] 2026-11-20 23:30  v2.3.0   8812   991     560           61
[M-L5] 2026-11-21 00:00  v2.3.1   11820  945     480           95
[M-L6] 2026-11-21 00:30  v2.3.1   11820  1440    600           470
[M-L7] 2026-11-21 01:00  v2.3.1   11820  1760    560           830
[M-L8] 2026-11-21 01:30  v2.3.1   11820  2135    575           1190
[M-L9] 2026-11-21 02:00  v2.3.1   11820  2520    590           1560
[M-L10] 2026-11-21 02:30  v2.3.1   11820  2850    550           1930
[M-L11] 2026-11-21 03:00  v2.3.1   11820  3260    570           2320
[M-L12] 2026-11-21 03:30  v2.3.1   19044  1170    560           240
[M-L13] 2026-11-21 04:00  v2.3.1   19044  1605    585           650
[M-L14] 2026-11-21 04:30  v2.3.1   19044  2020    540           1110
[M-L15] 2026-11-21 05:00  v2.3.1   19044  2610    600           1640
[M-L16] 2026-11-21 05:30  v2.3.1   19044  3160    580           2210
[M-L17] 2026-11-21 06:00  v2.3.1   24817  1120    520           230
[M-L18] 2026-11-21 06:30  v2.3.1   24817  1730    600           760

$ cat /var/log/point-api/access-hourly.log
date        hour  total   receipts_upload
[X-L1] 2026-11-20  00    9812    402
[X-L2] 2026-11-20  02    5420    231
[X-L3] 2026-11-20  04    5610    240
[X-L4] 2026-11-20  06    14220   610
[X-L5] 2026-11-21  00    9945    411
[X-L6] 2026-11-21  02    5388    228
[X-L7] 2026-11-21  04    5702    244
[X-L8] 2026-11-21  06    9870    402
(2026-11-21 06시는 06:40까지 집계)

$ cat /var/log/deploy/point-api.log
[D-L1] 2026-11-14 10:05:12 deploy v2.3.0 -> point-api-01 OK
[D-L2] 2026-11-14 10:09:40 deploy v2.3.0 -> point-api-02 OK
[D-L3] 2026-11-20 23:40:03 canary v2.3.1 -> point-api-02 OK (point-api-01 stays v2.3.0)
[D-L4] 2026-11-20 23:40:03 v2.3.1 changes: add RequestBodyLoggingFilter (영수증 업로드 /v1/points/receipts 요청 바디를 감사 로그용으로 캐시)

$ cat /etc/systemd/system/point-api.service
[Unit]
Description=Point API (Spring Boot)
After=network-online.target

[Service]
User=pointapi
[F-L1] ExecStart=/usr/lib/jvm/java-17/bin/java -Xms1g -Xmx1g -XX:MaxDirectMemorySize=3g -XX:NativeMemoryTracking=summary -jar /opt/point-api/current/point-api.jar
[F-L2] Restart=always
[F-L3] RestartSec=5

[Install]
WantedBy=multi-user.target

$ cat /opt/point-api/current/RELEASE
v2.3.1

## Questions
Q1. Which line ids show how the process was terminated (who/what ended it)?
Q2. Root cause: H1=앱 코드의 예외로 스스로 종료됐다; H2=힙(-Xmx) 부족으로 OutOfMemoryError가 났다; H3=힙 밖(다이렉트 버퍼) 메모리가 계속 늘어 커널 OOM Killer가 종료했다; H4=디스크가 가득 차 종료됐다
Q3. Decisive evidence line ids (1-2) for your answer to Q2.
Q4. First action: R1=-Xmx를 2g로 올려 힙을 키운다; R2=point-api-02의 v2.3.1 카나리를 v2.3.0으로 되돌리고, 필터의 버퍼 해제를 고친 뒤 다시 배포한다; R3=서버 메모리를 8GB로 증설한다; R4=매일 새벽 서비스를 재시작하는 크론을 건다
