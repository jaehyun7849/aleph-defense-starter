// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      const deviceStates = {
        compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가',
      };
      const sessionStates = {
        active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가',
      };
      const stateText = (labels, status) => {
        const code = typeof status === 'string' && Object.hasOwn(labels, status) ? status : 'unknown';
        return `${labels[code]} (${code})`;
      };
      const resourceSection = (title, resource, renderData) => {
        const section = add(root, 'section', '');
        add(section, 'h3', title);
        const modes = {
          demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가',
        };
        if (resource?.mode !== 'connected') {
          add(section, 'p', Object.hasOwn(modes, resource?.mode) ? modes[resource.mode] : '확인 불가');
        }
        if (resource?.status === 'loading') {
          add(section, 'p', '불러오는 중');
          return;
        }
        if (resource?.status === 'error') {
          add(section, 'p', `연결 실패 또는 확인 불가: ${value(resource.error?.message)}`);
          return;
        }
        if (resource?.status !== 'ok') {
          add(section, 'p', '확인 불가');
          return;
        }
        renderData(section, resource.data);
      };
      resourceSection('현재 로그인', me, (section, data) => {
        add(section, 'p', `사용자: ${value(data?.user?.label)}`);
        add(section, 'p', `사용자 ID: ${value(data?.user?.id)}`);
        add(section, 'p', `현재 기기: ${value(data?.device?.label)}`);
        add(section, 'p', `현재 기기 ID: ${value(data?.device?.id)}`);
        add(section, 'p', `현재 기기 상태: ${stateText(deviceStates, data?.device?.status)}`);
        add(section, 'p', `현재 세션 ID: ${value(data?.session?.id)}`);
        add(section, 'p', `현재 세션 상태: ${stateText(sessionStates, data?.session?.status)}`);
      });
      resourceSection('기기 목록', devices, (section, data) => {
        if (!Array.isArray(data)) {
          add(section, 'p', '기기 목록: 확인 불가');
          return;
        }
        if (data.length === 0) add(section, 'p', '조회된 기기 없음');
        for (const device of data) {
          add(section, 'p', `기기: ${value(device?.label)} · ID: ${value(device?.id)}`);
          add(section, 'p', `기기 상태: ${stateText(deviceStates, device?.status)}`);
        }
      });
      resourceSection('세션 목록', sessions, (section, data) => {
        if (!Array.isArray(data)) {
          add(section, 'p', '세션 목록: 확인 불가');
          return;
        }
        if (data.length === 0) add(section, 'p', '조회된 세션 없음');
        for (const session of data) {
          add(section, 'p', `세션 ID: ${value(session?.id)}`);
          add(section, 'p', `세션 상태: ${stateText(sessionStates, session?.status)}`);
        }
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('div');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.appendChild(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      add('h3', '업무 앱 접근 요청 결과');
      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      if (mode !== 'connected') {
        add('p', Object.hasOwn(modes, mode) ? modes[mode] : '확인 불가');
      }
      if (typeof appId === 'string' && appId.length > 0) add('p', `요청한 업무 앱 ID: ${appId}`);
      if (status === 'idle') {
        add('p', '업무 앱을 골라 접속을 요청하세요.');
        return root;
      }
      if (status === 'loading') {
        add('p', '판정 확인 중');
        return root;
      }
      if (status === 'error') {
        add('p', `요청 실패: ${value(error?.message)}`);
        add('p', '접근 거부(deny) 판정이 아니라 요청 처리 실패입니다. 접근 허용 여부는 확인할 수 없습니다.');
        return root;
      }
      if (status !== 'ok') {
        add('p', '판정 확인 불가 (unknown)');
        return root;
      }
      const decisions = {
        allow: '접근 허용', deny: '접근 거부',
        challenge: '추가 인증 또는 확인 필요', unknown: '판정 확인 불가',
      };
      const decision = typeof data?.decision === 'string' && Object.hasOwn(decisions, data.decision)
        ? data.decision : 'unknown';
      add('p', `판정 대상 앱 ID: ${value(data?.appId)}`);
      add('p', `판정: ${decisions[decision]} (${decision})`);
      add('p', `판정 이유: ${value(data?.reason)}`);
      add('p', `판정 시각: ${value(data?.checkedAt)}`);
      if (decision === 'allow') {
        add('p', '정책상 접근 허용이며 실제 앱 접속 성공을 보장하지 않습니다.');
      } else if (decision === 'challenge') {
        add('p', '이 앱은 추가 인증 또는 확인 절차를 대신 수행하지 않습니다.');
      } else if (decision === 'unknown') {
        add('p', '접근이 허용되었는지 확인할 수 없습니다.');
      }
      return root;
    },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
