# 8단계 자원과 서버 권한

기존 notes 테이블, 메모 UUID·본문, `/api/notes`와 `/api/notes/:id`를 유지합니다. 응답에 `resourceId`를 추가하며 개인 메모는 `personal_note:<UUID>`, 공지는 `instructor_notice:<UUID>`입니다. 개별 응답의 `X-Resource-Id`도 같은 값입니다. 목록은 개인 메모와 공지를 분리합니다. 새 공지 주소는 `/api/notices`, `/api/notices/:id`이고 화면 메뉴는 바꾸지 않습니다.

서버는 Vercel 서버 환경변수 `VAULT_RESOURCE_POLICY`의 등록 정보로 분류와 강사 권한을 결정합니다. 운영자가 설정 화면에서 관리하며 실제 사용자 정보가 담긴 설정값을 Git·답변·로그에 넣지 않습니다. 요청 본문의 role·resourceId, 브라우저 위치·헤더, Supabase user_metadata는 권한 근거가 아닙니다.

설정 JSON은 다음 세 배열을 모두 가집니다.

- `noticeIds`: 공지로 지정할 기존 메모 UUID 또는 새 공지용으로 예약한 UUID 목록. 다른 메모는 개인 메모로 유지합니다.
- `instructorUserIds`: 공지를 만들고 수정·삭제할 수 있는 검증된 로그인 사용자 UUID 목록. 작성자라도 이 목록에 없으면 공지를 수정할 수 없습니다.
- `subjects`: 엔진이 검증한 가명 주체와 사용자 UUID의 운영자 등록 매핑. 각 항목은 `{classId, projectId, subjectId, userId}`입니다. 판정기는 subjectId를 사용자 UUID와 직접 비교하지 않습니다.

설정이 없으면 기존 메모는 모두 개인 메모이고, 공지 목록과 강사 목록은 비어 있습니다. 기존 데이터를 자동으로 공지로 바꾸지 않습니다. 공지 POST는 운영자가 예약한 UUID를 보내야 하고 등록 강사만 실행할 수 있습니다. 잘못된 설정은 오류로 거부합니다. 실제 공지와 강사 계정은 아직 지정하지 않았습니다.

## 권한과 경로

개인 메모는 DB 소유자와 검증된 로그인 사용자 UUID가 같은 경우만 읽기·변경을 허용합니다. 목록도 본인 메모만 가져오며 공지를 제외합니다. 공지는 로그인 사용자가 읽을 수 있고 서버 등록 강사만 변경할 수 있습니다. 분류된 공지의 기존 `/api/notes/:id` 주소에도 동일한 공지 권한을 적용합니다. `/api/notices/:id`로 개인 메모를 조회하는 것은 거부합니다.

경로는 목록 또는 UUID 한 개의 자료로만 정합니다. 쿼리 문자열은 다른 자원이나 기능을 선택하지 못하며, export 같은 기능 이름을 UUID 자리에 두지 않습니다. 미허용 경로는 resource_not_allowed, 자원 권한 거부는 resource_forbidden 사유를 반환합니다. 거부 로그에 토큰·제목·본문을 기록하지 않습니다.

## 엔진 계약과 한계

기존 판정기 입력 18개와 응답 5개는 유지합니다. `resourceId`, `role`, `identity`를 요청에 새로 추가하지 않습니다. 엔진의 `service: notes`, `method`, `path`, `route`로 경로를 확인하고, 서버 등록 subjects와 DB 소유자를 조회합니다. `/notes`와 `/notices`는 같은 notes 서비스의 서로 다른 자원 경로입니다. 엔진은 이 경로를 운영 서비스 등록부에도 등록해야 합니다.

등록 기기 검사와 복합 이상 재확인 규칙을 유지하며 새 RULE_IDS 항목은 `resource_scope`입니다. 운영 이유 코드 등록부에 `resource_not_allowed`, `resource_forbidden`을 등록해야 합니다. 이 저장소에서 외부 등록부는 수정하지 않았습니다.

실제 UUID 메모는 엔진 주체 매핑이 없거나 소유자 조회가 실패하면 판정기가 허용하지 않습니다. 제공 시작 틀의 공개 가상 자료 `/notes/demo`는 `src/engine-resource-grants.mjs`에 별도로 등록합니다. `class_fixture/project_fixture/learner_fixture`, 기기 `aaaaaaaaaaaaaaaa`, 서비스 notes, 정확한 자원 경로, GET/PUT만 일치해야 합니다. 이는 Supabase 사용자나 강사 역할을 만드는 매핑이 아닙니다. 등록 기기와 추가 확인 규칙도 그대로 적용하고 signals.source로 특별 허용하지 않습니다. API의 UUID 경로 규칙과 실제 자료 권한은 바뀌지 않습니다.

원본 연습 요청은 [제공 시작 틀의 fixture-7.mjs](https://github.com/ChoiTimo/aleph-defense-starter/blob/main/scripts/fixture-7.mjs)를 기준으로 복구했습니다. `npm run decider:test`와 `npm run fixture:7`은 모의 판정기를 주입하지 않고 제출 함수 decide를 직접 호출합니다. scripts/fixture-resource-context.mjs는 모의 DB/강사 권한 단위 시험에서만 사용합니다. 로컬 검사의 통과는 운영 엔진 연결·등록부·실제 심판 판정을 대신하지 않습니다.

```powershell
node --test test/decider-entry.test.mjs test/resource-scope.test.mjs test/decider-input.test.mjs test/decider-step-up.test.mjs
```

화면 조작은 없습니다. 실제 계정으로 기존 메모의 소유자 분리를 확인하려면 배포 후 `/owner-check.html`을 사용할 수 있습니다. 실제 공지/강사 검증은 서버에 자원을 지정한 후 별도로 해야 합니다. 기존 7단계 재로그인 시각 검증·자료 전달 보류 연결도 아직 미실행입니다.
