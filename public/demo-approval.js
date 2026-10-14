import { createBrowserAuth } from '/auth-client.js';
import { createDemoAccess } from '/demo-device-client.js';

const auth = createBrowserAuth();
const node = id => document.getElementById(id);
let account, view = 0;
function closeData() { ++view; node('demo-data').hidden = true; node('demo-notes').replaceChildren(); }
const access = createDemoAccess({ getSession: () => auth.getSession(), onState: result => {
  node('demo-state').textContent = result.message;
  node('demo-request-id').textContent = result.requestId ? `요청 번호: ${result.requestId}` : '';
  if (result.state !== 'approved') closeData();
} });
auth.onAuthStateChange((_event, session) => {
  if (account !== session?.user.id) { access.reset(); closeData(); node('demo-requests').replaceChildren(); node('demo-request-id').textContent = ''; }
  account = session?.user.id;
  node('demo-login').hidden = Boolean(account);
  for (const id of ['demo-logout', 'demo-controls', 'demo-admin']) node(id).hidden = !account;
  node('login-status').textContent = account ? '로그인했습니다.' : '로그인 후 데모를 시작하세요.';
});
window.addEventListener('offline', () => { access.reset(); closeData(); node('demo-state').textContent = '오프라인: 다시 접속하고 승인 요청을 확인하세요.'; });
node('demo-login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const { error } = await auth.signInWithPassword({ email: node('demo-email').value.trim(), password: node('demo-password').value });
    if (error) throw error;
    node('demo-password').value = ''; node('demo-message').textContent = '';
  } catch (error) { node('demo-message').textContent = error.message; }
  finally { button.disabled = false; }
});
node('demo-logout').addEventListener('click', async () => {
  access.reset(); closeData(); await auth.signOut();
});
async function openData(action) {
  node('demo-request').disabled = node('demo-refresh').disabled = true;
  try {
    if (!await access[action]()) return;
    const version = ++view;
    const result = await access.call('/api/demo-notes');
    if (version !== view || !account || !Array.isArray(result.notes)) return;
    node('demo-notes').replaceChildren(...result.notes.map(note => {
      const item = document.createElement('li'); const title = document.createElement('strong');
      const body = document.createElement('p'); title.textContent = note.title; body.textContent = note.body;
      item.append(title, body); return item;
    }));
    node('demo-data').hidden = false;
  } catch (error) { closeData(); node('demo-message').textContent = error.message; }
  finally { node('demo-request').disabled = node('demo-refresh').disabled = false; }
}
node('demo-request').addEventListener('click', () => openData('requestApproval'));
node('demo-refresh').addEventListener('click', () => openData('check'));
async function listRequests() {
  node('demo-admin-list').disabled = true;
  try {
    const result = await access.call('/api/demo-device', 'POST', { action: 'list' });
    node('demo-requests').replaceChildren();
    if (!result.requests.length) { node('demo-message').textContent = '처리할 데모 요청이 없습니다.'; return; }
    for (const request of result.requests) {
      const item = document.createElement('li');
      const label = document.createElement('p'); label.textContent = `${request.requestId} · ${request.state === 'pending' ? '대기' : '승인됨'}`;
      item.append(label);
      for (const action of request.state === 'pending' ? ['approve', 'revoke'] : ['revoke']) {
        const button = document.createElement('button'); button.textContent = action === 'approve' ? '관리자 승인' : '승인 취소';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await access.call('/api/demo-device', 'POST', { action, requestId: request.requestId }); await listRequests(); }
          catch (error) { node('demo-message').textContent = error.message; button.disabled = false; }
        });
        item.append(button);
      }
      node('demo-requests').append(item);
    }
    node('demo-message').textContent = '서버의 데모 승인 목록을 확인했습니다.';
  } catch (error) { node('demo-requests').replaceChildren(); node('demo-message').textContent = error.message; }
  finally { node('demo-admin-list').disabled = false; }
}
node('demo-admin-list').addEventListener('click', listRequests);
