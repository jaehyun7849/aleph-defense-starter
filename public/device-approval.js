import { createDemoAccess } from '/demo-device-client.js';

// The existing vault now uses server-managed demo page approval.
// Installation and the request button never grant data access.
export function createDeviceApproval({ getSession, onAccessChange, status }) {
  const access = createDemoAccess({ getSession, onState: result => {
    status.textContent = result.message + (result.requestId ? ` · 요청 번호: ${result.requestId}` : '');
    if (result.state !== 'checking') onAccessChange(result.state === 'approved');
  } });
  return { ...access, invalidate(message) {
    access.reset();
    if (message) status.textContent = message;
  } };
}
