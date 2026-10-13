// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계: 엔진이 등록 상태를 확인한 기기의 자료실 요청만 허용합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { matchResourceRoute, canAccessResource } from './resource-policy.mjs';
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_scope']);

const REQUEST_FIELDS = new Set([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const unknown = value => value === undefined || value === null || value === 'unknown';

// Only the authenticated engine may invoke decide. A source label is not proof
// of provenance; judge_fixture describes simulated data, never live location.
export function inspectConnectionInput(request) {
  const invalid = () => { throw new TypeError('invalid_connection_input'); };
  if (!object(request) || Object.keys(request).some(key => !REQUEST_FIELDS.has(key))) invalid();
  const signals = request.signals;
  if (signals !== undefined && signals !== null && !object(signals)) invalid();
  if (signals && Object.keys(signals).some(key => !['source', 'region', 'network', 'hour'].includes(key))) invalid();
  const source = signals?.source;
  if (source !== undefined && source !== null && source !== 'none' && source !== 'judge_fixture') invalid();
  for (const field of ['region', 'network']) {
    if (!unknown(signals?.[field]) && !text(signals[field])) invalid();
  }
  const hour = signals?.hour;
  if (hour !== undefined && hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) invalid();
  // No source means there is no basis to accept supplied location/network/hour.
  if (source !== 'judge_fixture' && (!unknown(signals?.region)
      || !unknown(signals?.network))) invalid();

  const events = request.recentEvents;
  if (events !== undefined && events !== null) {
    if (!Array.isArray(events) || events.length > 12) invalid();
    for (const event of events) {
      if (!object(event) || Object.keys(event).sort().join(',') !== 'ageSeconds,count,kind'
          || !text(event.kind) || !Number.isSafeInteger(event.ageSeconds) || event.ageSeconds < 0
          || !Number.isSafeInteger(event.count) || event.count < 0) invalid();
    }
  }
  return {
    source: source ?? null,
    region: source === 'judge_fixture' && !unknown(signals.region) ? signals.region : null,
    network: source === 'judge_fixture' && !unknown(signals.network) ? signals.network : null,
    hour: source === 'judge_fixture' ? hour ?? null : null,
    recentEvents: events ?? null,
  };
}

export function createDecider({ resolveResource }) {
return async function decide(request) {
  const connection = inspectConnectionInput(request);
  const registered = request.deviceRegistered === true;
  const response = (decision, reasonCode, ruleIds) => ({
    schema: 'aleph.decision.v1', requestId: request.requestId, decision, reasonCode, ruleIds,
  });
  if (!registered) return response('deny', 'device_not_registered', ['device_registered']);
  const route = matchResourceRoute(request.path, request.method);
  if (request.service !== 'notes' || !route || request.route !== route.route || request.queryLength !== 0) {
    return response('deny', 'resource_not_allowed', ['device_registered', 'resource_scope']);
  }
  let context;
  try { context = await resolveResource(request, route); } catch { context = null; }
  if (!context || !canAccessResource({ ...context, method: request.method })) {
    return response('deny', 'resource_forbidden', ['device_registered', 'resource_scope']);
  }
  // These thresholds describe the supplied judge fixture, not a learned
  // location history. Region alone never triggers this rule.
  const unusualHour = connection.hour !== null
    && (connection.hour < 6 || connection.hour >= 22);
  const burstRead = connection.recentEvents?.some(event =>
    event.kind === 'risk_signal' && event.ageSeconds <= 60 && event.count >= 20) === true;
  const needsStepUp = request.service === 'notes' && request.method === 'GET'
    && connection.source === 'judge_fixture' && unusualHour
    && connection.network === 'unusual' && burstRead;
  const verified = object(request.stepUp) && request.stepUp.verified === true
    && Number.isSafeInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  if (registered && needsStepUp && !verified) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: ['device_registered', 'resource_scope', 'step_up_required'],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: registered && needsStepUp
      ? ['device_registered', 'resource_scope', 'step_up_required'] : ['device_registered', 'resource_scope'],
  };
};
}

let productionDecider;
export async function decide(request) {
  if (!productionDecider) {
    const { createClient } = await import('@supabase/supabase-js');
    const { createEngineResourceResolver } = await import('./engine-resource-context.mjs');
    productionDecider = createDecider({ resolveResource: createEngineResourceResolver({ createClient }) });
  }
  return productionDecider(request);
}
