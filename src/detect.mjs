const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

// Only the verified engine supplies identity.sub. This projection is not authentication.
// Optional fields below belong to the documented local compound-event extension.
// Do not copy the original event, identity, headers, tokens or note contents.
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const invalid = () => { throw new TypeError('invalid_detection_events'); };
  const result = [];
  for (const event of events) {
    if (!object(event)) invalid();
    const { at, method, identity } = event;
    if (typeof at !== 'string' || !utcTime.test(at) || !methods.has(method)
        || !object(identity)) invalid();
    const timestamp = Date.parse(at);
    if (!Number.isFinite(timestamp)
        || new Date(timestamp).toISOString().slice(0, 19) !== at.slice(0, 19)) invalid();
    const sub = identity.sub;
    if (typeof sub !== 'string' || sub.length < 1 || sub.length > 200
        || sub !== sub.trim() || /[\u0000-\u001f\u007f]/.test(sub)) invalid();
    const clean = { at, method, identity: Object.freeze({ sub }) };
    const signals = event.signals;
    if (signals !== undefined && signals !== null) {
      if (!object(signals)) invalid();
      const { source, network } = signals;
      if (source !== undefined && source !== null && !['none', 'judge_fixture'].includes(source)) invalid();
      if (source === 'judge_fixture') {
        if (network !== undefined && network !== null && !['usual', 'unusual', 'unknown'].includes(network)) invalid();
        clean.signals = Object.freeze({ source, network: network ?? null });
      }
    }
    // Read device metadata only for the explicit local extension. Legacy events
    // and unrelated extra fields remain untouched and cannot become trusted.
    if (clean.signals) {
      if (event.deviceRegistered === true) {
        const id = event.deviceId;
        if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) invalid();
        clean.deviceId = id;
        clean.deviceRegistered = true;
      }
    }
    result.push(Object.freeze(clean));
  }
  return Object.freeze(result);
}

// A proposal is separate from decide() and never executes revocation.
export function detect(events) {
  const groups = new Map();
  for (const event of readDetectionEvents(events)) {
    if (event.method !== 'GET' || event.deviceRegistered !== true) continue;
    const key = JSON.stringify([event.identity.sub, event.deviceId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  for (const reads of groups.values()) {
    reads.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let left = 0, unusual = 0;
    for (let right = 0; right < reads.length; right++) {
      if (reads[right].signals?.network === 'unusual') unusual++;
      while (Date.parse(reads[right].at) - Date.parse(reads[left].at) > 600000) {
        if (reads[left].signals?.network === 'unusual') unusual--;
        left++;
      }
      if (right - left + 1 > 120 && unusual > 0) return {
        action: 'propose_revocation', reasonCode: 'burst_read',
        subject: reads[right].identity.sub, deviceId: reads[right].deviceId,
      };
    }
  }
  return { action: 'observe' };
}
