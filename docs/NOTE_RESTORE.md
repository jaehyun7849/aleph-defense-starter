# 지정 메모 한 건 복구

서비스: 자료실 복구 API. 경로: POST /api/restore-note. 인증은 기존 서버 로그인 검증기를 사용합니다. 서버에 등록한 시험 계정 B의 UUID와 일치해야 합니다. 요청 본문의 역할·소유자 주장만으로 허용하지 않습니다. 화면 메뉴는 바꾸지 않습니다.

비공개 서버 환경변수:
- VAULT_RECOVERY_TEST_B_ID: 공식 설정에서 지정한 시험 B의 사용자 UUID.
- VAULT_NOTE_BACKUP: 비공개 검토 사본 JSON 문자열. 공개 파일·Git·클라이언트에는 두지 않습니다.
- VAULT_NOTE_BACKUP_SHA256: 별도로 검토·보관한 사본 문자열의 UTF-8 바이트 SHA-256. 실행 시 사본에서 새로 계산해 안전하다고 지정하지 않습니다.

사본 형식은 `{schema:'aleph.note-backup.v1',id,ownerId,title,body,contentSha256}`이고 메모 한 건만 담습니다. ownerId는 등록한 B와 같아야 합니다. contentSha256은 `SHA256(UTF8(JSON.stringify({title,body})))`이며 순서는 title, body입니다. 원문 그대로 비교하고 정규화·잘라내기를 하지 않습니다.

POST 본문은 `{id,ownerId,contentSha256}` 세 값만 받습니다. 복구 내용은 요청 본문이 아니라 서버 사본에서만 가져옵니다. 응답은 `{id,ownerId,contentSha256,restored:true}`로 메모 내용·토큰을 내보내지 않습니다.

기존 대상은 id와 owner_id를 함께 조건으로 갱신합니다. 삭제된 대상은 같은 ID로 삽입하며 충돌 시 409로 중단합니다. upsert·전체 삭제·다른 소유자 변경은 없습니다. 성공 응답은 반환된 행의 ID·소유자·내용 해시가 사본과 같을 때만 보냅니다. audit 테이블을 호출하지 않으며 DB의 기존 감사 트리거는 제거하지 않습니다.

`node --test test/note-restore.test.mjs`는 가상 SDK로 정상 B 복구와 거부·보존을 확인합니다. 실제 사본과 실제 B 계정이 아직 제공되지 않아 운영 복구는 실행하지 않았습니다. 비밀번호·토큰·키·메모 본문을 테스트 출력에 붙이지 않습니다.
