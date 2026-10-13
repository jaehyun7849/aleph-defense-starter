# 현재 저장점: 7단계 — 평소와 다른 접속은 다시 확인합니다

`src/decider.mjs`에는 기존 `device_registered` 규칙과 7단계 `step_up_required` 규칙이 있습니다. 등록된 기기의 정상 요청은 허용하고, 미등록 또는 등록 여부가 빠진 요청은 `device_not_registered`로 거부합니다. 가상 사건에서 야간·낯선 네트워크·최근 대량 읽기가 함께 맞으면 사유 `step_up_required`로 추가 확인을 요청합니다. 지역 하나만으로 차단하지 않습니다. `aleph.config.json`의 단계는 7이며, 로그인 발급자·허용 경로·원본 API 주소를 구현과 대조했습니다. 운영 주소의 배포 메타데이터는 아직 6단계이므로 7단계 배포는 확인되지 않았습니다.

## 보존한 5단계 기능

- 메모 읽기·추가·수정·삭제는 기존 Vercel API를 사용합니다. 기존 로그인 검증과 소유자 비교는 유지했습니다.
- 로그인·세션 갱신·로그아웃도 `/api/auth`의 Supabase 공식 SDK를 사용합니다. 사용자 세션마다 SDK 클라이언트를 따로 만듭니다.
- 화면 두 곳과 공유 브라우저 모듈에 프로젝트 공개 키·서버 키가 없습니다. 서버 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 그대로 사용합니다.
- 사용자가 notes 테이블에서 PUBLIC·anon·authenticated 권한을 회수하고 두 역할의 CRUD 권한이 모두 false인 것을 확인했다고 보고했습니다. RLS와 기존 정책·서비스 역할 권한은 유지합니다.
- 정적 data.json은 비어 있습니다. 빌드가 aleph.json에 단계·allowedRoutes·originalApiUrl을 자동 기록하며 nosniff 헤더는 유지합니다.

## 6단계 저장점: 등록 기기 판정기 확인

`src/decider.mjs`의 `device_registered` 규칙은 `request.deviceRegistered === true`일 때 `allow`와 `approved`를 반환합니다. 미등록이거나 값이 없으면 `deny`와 `device_not_registered`를 반환합니다. 아래 확인은 로컬 판정기 연습입니다.

1. 저장소 루트에서 터미널을 열고 `npm run decider:test`를 실행합니다. 별도로 설치할 접속 프로그램이나 화면에서 누를 버튼은 없습니다.
2. 출력에 `통과 · 등록 기기의 정상 요청`이 나오는지 확인합니다. 이 검사는 등록 요청의 응답 형식과 `allow` 결정을 확인합니다.
3. 출력에 `통과 · 미등록 기기의 가상 요청`이 나오는지 확인합니다. 이 검사는 미등록 요청의 응답 형식과 `deny`, `device_not_registered`를 함께 확인합니다.

2026-10-13 로컬 실행에서 두 검사 모두 통과했고, 같은 가상 요청을 직접 호출해 다음 응답도 확인했습니다.

```text
통과 · 등록 기기의 정상 요청
통과 · 미등록 기기의 가상 요청
등록 기기의 정상 요청 → allow · approved
미등록 기기의 가상 요청 → deny · device_not_registered
```

미등록 기기 공격은 심판이 맡습니다. 이 로컬 연습 결과는 실제 접속 차단이나 공식 심판 통과 증거가 아닙니다.

## 7단계 저장점: 재확인 계약과 가상 사건 검증

판정기에 `step_up_required` 규칙을 추가했습니다. `judge_fixture` 가상 정보에서 22시~다음 날 6시 전, `unusual` 네트워크, 최근 60초 이내 `risk_signal` 20건 이상이 함께 나타나는 자료실 GET 요청은 `step_up`과 사유 `step_up_required`를 반환합니다. 지역 하나만으로 차단하지 않으며 기존 미등록 기기 거부를 유지합니다. 입력 검사에서 출처 불명·계약 밖 헤더·잘못된 형식은 거부하고, 누락 정보는 정상값으로 채우지 않습니다.

`docs/DECIDER_REQUEST.md`에는 엔진이 전달하는 `stepUp: { verified, authAgeSeconds }`가 있습니다. 그러나 이 폴더에는 문서가 참조하는 `student-kit/sdp-core/decision-contract.mjs` 및 같은 로그인 주체의 재로그인 시각을 검증해 이 값을 생성하는 운영 엔진·릴레이 구현이 없습니다. `api/notes.js`도 판정기를 호출하지 않습니다. 전달 항목의 존재만으로 실제 재인증 연결이 준비됐다고 판단하지 않습니다. 토큰 발급 시각이나 브라우저가 보낸 값을 재로그인 증거로 대신 쓰지 않습니다.

2026-10-13 로컬 가상 요청만 시험했습니다. `node --test test/decider-input.test.mjs test/decider-step-up.test.mjs`의 7개 검사가 통과했습니다. 정상 사건은 `allow`, 복합 사건의 확인 전은 `step_up / step_up_required`, 같은 가명 주체와 새 요청 ID에 모의 `stepUp: { verified: true, authAgeSeconds: 60 }`를 넣은 새 사건은 `allow`였습니다. 이 마지막 결과는 실제 재로그인 실측이 아닙니다.

실제 재로그인 전 자료 차단: **미실행**. 같은 사용자로 새 로그인한 뒤 새 요청의 자료 허용: **미실행**. 운영 엔진의 동일 주체 검증·재로그인 시각 검증·자료 전달 보류·새 요청 재판정 계약과 연결이 확인된 환경에서만 실측합니다. 토큰 원문·비밀번호·자료 본문은 시험 기록에 넣지 않습니다.

이번 저장점은 판정기의 가상 사건 규칙과 실행·기록 안내입니다. 실제 재인증 연결과 자료 전달 전 차단은 구현·실측하지 않았습니다.

## 운영 주소와 실행 방법

운영 주소: https://choi-bujang-secret-vault-2-pi.vercel.app/
원본 자료 주소: https://tajrdnlxsegeburwodnl.supabase.co/rest/v1/notes

- `npm install`: 의존성 설치. 실제 키는 Vercel 환경변수에서만 관리합니다.
- `npm run build -- --local`: 로컬 정적 빌드.
- `npm run build`: Vercel 시스템 환경변수로 배포 정보 생성.
- `node --test test/auth-handler.test.mjs`: 모의 SDK로 로그인 API와 브라우저 세션 갱신 검사.
- 배포 후 `/owner-check.html`: 실제 A·B 계정으로 22개 앱 API 점검. 임시 메모만 만들고 삭제합니다.
- `npm run bundle`: 깨끗한 최신 커밋에서 운영 주소 자기 점검. 설명을 담은 로컬 bundle-notes.json이 필요합니다.

## 확인과 한계

사용자가 권한 회수 후 기존 배포에서 추가·수정·삭제와 로그아웃이 동작한다고 보고했습니다. 새 서버 로그인 코드의 실제 A·B 계정 점검은 배포 후 필요합니다. 로컬 모의 시험은 공식 심판 판정이 아닙니다.
브라우저 세션은 탭의 sessionStorage에 저장합니다. 같은 탭 새로고침은 유지되고 새 탭은 다시 로그인합니다. 비밀번호는 저장하지 않습니다. 갱신 토큰으로 요청 전 만료를 처리합니다.
로그아웃은 현재 세션의 갱신 권한을 회수합니다. 이미 발급된 접근 토큰은 만료까지 유효할 수 있습니다.
/owner-check.html은 시험 세션을 메모리에만 두고 정리 후 로그아웃합니다. 기존 메모는 시험하지 않습니다.
자동 점검은 공개 요청과 정적 코드·메타데이터 검사입니다. 실제 A·B 로그인과 DB authenticated 역할 직접 요청은 자동 점검에 포함하지 않습니다.
이전 공개 Git 커밋·배포·외부 캐시·내려받은 사본은 이번 작업으로 삭제되지 않습니다.
bundle-notes.json과 artifacts/submission.json은 커밋하지 않습니다.

---

## 아래는 1단계 시작 틀의 기존 안내입니다

아래 공개 메모 설명은 초기 1단계의 동작이며, 현재 7단계 작업 상태는 위 저장점 기록을 기준으로 확인합니다.


# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
