# V2 실행과 배포

V1의 화면 흐름·분석 공식·테이블 구조를 유지한다. V2는 FastAPI가 빌드한 React 화면을 함께 제공하고, 실행 모드에 따라 DB를 선택한다. 이 문서는 배포 준비 방법이며 실제 외부 서버를 생성하거나 과금을 시작하지 않는다.

| 모드 | DB | 사용 범위 |
|---|---|---|
| `local` (기본) | `backend/md_decision_lab.db` | 개인 PC. 기존 H&M 분석·자사 업로드 그대로 사용 |
| `demo` | 방문자별 SQLite | H&M 없는 30종 합성 데모. 입력·비교·판단 저장. 파일 업로드 차단 |
| `private` | 방문자별 데모 + Supabase 계정별 SQLite | 이메일 인증 후 자기 파일 업로드·분석·판단 저장 |

Supabase는 **Auth(로그인)**에 사용한다. 상품·판매 자료는 Supabase DB로 이전하지 않는다. 같은 테이블 구조를 각 사용자의 별도 DB에 사용해 다른 사용자의 ID로 조회하더라도 자기 파일 밖으로 접근할 수 없다. 원본 업로드 파일은 보관하지 않고 검증된 행만 DB에 저장한다.

## 1. 로컬 개발

V1과 동시에 실행할 수 있도록 V2 백엔드는 8001, 화면은 5180을 사용한다. 가상환경과 node_modules는 각 컴퓨터에서 새로 설치한다.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

새 터미널에서:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

`http://localhost:5180`에 접속한다. 화면의 `/api` 요청은 Vite가 8001번 서버로 전달한다. 이 모드에서는 로그인 없이 개인 DB와 기존 H&M 자료를 사용한다.

## 2. 합성 데모 배포

Docker와 영구 디스크를 제공하는 서버에서 저장소 루트의 `.env.example`을 `.env`로 복사한다. `MD_SESSION_SECRET`에는 `python -c "import secrets; print(secrets.token_hex(32))"`로 생성한 값을 넣는다. 공개 주소에서는 `MD_PUBLIC_ORIGIN=https://실제주소`, `MD_COOKIE_SECURE=true`로 설정하고 HTTPS를 사용한다.

```powershell
docker compose up --build -d
```

로컬 Docker 테스트는 `.env.example`의 `http://localhost:8080`, `MD_COOKIE_SECURE=false`를 사용한다. 프런트와 API가 같은 주소를 사용하므로 별도의 API 주소나 CORS 설정이 필요 없다.

DB는 `md_v2_data`라는 Docker 영구 볼륨의 `/data`에 저장한다. `docker compose restart`, 컨테이너 재생성, 이미지 재빌드는 이 볼륨을 보존한다. **`docker compose down -v`는 DB를 삭제하므로 사용하지 않는다.** 서버의 디스크 장애나 다른 서버로 이전할 때에는 별도 백업이 필요하다.

Docker가 아닌 호스팅에서도 `/data`에 영구 디스크를 연결하고 환경 변수를 동일하게 설정한다. 단일 서버·단일 프로세스로 운영한다. SQLite 파일 볼륨을 여러 서버가 동시에 공유하는 방식은 지원하지 않는다.

## 3. 개인별 서비스 활성화

1. 본인의 Supabase 프로젝트에서 이메일/비밀번호 로그인을 활성화하고 **이메일 인증을 켠다**.
2. Auth URL Configuration의 Site URL과 Redirect URLs에 공개 HTTPS 주소를 등록한다.
3. 서버 환경 변수에 `SUPABASE_URL`, **publishable key 또는 기존 anon key**를 넣고 `MD_APP_MODE=private`로 바꾼다. 비밀 키·service_role 키는 사용하지 않는다. 비밀번호나 키를 채팅에 붙여넣을 필요가 없다.
4. 재시작 후 `로그인 / 가입` → 이메일 인증 → 로그인 순서로 사용한다. 로그인한 사용자의 자료와 판단은 계정 전용 DB에 저장되고, 재접속 시 유지된다.

로그인한 요청마다 백엔드가 Supabase Auth의 `/auth/v1/user`를 호출해 확인한다. 클라이언트가 보낸 사용자 ID나 검증하지 않은 JWT 내용은 사용하지 않는다. 잘못된 토큰은 데모로 우회하지 않고 거부한다. 앱이 상품 DB를 Supabase REST API에 노출하지 않으므로 Supabase DB 테이블이나 RLS 설정은 이번 버전에 필요하지 않다.

처음에는 새 프로젝트의 합성 자료로만 사용자 두 계정의 업로드·판단 분리와 실제 이메일 인증을 확인한 뒤 공개한다. 현재 구현의 자동 검증은 가짜 인증 응답으로 권한 분리를 검사하며, 실제 Supabase 프로젝트 연결은 운영자가 위 설정 후 확인해야 한다.

## 4. 보관과 공개 범위

- `local`: 기존 DB·상품 사진·H&M 운영 CSV는 V2의 독립 복사본을 사용한다. 대용량 원본 ZIP은 `V2_COPY_INFO.md`에 적힌 V1 경로를 읽기 전용 원본으로 참조한다.
- 배포 이미지: 코드·빌드한 화면·합성 데모 CSV만 포함한다. 기존 DB·H&M ZIP·H&M 이미지·운영 CSV는 `.dockerignore` 허용 목록에서 제외한다.
- 공개 방문자의 DB는 서명된 HttpOnly 쿠키에 연결된다. 24시간 뒤 만료하며, 쿠키를 지우면 이전 데모로 돌아갈 수 없다. 만료된 데모 DB는 새 작업공간 생성 시 정리한다.
- 계정 DB는 자동 만료하지 않는다. Supabase 로그인 서버와 영구 디스크가 있어야 다른 기기에서도 같은 기록을 사용한다. 데모 기록은 계정에 자동 병합하지 않는다.
- 방문자의 파일 업로드는 서버에서도 차단한다. 로그인 계정만 CSV/XLSX 업로드를 사용한다.
- 분당 요청·파일 크기·데모 개수·작업공간 용량을 제한한다. 대규모 서비스의 여러 서버 운영, 자동 백업, 계정 삭제 정책, 악성 파일 전문 검사·운영 모니터링은 추가 운영 작업이다.

## 공식 참고

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [서버에서 사용자 확인](https://supabase.com/docs/reference/javascript/auth-getuser)
- [이메일 인증과 사용자 관리](https://supabase.com/docs/guides/auth/managing-user-data)
