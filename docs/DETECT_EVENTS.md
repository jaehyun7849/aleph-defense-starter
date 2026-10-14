# 9단계 탐지 사건과 별도 회수 제안

제공 시작 틀의 v1 사건은 `{at, method, identity: {sub}}`입니다. 같은 사용자의 어느 10분 구간에서든 GET 120건을 초과하면 `{action:'propose_revocation', reasonCode:'burst_read', subject:'해당 가명 sub'}`를 반환하고 나머지는 observe입니다. 네트워크·기기 값을 만들거나 subject를 실제 기기 ID로 바꾸지 않습니다. 이 계약에서 실제 대상 기기 연결·집행은 이 함수의 확인 범위 밖입니다.

34e0bfd 저장점은 아래 로컬 확장 항목을 필수로 요구해 제공 v1 폭주 사건에도 observe를 반환했습니다. 이 호환성 결함을 수정했습니다. 이제 입력 묶음에 signals/deviceId/deviceRegistered가 하나도 없으면 v1 계약을 적용하며, 해당 항목이 있으면 확장 조건을 적용합니다. 불완전한 확장 정보나 두 형식의 혼합을 v1으로 간주하지 않습니다.

이번 사용자 요청은 **평소와 다른 네트워크와 대량 조회의 복합 조건**, **확인된 기기 한 개의 회수 제안**입니다. 이를 시험하기 위해 로컬 가상 사건을 아래처럼 확장했습니다. 운영 엔진이 이 확장을 제공한다는 의미는 아닙니다.

```js
{
  at: '2026-10-01T00:00:00.000Z',
  method: 'GET',
  identity: { sub: 'learner_fixture' },
  signals: { source: 'judge_fixture', network: 'unusual' },
  deviceId: 'aaaaaaaaaaaaaaaa',
  deviceRegistered: true
}
```

`network`는 usual/unusual/unknown 분류만 받으며 실제 IP나 네트워크 이름은 보관하지 않습니다. 누락 정보는 정상값으로 채우지 않습니다. 지역·메모·토큰·실명·클라이언트 헤더는 근거로 읽거나 출력하지 않습니다. `source`와 `deviceRegistered`라는 문자열/불리언 자체가 인증 증거는 아닙니다. 검증된 엔진 사건만 전달하는 호출 경계가 필요하며 브라우저가 직접 보내는 사건은 신뢰할 수 없습니다.

같은 가명 사용자와 등록 확인된 기기별로 10분 이동 구간의 GET이 120건을 넘고, 그 구간에 judge_fixture의 unusual 네트워크 사건이 있을 때만 다음 별도 결과를 반환합니다. 120건 이하, 평소 네트워크 대량 조회, 지역만 다른 사건, 네트워크·기기 확인 누락은 observe입니다. 다른 사용자·기기의 조회는 합산하지 않습니다. 여러 기기가 탐지돼도 한 호출에서는 한 기기의 제안만 반환합니다.

```js
{ action: 'propose_revocation', reasonCode: 'burst_read',
  subject: 'learner_fixture', deviceId: 'aaaaaaaaaaaaaaaa' }
```

정상 사건 결과는 `{action: 'observe'}`입니다. 기존 src/decider.mjs의 접속 결정 응답 5개 항목은 변경하지 않았습니다. 회수 API·권한 변경은 구현하지 않았습니다. 실제 회수·재접속 차단·경과 시간과 공식 심판 판정은 미확인입니다. v1은 제공 조회량 계약이며, 확장은 별도의 네트워크+조회량 조건입니다. 둘을 같은 시험 통과로 혼동하지 않습니다.

시험: `npm run detect:test`, `node --test test/detect-input.test.mjs test/detect-rule.test.mjs`. 출력에는 시험 이름·통과 여부만 표시합니다.
