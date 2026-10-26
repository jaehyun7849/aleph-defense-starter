# 내 보안 Agent 시작 틀 0.2.11

이 보안 Agent는 회사 직원이 자기 로그인 상태, 업무 앱 접속 결과, 최근 접속 기록과 보안 경보를 보는 보안 앱입니다. 13단계부터 22단계까지 이 프로젝트 하나로 화면을 채워 가며 완성합니다. 처음이라면 docs/GETTING_STARTED_STUDENT.md부터 읽습니다. 무엇을 왜 만드는지와 단계별 순서가 그 문서에 있습니다.

이 시작 틀을 받은 것만으로 단계를 통과하지 않습니다. 단계마다 docs/STUDENT_PROMPTS.md의 안내를 수업용 AI에 붙여 넣어 student/extension.mjs를 고치고, 화면에서 확인하고, 커밋한 뒤 ALEPH에 제출합니다. 제출하면 서버가 그 커밋의 코드를 받아 AI가 단계 과제 기준으로 읽고 판정합니다. 코드를 실행해서 판정하지 않습니다.

## 켜기

검수 환경은 Node.js 24.19.0이며 외부 npm 의존성이 없습니다. 이 폴더의 PowerShell에서 아래를 실행하고 PC 브라우저로 http://127.0.0.1:5189 를 엽니다. 자세한 켜기·끄기·다시 켜기는 docs/STUDENT_LAUNCH_GUIDE.md에 있습니다.

    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1

npm start도 같은 서버를 켭니다. 기본 실행은 실제 회사 시스템(기존 엔진)에 연결되지 않은 상태입니다. npm run demo는 예제 자료로 화면을 보여 줄 뿐이며 실제 연결이나 성취가 아닙니다. npm run check는 student/extension.mjs의 문법만 확인합니다.

## 지킬 것

- 기존 1~3차 프로젝트와 학생 파일은 지우거나 덮어쓰지 않습니다. 새 폴더에서 시작하거나, 이미 하던 프로젝트를 이어 씁니다.
- AI 열쇠·비밀번호·토큰을 코드, 커밋, 캡처, 도움정보에 넣지 않습니다. 주소나 열쇠를 직접 입력하는 칸도 만들지 않습니다.
- .env.example에는 비밀 없는 설정만 있습니다.

## 더 읽을 곳

- 단계별 안내와 AI에 붙여 넣을 문장: docs/STUDENT_PROMPTS.md
- 단계별 확인 항목: docs/CURRICULUM.json, docs/IMPLEMENTATION_CONTRACT.md
- 오류 코드별 해결: docs/CONNECTION_TROUBLESHOOT.md
- 시작 틀 업데이트(내 파일 보존): docs/STARTER_UPDATE.md
- 실제 회사 시스템(SDP)·앱 안 AI 연결은 담당자가 따로 안내할 때만 씁니다: docs/SDP_HOST_CONNECTION.md, docs/AI_SETUP_GUIDE.md. 이 연결은 앱을 처음 켜고 13~16단계 화면을 만들거나 공식 AI 코드 판정을 받기 위한 전제 조건은 아닙니다. 다만 17단계 이후의 실제 연결과 새 환경 재현은 해당 단계의 기준에 따라 따로 확인합니다.

## 학생 작성: 케셰브 실행 설명서 (21단계)

케셰브의 학생 화면은 본인 계정·기기·세션, 업무 앱 접근 판정, 보안 기록, AI 연결·설명, 조치 요청 상태와 OSV 조회 결과를 구분해 표시합니다. 학생 표시는 `student/extension.mjs`, 제공 화면·서버·연동은 `public/`·`src/`에 있습니다. Windows PowerShell에서 실행하며, package.json의 기준 Node.js는 24.19.0입니다. 2026-10-26에는 Node.js 24.22.1과 Windows PowerShell 5.1에서 실행 도구 및 로컬 HTTP 응답만 확인했습니다. 실제 계정·AI·조치 연결 완료를 뜻하지 않습니다.

실제 작업 위치, 실행·종료 방법, 글로 쓴 구성도, 오류 확인 순서와 미확인 항목은 [학생 실행 설명서](docs/STUDENT_RUNBOOK.md)에 있습니다. 위 제공 문서는 보존했으며, 현재 파일과 다른 안내가 있는 경우 학생 설명서의 대조 표를 함께 확인합니다.
