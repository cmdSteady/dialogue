# 천년의 대화 (Dialogue of a Thousand Years) — 프로젝트 인수인계

이 저장소는 단일 파일 3D 비공개 전시 사이트입니다. 사용자는 한국어로 대화합니다(또배기 / 진승우). 답변도 한국어로 합니다.
전시는 컬렉터가 소장한 중국 도자기와 고미술 13점을 소수 VVIP에게 보여주는 초대용 사이트입니다. 명함에 들어갈 주소로 쓰입니다.

## 파일 구성
- `index.html` : 방문자용 프로덕션 빌드(어드민 없음). Vercel이 이 파일을 그대로 서비스합니다.
- `index.master.html` : 원본(어드민 포함). 모든 수정은 여기서 하고 빌드로 `index.html`을 만듭니다.
- `tools/build_deploy.py`, `tools/headblock.txt` : 원본에서 방문자용 빌드를 만드는 스크립트.
- `vercel.json` : cleanUrls와 보안 헤더(nosniff, X-Frame-Options DENY, X-XSS-Protection).

## 수정과 배포 절차
1. `index.master.html`을 수정합니다. 큰 파일(약 4MB, 작품 이미지와 MP3가 base64로 들어 있음)이므로 전체를 출력하지 말고 grep으로 위치를 찾아 부분 수정합니다.
2. `python3 tools/build_deploy.py index.master.html index.html` 로 방문자용 빌드를 만듭니다. 패턴을 못 찾으면 assert로 멈춥니다. 조용히 넘어가는 일이 없도록 출력 로그를 꼭 확인합니다.
3. 검증합니다. Playwright 헤드리스 Chromium으로 열어 JS 에러가 없는지, `.panel` 13개, 마지막 작품 제목 "옥제 수이 삼족작 한 쌍", 어드민 버튼이 보이지 않는지 확인합니다. 열기 건너뛰기는 URL 해시 `#skip` 입니다.
4. main에 커밋하고 push합니다. Vercel이 자동 배포합니다. 커밋 첫 배포 메시지는 `release: v1.0.0 Production launch for Dialogue of a Thousand Years` 였습니다. 이후는 변경 내용을 적습니다.
5. 사이트에는 `robots noindex,nofollow`가 걸려 있습니다. 검색에 노출하지 않는 비공개 초대용입니다.

## 반드시 지킬 규칙
- 갤러리명과 브랜드명을 어디에도 넣지 않습니다.
- 빨아들이는(suction) 효과를 넣지 않습니다.
- 캡션 문구에 대괄호를 쓰지 않습니다. 단, 오디오 HUD 문구 `[ AUDIO ON ]` / `[ AUDIO MUTED ]`는 예외입니다.
- 톤은 VVIP용으로 신비롭고 품격 있게 씁니다. 가볍거나 웹소설 같은 문체는 피합니다.
- ABOUT 버튼은 갤러리 안에서는 숨깁니다(`body.in-gallery`).
- 작품 정보(제목, 연대, 설명)는 실제 작품 기준으로 씁니다.

## 화면 흐름
1. 프롤로그: 스크롤로 읽는 스토리(Act I~IV). 마지막 문장 뒤에 `BUFFER_PX = 300` 만큼 더 스크롤해야 넘어갑니다(읽을 여유). 하단 여백은 75vh 입니다. handoff() 타이밍은 1550ms와 2150ms 입니다.
2. 블랙홀 포털: 일회성 타이틀 `천 년 의 대 화`. 클릭하면 갤러리로 들어갑니다.
3. 갤러리: 13점이 나선형으로 배치됩니다. 3단 카탈로그 캡션과 오른쪽 서사 모달이 있습니다.
4. 사운드: 사용자가 제공한 앰비언트 MP3(base64 내장, `AMBIENT_URL`)를 Web Audio로 재생합니다. `fetch(data:)`는 CSP에서 막혀서 atob → Uint8Array → decodeAudioData 방식을 씁니다. 효과음 레벨 `FX_LEVEL = 0.27`, 배경음 `mg.gain.value = 1.3`. M 키로 음소거를 토글하고 HUD가 뜹니다. 시작은 프롤로그부터입니다. 모바일에서는 소리를 조금 더 키워 달라는 요청이 있어 반영돼 있습니다. 소리를 조정할 때는 효과음이 배경음과 어울리는지 함께 확인합니다.
5. 렌더링: Three.js r128, GSAP 3.12.5, UnrealBloom, 렌즈 효과 finalPass. `renderer.toneMappingExposure = 0.88`. 밝은 작품은 서리(frost) 효과를 줄이는 `brightW` 처리가 있습니다.

## 어드민(원본 전용)
- PIN은 기본 1234 입니다. 어드민 수정은 접속한 브라우저의 IndexedDB에만 저장됩니다. 방문자용 사이트와는 연결되지 않습니다.
- 그래서 홈페이지 내용을 바꾸려면 `index.master.html`의 `DEFAULT_ART` 배열을 수정하고 다시 빌드해야 합니다.
- 어드민 수정을 사이트에 반영하는 방법: 배포 사이트의 `/admin`(= `index.master.html`, `vercel.json` rewrite)에서 수정하고 **Save & 사이트에 배포**를 누르면 비밀 키(`PUBLISH_SECRET`)를 물어봅니다. 키가 맞으면 `api/publish.js`가 `index.master.html`의 `DEFAULT_ART`를 갱신하고 `index.html`을 빌드해 GitHub `main`에 한 번에 커밋합니다. Vercel이 자동 배포합니다.
- 서버 환경변수: `PUBLISH_SECRET`(배포 비밀 키), `GITHUB_TOKEN`(이 저장소 contents 쓰기 전용 fine-grained 토큰). 둘 다 Vercel 대시보드에만 두고 채팅·코드에 넣지 않습니다.
- `api/publish.js`의 `buildVisitor()`는 `tools/build_deploy.py`를 JS로 옮긴 것입니다. 빌드 규칙을 바꾸면 두 곳을 같이 고칩니다.
- `/admin`은 공개 URL입니다(검색 노출은 `X-Robots-Tag`로 막음). 원본 UI는 누구나 볼 수 있으므로, 쓰기는 반드시 비밀 키로만 열립니다. 비밀 키가 노출되면 Vercel에서 `PUBLISH_SECRET`을 바꾸고 재배포합니다.

## 작품 13점 (DEFAULT_ART, uid 순서)
1. 남유 백룡문 매병 한 쌍 (원대, 14th C.)
2. 청화진사 부조 학문화훼문 호 (원/명대)
3. 가요 철선금사 빙렬문 완 (송/원대)
4. 오채 기마인물문 대호 (명대, 16th C.)
5. 청화유리홍 전지모란문 개병 (원/명대)
6. 금동 투각 오복문 삼족향로 (명/청대, 17th C.)
7. 법랑채 금동 관음보살좌상 (명/청대)
8. 청람유 점화문 양이 화병 (청대, 18th C.)
9. 청화 고사인물문 대호 (원/명대)
10. 백자 쌍룡이병 (당/송대)
11. 천연수정 서수문 인장 (명/청대)
12. 청자 동자형 침 (송/고려대)
13. 옥제 수이 삼족작 한 쌍 (한/송대)
각 작품은 제목, year(시대), medium(부제), desc(설명), 임베드 이미지로 구성됩니다.

## 알아둘 점
- 배포 사이트가 정상인지 볼 때는 첫 화면, 포털, 갤러리 진입, 음악 재생, 모바일 폭을 확인합니다.
- 사용자 GitHub 토큰은 채팅에 노출된 적이 있으니 다시 받으면 삭제를 권하세요.
