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
    renderVulnerabilities({ status = 'idle', mode, data, error } = {}) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const safeText = value => {
        if (typeof value !== 'string' && typeof value !== 'number') return '확인 불가';
        const text = String(value);
        const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\bsb_secret_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|api[_-]?key|token|secret)\s*[:=]\s*\S+/i;
        return secret.test(text) ? '민감정보 제외' : text || '확인 불가';
      };
      const field = (parent, label, value) => {
        if (value !== undefined && value !== null) add(parent, 'p', `${label}: ${safeText(value)}`);
      };
      add(root, 'h3', '설치 패키지와 알려진 취약점 조회');
      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      if (Object.hasOwn(modes, mode)) add(root, 'p', modes[mode]);
      add(root, 'p', 'OSV는 알려진 취약점 정보입니다. 조회 결과가 없다는 사실만으로 패키지나 앱 전체의 안전성을 보장하지 않습니다.');
      if (status === 'idle') {
        add(root, 'p', '조회 전(idle). 제공 화면의 설치 패키지 조회 버튼을 직접 눌러 조회하세요.');
        return root;
      }
      if (status === 'loading') {
        add(root, 'p', '조회 중(loading). 이전 표는 현재 결과로 표시하지 않습니다.');
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `조회 실패: ${safeText(error?.message)}`);
        field(root, '오류 코드', error?.code);
        add(root, 'p', '조회 실패는 취약점이 없다는 뜻이 아닙니다. 다시 조회하려면 제공 화면의 설치 패키지 조회 버튼을 직접 누르세요.');
        return root;
      }
      const scanLabels = {
        complete: '모두 조회', partial: '일부 조회 실패', not_checked: '아직 조회 안 함',
        not_configured: '조회 준비 미완료', unverifiable: 'lock 파일 확인 불가',
      };
      if (status !== 'ok' || !data || !Object.hasOwn(scanLabels, data.status)) {
        add(root, 'p', '조회 결과 확인 불가. 알려진 취약점이 없는 것으로 판단할 수 없습니다.');
        return root;
      }
      add(root, 'p', `전체 조회 상태: ${scanLabels[data.status]}(${data.status})`);
      field(root, 'lockfileVersion', data.lockfileVersion);
      field(root, 'lockfileHash', data.lockfileHash);
      field(root, '전체 확인 시각(checkedAt)', data.checkedAt);
      if (data.status === 'not_configured') add(root, 'p', '조회 대상 프로젝트 설정이 필요합니다. 대상 경로와 공개 패키지 허용 목록은 담당자가 준비합니다.');
      if (data.status === 'not_checked') add(root, 'p', '승인된 공개 조회 대상 없음 등으로 아직 조회하지 않았습니다. 취약점이 없다는 뜻이 아닙니다.');
      if (data.status === 'unverifiable') add(root, 'p', '잠금 파일과 설치 패키지의 대조 결과를 확인할 수 없습니다.');
      if (!Array.isArray(data.packages)) {
        add(root, 'p', '패키지 목록 확인 불가. 조회 결과가 없는 것으로 판단할 수 없습니다.');
        return root;
      }
      if (data.packages.length === 0) add(root, 'p', '전달된 패키지 결과가 없습니다. 미조회·설정 필요·확인 불가 상태는 알려진 취약점 없음과 다릅니다.');
      const packageLabels = {
        known_vulnerabilities: '알려진 항목 있음', none_found: '알려진 항목 없음', unverifiable: '조회 확인 불가',
      };
      for (const pkg of data.packages) {
        const row = add(root, 'section', '');
        const name = safeText(pkg.name);
        const version = safeText(pkg.version);
        row.setAttribute('data-student-package-name', name);
        row.setAttribute('data-student-package-version', version);
        add(row, 'h4', `패키지: ${name}`);
        add(row, 'p', `설치된 정확한 버전: ${version}`);
        const packageStatus = Object.hasOwn(packageLabels, pkg.status) ? pkg.status : 'unverifiable';
        add(row, 'p', `패키지 조회 상태: ${packageLabels[packageStatus]}(${packageStatus})`);
        field(row, '조회 출처(source)', pkg.source);
        field(row, '패키지 확인 시각(checkedAt)', pkg.checkedAt);
        const findings = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [];
        if (packageStatus === 'none_found') add(row, 'p', '이 정확한 버전의 조회 범위에서 알려진 항목이 없습니다. 안전성을 보장하지 않습니다.');
        if (packageStatus === 'unverifiable') add(row, 'p', findings.length > 0
          ? '일부 확인·전체 조회 확인 불가. 이미 받은 취약점 ID는 아래에 유지합니다.'
          : '조회를 확인할 수 없습니다. 알려진 취약점이 없는 것으로 판단할 수 없습니다.');
        for (const finding of findings) {
          add(row, 'p', `취약점 ID: ${safeText(finding.id)} · 수정 시각(modified): ${safeText(finding.modified)}`);
        }
      }
      return root;
    },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted = false } = {}) {
      const root = document.createElement('div');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.appendChild(node);
        return node;
      };
      const safeText = input => {
        if (typeof input !== 'string' || input.length === 0) return '확인 불가';
        const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\bsb_secret_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|api[_-]?key|token|secret)\s*[:=]\s*\S+/i;
        return secret.test(input) ? '민감정보 제외' : input;
      };
      add('h3', '앱 내부 AI 연결 점검');
      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      if (mode !== 'connected') add('p', Object.hasOwn(modes, mode) ? modes[mode] : '확인 불가');
      add('p', '자동으로 다시 점검하지 않습니다. 다시 점검하려면 제공 AI 연결 영역의 현재 API 연결 점검 버튼을 직접 누르세요.');
      if (status === 'idle') {
        add('p', 'AI 연결 점검 전');
        return root;
      }
      if (status === 'loading') {
        add('p', 'AI 연결 점검 중');
        return root;
      }
      if (status === 'error') {
        const pending = ['권한 준비 중 또는 확인 불가', '담당자에게 계정 연결과 앱 이용 권한의 준비 상태를 확인해 달라고 요청하세요.'];
        const auth = ['인증 실패', '계정 연결을 다시 확인하고 담당자에게 인증 상태 확인을 요청하세요.'];
        const models = ['사용 가능한 모델 없음', '담당자에게 모델 허용 설정을 확인해 달라고 요청하세요.'];
        const timeout = ['시간 초과', '잠시 뒤 사용자가 직접 다시 점검하세요.'];
        const cancelled = ['취소됨', '이전 점검 결과는 현재 결과가 아닙니다. 필요하면 직접 다시 점검하세요.'];
        const guides = {
          ON_AI_PROVISIONING_PENDING: pending,
          ON_AI_AUTHORIZATION_CHANGED: pending,
          SUBJECT_SCOPE_UNVERIFIED: pending,
          AI_REQUEST_UNVERIFIED: ['AI 연결 또는 응답 확인 불가', '네트워크와 계정 연결·앱 권한을 확인한 뒤 직접 다시 점검하세요. 필요하면 담당자에게 확인을 요청하세요.'],
          WB_CLCO_AUTH_REQUIRED: auth,
          WB_CLCO_ACCESS_BLOCKED: ['접근 제한', '계정 연결과 앱 이용 권한을 담당자에게 확인해 달라고 요청하세요.'],
          WB_CLCO_COHORT_BUDGET_EXHAUSTED: ['반 AI 사용량 소진', '담당자에게 반 사용량을 확인해 달라고 요청하세요.'],
          WB_CLCO_LIMIT_REACHED: ['AI 이용 한도 도달', '담당자에게 이용 한도를 확인해 달라고 요청하세요.'],
          WB_CLCO_SESSION_CLOSED: ['현재 이용 시간 아님', 'AI 이용 시간을 확인하세요.'],
          WB_CLCO_RATE_LIMITED: ['요청 제한', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
          WB_CLCO_TIMEOUT: timeout, REQUEST_TIMEOUT: timeout, ENGINE_TIMEOUT: timeout, TIMEOUT: timeout,
          WB_CLCO_CANCELLED: cancelled, CANCELLED: cancelled, REQUEST_CANCELLED: cancelled,
          MODEL_NOT_CONFIGURED: models, ON_AI_MODEL_LIST_EMPTY: models,
          ON_AI_INVALID_INPUT: ['사건 입력 확인 불가', '사건의 근거와 규칙을 확인하세요.'],
          ON_AI_INVALID_OUTPUT: ['AI 설명 응답 확인 불가', '기존 기록을 확인하고 필요하면 담당자에게 확인을 요청하세요.'],
        };
        const known = typeof error?.code === 'string' && Object.hasOwn(guides, error.code);
        const code = known ? error.code : 'AI_REQUEST_UNVERIFIED';
        const [cause, guide] = guides[code];
        add('p', `AI 연결 점검 실패: ${cause}`);
        add('p', `코드: ${code}`);
        add('p', `안내: ${known ? safeText(error?.message) : 'AI 연결 또는 응답을 확인할 수 없습니다. 원문 오류는 표시하지 않습니다.'}`);
        add('p', guide);
        return root;
      }
      if (status !== 'ok') {
        add('p', 'AI 연결 점검 상태: 확인 불가');
        return root;
      }
      if (data?.transportChecked !== true || !['test', 'verified'].includes(data?.audienceAuthorization)
          || !Number.isInteger(data?.modelCount) || data.modelCount < 0
          || typeof checkedAt !== 'string' || checkedAt.length === 0) {
        add('p', 'AI 연결 점검 결과: 확인 불가');
        add('p', '연결 점검·앱 권한·모델 수·점검 시각을 확인할 수 없습니다. 사건 설명 성공으로 표시하지 않습니다.');
        return root;
      }
      add('p', data.audienceAuthorization === 'test'
        ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
      add('p', `응답 모델 수: ${data.modelCount}`);
      add('p', `점검 시각: ${safeText(checkedAt)}`);
      if (data.modelCount === 0) add('p', '현재 앱 권한으로 사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인해 달라고 요청하세요.');
      add('p', '연결만 점검했으며 사건 설명은 아직 실행하지 않았습니다. 사건 설명은 보안 기록에서 별도로 요청하고 결과를 확인하세요.');
      if (explanationAccepted !== false) add('p', '사건 설명 실행 여부는 이 연결 점검 입력만으로 확인할 수 없습니다.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('div');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.appendChild(node);
        return node;
      };
      const safeText = input => {
        if (typeof input !== 'string' || input.length === 0) return '확인 불가';
        const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\bsb_secret_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|api[_-]?key|token|secret)\s*[:=]\s*\S+/i;
        return secret.test(input) ? '민감정보 제외' : input;
      };
      add('h3', 'AI 사건 설명(참고용)');
      if (explanation?.mode === 'demo') add('p', '예제 자료');
      if (explanation?.mode === 'disconnected') add('p', '연결 없음');
      if (explanation?.mode === 'unknown') add('p', '확인 불가');
      if (explanation?.status === 'error') {
        const codes = [
          'ON_AI_PROVISIONING_PENDING', 'WB_CLCO_AUTH_REQUIRED', 'WB_CLCO_ACCESS_BLOCKED',
          'WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_RATE_LIMITED', 'WB_CLCO_LIMIT_REACHED',
          'WB_CLCO_SESSION_CLOSED', 'WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT',
          'WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED', 'MODEL_NOT_CONFIGURED',
          'ON_AI_AUTHORIZATION_CHANGED', 'ON_AI_MODEL_LIST_EMPTY', 'SUBJECT_SCOPE_UNVERIFIED',
          'ON_AI_INVALID_INPUT', 'ON_AI_INVALID_OUTPUT', 'AI_REQUEST_UNVERIFIED',
        ];
        const known = codes.includes(explanation.error?.code);
        const code = known ? explanation.error.code : 'AI_REQUEST_UNVERIFIED';
        add('p', `AI 사건 설명 실패 · 코드: ${code}`);
        add('p', known ? safeText(explanation.error?.message) : 'AI 사건 설명의 응답을 확인할 수 없습니다. 원문 오류는 표시하지 않습니다.');
        add('p', '기존 접속·보안 기록은 그대로 유지됩니다. 다시 요청하려면 사용자가 제공 설명 버튼을 직접 누르세요.');
        return root;
      }
      if (!event || explanation?.status === 'idle') {
        add('p', '보안 기록에서 기록을 먼저 고르고 설명을 요청하세요. 사건 설명은 아직 실행하지 않았습니다.');
        return root;
      }
      if (explanation?.status === 'loading') {
        add('p', 'AI 사건 설명 요청 중');
        return root;
      }
      const eventId = safeText(event.id);
      if (explanation?.status !== 'ok' || eventId === '확인 불가' || eventId === '민감정보 제외'
          || typeof explanation.data?.summary !== 'string' || explanation.data.summary.length === 0) {
        add('p', 'AI 사건 설명 결과: 확인 불가');
        add('p', '기존 접속·보안 기록은 그대로 유지됩니다.');
        return root;
      }
      const result = explanation.data;
      const evidence = new Map((Array.isArray(event.evidence) ? event.evidence : []).map(item => [item.id, item.text]));
      const referencesMatch = refs => Array.isArray(refs) && refs.length > 0
        && refs.every(ref => evidence.has(ref));
      if (!referencesMatch(result.evidenceIds) || !Array.isArray(result.proposals)
          || result.requiresHumanConfirmation !== true || result.executed !== false
          || result.proposals.some(proposal => !referencesMatch(proposal.evidenceIds)
            || !Array.isArray(event.supportedActions) || !event.supportedActions.includes(proposal.action))) {
        add('p', 'AI 사건 설명 결과: 확인 불가');
        add('p', '현재 사건의 근거 또는 제안의 확인 조건이 일치하지 않습니다. 기존 접속·보안 기록은 그대로 유지됩니다.');
        return root;
      }
      root.setAttribute('data-student-explanation-event', eventId);
      add('p', `사건 ID: ${eventId}`);
      add('p', safeText(explanation.data.summary));
      if (typeof checkedAt === 'string' && checkedAt.length > 0) add('p', `설명 확인 시각: ${safeText(checkedAt)}`);
      add('p', 'AI 요약은 참고용 해석입니다. 현재 사건의 근거·규칙·상태와 함께 확인하세요.');
      add('h4', '인용한 근거');
      for (const ref of result.evidenceIds) add('p', `${safeText(ref)} — ${safeText(evidence.get(ref))}`);
      add('h4', '현재 사건의 규칙');
      if (!Array.isArray(event.rules) || event.rules.length === 0) add('p', '제공된 규칙이 없습니다.');
      else for (const rule of event.rules) add('p', `${safeText(rule.id)} — ${safeText(rule.text)}`);
      add('h4', '현재 사건의 상태');
      const stateLabels = {
        access: { allowed: '접근 허용', denied: '접근 거부', unknown: '확인 불가' },
        session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
        device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' },
      };
      for (const [key, name] of [['access', '접속'], ['session', '세션'], ['device', '기기']]) {
        const raw = event.state?.[key];
        const value = Object.hasOwn(stateLabels[key], raw) ? raw : 'unknown';
        add('p', `${name}: ${stateLabels[key][value]}(${value})`);
      }
      add('h4', '조치 제안');
      if (result.proposals.length === 0) {
        add('p', Array.isArray(event.supportedActions) && event.supportedActions.length === 0
          ? '원천에서 지원하는 조치가 없어 조치 제안이 없습니다.'
          : 'AI가 이 기록에 대한 조치를 제안하지 않았습니다. 근거를 확인하고 필요하면 담당자와 판단하세요.');
      } else {
        for (const proposal of result.proposals) {
          add('p', `조치: ${safeText(proposal.action)} · 이유: ${safeText(proposal.reason)}`);
          add('p', `제안 근거 ID: ${proposal.evidenceIds.map(safeText).join(', ')}`);
        }
      }
      add('p', '제안은 아직 실행되지 않았습니다. 실행 전 별도의 사람 확인이 필요합니다. 이 학생 표시 영역은 조치를 실행하지 않습니다.');
      return root;
    },
    renderAction({ status = 'idle', event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      const root = document.createElement('div');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.appendChild(node);
      };
      const safeText = value => {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '확인 불가';
        const text = String(value);
        const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\bsb_secret_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|api[_-]?key|token|secret)\s*[:=]\s*\S+/i;
        return secret.test(text) ? '민감정보 제외' : text || '확인 불가';
      };
      const show = (label, value) => {
        if (value !== undefined && value !== null && value !== '') add('p', `${label}: ${safeText(value)}`);
      };
      const states = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading). 실행 효과는 아직 확인되지 않았습니다.',
        prepared: '준비됨·미실행(prepared). 실제 대상과 조치를 확인한 뒤 별도의 사람 확인이 필요합니다.',
        executing: '서버에 전달 중(executing). 결과가 아직 확인되지 않았습니다.',
        pending: '서버 접수·처리 중(pending). 접수 응답(ACK)은 효과 확인이 아닙니다. 결과가 아직 확인되지 않았습니다.',
        succeeded: '효과 확인(succeeded)',
        denied: '거절(denied)',
        failed: '실패(failed)',
        unknown: '결과 불명(unknown). 성공 또는 효과 없음으로 판단할 수 없습니다. 제공 화면의 연동 시스템 결과만 재조회 버튼으로 결과만 다시 확인하세요.',
        expired: '확인 기한 지남(expired). 제공 화면에서 조치를 다시 준비하고 대상과 조치를 확인하세요.',
        error: '요청 처리 안 됨(error)',
      };
      const mismatched = (receipt?.eventId != null && event?.id != null && receipt.eventId !== event.id)
        || (receipt?.actionId != null && actionId != null && receipt.actionId !== actionId);
      const currentStatus = Object.hasOwn(states, status) && !mismatched
        && (status !== 'succeeded' || observation?.effectApplied === true) ? status : 'unknown';
      add('h3', '보안 조치 요청 상태');
      add('p', states[currentStatus]);
      if (mismatched) add('p', '접수증의 사건 또는 조치가 현재 선택과 일치하지 않아 결과를 확인할 수 없습니다.');
      if (status === 'succeeded' && currentStatus === 'unknown') add('p', '수신 상태는 succeeded이지만 현재 요청의 효과 적용을 확인하지 못했습니다.');
      if (event?.id != null) {
        show('사건 ID', event.id);
        if (!mismatched && safeText(event.id) === event.id) root.setAttribute('data-student-action-event', event.id);
      }
      if (Array.isArray(event?.evidence)) {
        for (const evidence of event.evidence) show('근거 ID', evidence.id);
      }
      show('조치 ID', actionId);
      show('실제 대상 ID', target?.id);
      show('대상 세대(generation)', target?.generation);
      show('요청 ID(requestId)', receipt?.requestId);
      show('접수증 ID(receiptId)', receipt?.receiptId);
      show('접수증 버전(version)', receipt?.version);
      show('접수증 상태', receipt?.status);
      show('중복 요청 재사용(replayed)', receipt?.replayed);
      if (!mismatched && event?.id != null && typeof receipt?.requestId === 'string'
          && receipt.requestId.length > 0 && safeText(receipt.requestId) === receipt.requestId) {
        root.setAttribute('data-student-action-request', receipt.requestId);
      }
      show('확인 기한', confirmationExpiresAt);
      if (currentStatus === 'succeeded') {
        add('p', 'effectApplied: true');
        add('p', `관측 시각: ${safeText(observation.observedAt)}`);
      }
      show('서버 안내', message);
      if (error) {
        show('오류 코드', error.code);
        show('오류 안내', error.message);
      }
      if (Array.isArray(event?.supportedActions) && event.supportedActions.length === 0) {
        add('p', '이 기록에는 연동 시스템이 지원하는 조치가 없어 조치 준비 버튼이 표시되지 않는 것이 정상입니다.');
      }
      add('p', 'AI 제안은 실행이 아닙니다. 준비 후 별도의 사람 확인을 거쳐야 서버에 전달됩니다. 이 학생 칸은 상태만 표시하며 요청이나 자동 재전송을 수행하지 않습니다.');
      add('p', '결과 조회와 취소는 제공 화면의 버튼을 사용하세요. 조치 화면 취소는 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.');
      return root;
    },
  };
}
