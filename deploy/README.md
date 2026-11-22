# OCI-2 배포 가이드 (systemd --user + Tailscale)

이 서비스는 공용 인터넷(`0.0.0.0`)에 노출하지 않고, Tailscale 내부 IP(`100.x.y.z`)와 포트 `8790`에만 바인딩하여 실행합니다.

## 1. Tailscale IPv4 주소 확인

OCI-2 서버에서 아래 명령으로 Tailscale IPv4 주소를 확인합니다.

```bash
tailscale ip -4
```

예시 출력: `100.64.12.34`

## 2. 유닛 파일 설치 및 IP 설정

`deploy/cs-quest.service`를 사용자 systemd 디렉터리로 복사하고 `<TAILSCALE_IP>`를 위에서 확인한 IP로 교체합니다.

```bash
mkdir -p ~/.config/systemd/user
cp /srv/orca/cs-study/deploy/cs-quest.service ~/.config/systemd/user/cs-quest.service
TS_IP=$(tailscale ip -4 | head -n 1)
sed -i "s/<TAILSCALE_IP>/${TS_IP}/g" ~/.config/systemd/user/cs-quest.service
```

설정 확인:

```bash
cat ~/.config/systemd/user/cs-quest.service
```

`Environment=HOST=100.x.y.z`, `Environment=PORT=8790`, `Restart=on-failure`가 올바르게 들어갔는지 확인합니다.

## 3. 서비스 등록 및 시작

```bash
systemctl --user daemon-reload
systemctl --user enable --now cs-quest.service
```

로그아웃 후에도 서비스가 유지되도록 linger가 꺼져 있다면 활성화합니다(필요 시 관리자 권한으로 1회):

```bash
loginctl enable-linger "$USER"
```

## 4. 상태 및 응답 확인

```bash
systemctl --user status cs-quest.service
curl -I "http://$(tailscale ip -4 | head -n 1):8790/"
```

HTTP `200 OK`와 `X-Content-Type-Options: nosniff` 헤더가 보이면 정상입니다.
같은 Tailscale 네트워크에 연결된 기기의 브라우저에서 `http://<TAILSCALE_IP>:8790/`로 접속합니다.
