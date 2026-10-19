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
    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      const kindText = kind => kind === 'access' ? '접속 기록 (access)'
        : kind === 'xdr' ? 'XDR 경보 (xdr)' : `확인 불가 (${value(kind)})`;
      const appText = appId => typeof appId === 'string' && appId.length > 0
        ? appId : '앱 확인 불가';
      add(root, 'h3', '접속 기록·XDR 경보');
      add(root, 'p', '본인의 최근 기록 최대 40건 범위입니다. XDR 경보는 서버에 저장된 기록이며 새로 탐지하지 않습니다.');
      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      if (mode !== 'connected') {
        add(root, 'p', Object.hasOwn(modes, mode) ? modes[mode] : '확인 불가');
      }
      if (status === 'loading') {
        add(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `기록을 불러오지 못했습니다: ${value(error?.message)}`);
        if (error?.code === 'CONTRACT_MISMATCH') add(root, 'p', '확인 불가 (CONTRACT_MISMATCH)');
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        add(root, 'p', '기록을 불러오지 못했습니다: 기록 응답을 확인할 수 없습니다.');
        return root;
      }
      if (data.length === 0) {
        add(root, 'p', '표시할 기록이 없습니다');
        return root;
      }
      const eventTime = event => {
        const time = Date.parse(event?.at);
        return Number.isFinite(time) ? time : -Infinity;
      };
      const events = [...data].sort((a, b) => eventTime(b) - eventTime(a) || 0);
      const stateText = (kind, input) => {
        const labels = {
          access: { allowed: '접근 허용', denied: '접근 거부', unknown: '확인 불가' },
          session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
          device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' },
        };
        const code = typeof input === 'string' && Object.hasOwn(labels[kind], input) ? input : 'unknown';
        return `${labels[kind][code]}(${code})`;
      };
      const controls = add(root, 'div', '');
      const selections = {};
      const filters = [
        { key: 'kind', name: '기록 종류', read: event => event?.kind, label: kindText },
        { key: 'appId', name: '업무 앱', read: event => event?.appId, label: appText },
        { key: 'access', name: '접속 상태', read: event => event?.state?.access,
          label: code => stateText('access', code) },
      ];
      for (const filter of filters) {
        const label = add(controls, 'label', '');
        add(label, 'span', filter.name);
        const select = add(label, 'select', '');
        select.setAttribute('aria-label', filter.name);
        const choices = ['all', ...new Set(events.map(filter.read)
          .filter(item => typeof item === 'string' && item.length > 0 && item !== 'all'))];
        for (const choice of choices) {
          const option = add(select, 'option', choice === 'all' ? '전체' : filter.label(choice));
          option.value = choice;
        }
        select.value = 'all';
        selections[filter.key] = select;
      }
      const count = add(root, 'p', `표시 ${events.length}건 / 받은 기록 ${events.length}건`);
      count.setAttribute('aria-live', 'polite');
      const list = add(root, 'ul', '');
      const detail = add(root, 'div', '');
      const drawDetail = event => {
        detail.textContent = '';
        const section = add(detail, 'section', '');
        section.setAttribute('data-student-event-detail', value(event?.id));
        add(section, 'h4', `${value(event?.id)} 상세`);
        add(section, 'p', `사건 ID: ${value(event?.id)}`);
        add(section, 'p', `업무 앱: ${appText(event?.appId)}`);
        for (const [field, title] of [['evidence', '근거'], ['rules', '규칙']]) {
          add(section, 'h5', title);
          if (!Array.isArray(event?.[field])) {
            add(section, 'p', `${title}: 확인 불가`);
          } else if (event[field].length === 0) {
            add(section, 'p', `제공된 ${title} 없음`);
          } else {
            const items = add(section, 'ul', '');
            for (const item of event[field]) {
              add(items, 'li', `ID: ${value(item?.id)} · ${value(item?.text)}`);
            }
          }
        }
        add(section, 'p', `접속 상태: ${stateText('access', event?.state?.access)}`);
        add(section, 'p', `세션 상태: ${stateText('session', event?.state?.session)}`);
        add(section, 'p', `기기 상태: ${stateText('device', event?.state?.device)}`);
        if (Array.isArray(event?.supportedActions) && event.supportedActions.length > 0) {
          add(section, 'p', '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중이며 요청을 보내지 않습니다.');
          for (const action of event.supportedActions) {
            if (typeof action !== 'string' || action.length === 0) continue;
            const button = add(section, 'button', `${action} 미지원`);
            button.setAttribute('type', 'button');
            button.disabled = true;
          }
        }
      };
      const drawList = records => {
        list.textContent = '';
        detail.textContent = '';
        count.textContent = `표시 ${records.length}건 / 받은 기록 ${events.length}건`;
        if (records.length === 0) add(list, 'li', '조건에 맞는 기록이 없습니다');
        for (const event of records) {
          const row = add(list, 'li', '');
          row.setAttribute('data-student-event-id', value(event?.id));
          add(row, 'p', `사건 ID: ${value(event?.id)}`);
          add(row, 'p', `시각: ${value(event?.at)}`);
          add(row, 'p', `종류: ${kindText(event?.kind)}`);
          add(row, 'p', `업무 앱: ${appText(event?.appId)}`);
          add(row, 'p', `요약: ${value(event?.summary)}`);
          const button = add(row, 'button', `${value(event?.id)} 상세`);
          button.setAttribute('type', 'button');
          button.addEventListener('click', () => drawDetail(event));
        }
      };
      for (const filter of filters) {
        selections[filter.key].addEventListener('change', () => {
          drawList(events.filter(event => filters.every(item => selections[item.key].value === 'all'
            || item.read(event) === selections[item.key].value)));
        });
      }
      drawList(events);
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const safeText = input => {
        if (typeof input !== 'string' || input.length === 0) return '확인 불가';
        const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\bsb_secret_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|api[_-]?key|token|secret)\s*[:=]\s*\S+/i;
        return secret.test(input) ? '민감정보 제외' : input;
      };
      const showMode = (parent, input) => {
        const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
        if (input !== 'connected') add(parent, 'p', Object.hasOwn(modes, input) ? modes[input] : '확인 불가');
      };
      const retry = (parent, title, error, diagnostic = false) => {
        const timedOut = typeof error?.code === 'string' && /(?:^|_)TIMEOUT$/.test(error.code);
        add(parent, 'p', `${title} 조회 실패${timedOut ? ' (시간 초과)' : ''}: ${safeText(error?.message)}`);
        add(parent, 'p', diagnostic
          ? '진단 정보를 다시 조회하려면 제공 도움정보 영역의 도움정보 불러오기 버튼을 직접 누르세요.'
          : '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요.');
      };
      const stateText = (labels, input) => {
        const code = typeof input === 'string' && Object.hasOwn(labels, input) ? input : 'unknown';
        return `${labels[code]}(${code})`;
      };
      const renderList = (title, resource, empty, renderItem) => {
        const section = add(root, 'section', '');
        add(section, 'h3', title);
        showMode(section, resource?.mode);
        if (resource?.status === 'loading') {
          add(section, 'p', `${title}: 불러오는 중`);
        } else if (resource?.status === 'error') {
          retry(section, title, resource.error);
        } else if (resource?.status !== 'ok' || !Array.isArray(resource.data)) {
          add(section, 'p', `${title}: 확인 불가`);
        } else if (resource.data.length === 0) {
          add(section, 'p', empty);
        } else {
          const list = add(section, 'ul', '');
          for (const item of resource.data) add(list, 'li', renderItem(item));
        }
      };
      add(root, 'h3', '기기·세션·알림 상태');
      showMode(root, mode);
      renderList('기기', devices, '등록된 기기가 없습니다', device =>
        `${safeText(device?.label)} · ${stateText({ compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }, device?.status)}`);
      add(root, 'p', '세션 조회 범위는 현재 검증된 연결 한 개입니다. 과거 세션 전체 목록이 아닙니다.');
      renderList('세션', sessions, '현재 연결이 없습니다', session =>
        `세션 ID: ${safeText(session?.id)} · ${stateText({ active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' }, session?.status)}`);
      const notice = add(root, 'section', '');
      add(notice, 'h3', '알림');
      if (!Array.isArray(notifications)) {
        add(notice, 'p', '알림 상태: 확인 불가');
      } else if (notifications.length === 0) {
        add(notice, 'p', '주의할 알림이 없습니다');
      } else {
        const list = add(notice, 'ul', '');
        for (const notification of notifications) {
          const item = add(list, 'li', '');
          add(item, 'p', `자료(resource): ${safeText(notification?.resource)}`);
          add(item, 'p', `코드(code): ${safeText(notification?.code)}`);
          add(item, 'p', `알림: ${safeText(notification?.message)}`);
        }
      }
      const diagnosticSection = add(root, 'section', '');
      add(diagnosticSection, 'h3', '진단 정보');
      showMode(diagnosticSection, diagnostics?.mode);
      const diagnosticData = diagnostics?.data;
      const hasDiagnostics = diagnostics?.status === 'ok' && diagnosticData !== null
        && typeof diagnosticData === 'object' && !Array.isArray(diagnosticData)
        && Object.keys(diagnosticData).length > 0;
      let helpText = null;
      if (diagnostics?.status === 'loading') {
        add(diagnosticSection, 'p', '진단 정보: 불러오는 중');
      } else if (diagnostics?.status === 'error') {
        retry(diagnosticSection, '진단 정보', diagnostics.error, true);
      } else if (diagnostics?.status === 'idle') {
        add(diagnosticSection, 'p', '진단 정보를 아직 조회하지 않았습니다. 제공 도움정보 영역의 도움정보 불러오기 버튼을 직접 누르세요.');
      } else if (!hasDiagnostics) {
        add(diagnosticSection, 'p', '진단 정보: 확인 불가');
      } else {
        // Project only the six allowed fields; never serialize the original diagnostic object.
        const help = {
          requestId: safeText(diagnosticData.requestId),
          component: safeText(diagnosticData.component),
          version: safeText(diagnosticData.version),
          checkedAt: safeText(diagnosticData.checkedAt),
          engine: {
            mode: safeText(diagnosticData.engine?.mode),
            code: safeText(diagnosticData.engine?.code),
          },
        };
        helpText = JSON.stringify(help, null, 2);
        add(diagnosticSection, 'pre', helpText);
      }
      add(diagnosticSection, 'p', '도움정보 복사는 도움 요청에 사용할 위 진단 항목만 복사합니다. 사용자가 누르기 전에는 복사하지 않습니다.');
      const copy = add(diagnosticSection, 'button', '도움정보 복사');
      copy.setAttribute('type', 'button');
      copy.disabled = helpText === null;
      const copyStatus = add(diagnosticSection, 'p', '');
      copyStatus.setAttribute('role', 'status');
      copyStatus.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async () => {
        if (copy.disabled || helpText === null) return;
        copy.disabled = true;
        try {
          if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error('clipboard_unavailable');
          await globalThis.navigator.clipboard.writeText(helpText);
          copyStatus.textContent = '허용된 진단 도움정보를 클립보드에 복사했습니다.';
        } catch {
          copyStatus.textContent = '클립보드에 복사하지 못했습니다. 위 진단 도움정보를 직접 선택해 복사하세요.';
        } finally {
          copy.disabled = false;
        }
      });
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
