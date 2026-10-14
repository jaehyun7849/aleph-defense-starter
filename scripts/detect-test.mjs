import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const subject = 'learner_fixture';

const deviceId = 'aaaaaaaaaaaaaaaa';
function reads(count, { intervalSeconds = 2, owner = subject, start = START,
  network = 'usual', device = deviceId } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    method: 'GET', identity: { sub: owner },
    signals: { source: 'judge_fixture', network }, deviceId: device, deviceRegistered: true,
  }));
}

const cases = [
  { name: '정상 조회 30건', events: reads(30), expected: { action: 'observe' } },
  { name: '낯선 네트워크만으로 회수 제안 없음', events: reads(30, { network: 'unusual' }), expected: { action: 'observe' } },
  { name: '평소 네트워크의 대량 조회는 유지', events: reads(200), expected: { action: 'observe' } },
  { name: '낯선 네트워크라도 120건은 유지', events: reads(120, { network: 'unusual' }), expected: { action: 'observe' } },
  { name: '복합 의심 121건 → 확인된 기기 한 개 회수 제안', events: reads(121, { network: 'unusual' }), expected: {
    action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId } },
  { name: '복합 의심 200건 → 대상·이유 포함', events: reads(200, { network: 'unusual' }), expected: {
    action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId } },
  { name: '서로 다른 사용자 각 100건', events: [...reads(100, { network: 'unusual' }),
    ...reads(100, { owner: 'other_fixture', network: 'unusual' })].sort((a, b) => a.at.localeCompare(b.at)),
  expected: { action: 'observe' } },
  { name: '10분 밖으로 흩어진 조회 200건', events: reads(200,
    { intervalSeconds: 7, network: 'unusual' }), expected: { action: 'observe' } },
  { name: '지역만 다른 사건은 유지', events: reads(200).map(e => ({...e, signals: {...e.signals, region: 'foreign'}})), expected: { action: 'observe' } },
  { name: '등록 확인 없는 기기는 회수 제안 없음', events: reads(200, { network: 'unusual' }).map(e => ({...e, deviceRegistered: false})), expected: { action: 'observe' } },
  { name: '기기별 100건은 합산하지 않음', events: [...reads(100, { network: 'unusual' }),
    ...reads(100, { network: 'unusual', device: 'bbbbbbbbbbbbbbbb' })], expected: { action: 'observe' } },
  { name: '제공 v1 폭주 200건 → 계약의 회수 제안', events: reads(200).map(({at,method,identity}) => ({at,method,identity})), expected: {
    action: 'propose_revocation', reasonCode: 'burst_read', subject } },
];

// Original provided v1 checks alongside the separate local extension checks.
const legacy = options => reads(options.count, options).map(({at, method, identity}) => ({at, method, identity}));
cases.push(
  { name: '제공 v1 정상 30건', events: legacy({count:30}), expected: {action:'observe'} },
  { name: '제공 v1 경계 120건', events: legacy({count:120}), expected: {action:'observe'} },
  { name: '제공 v1 121건 → 계약의 회수 제안', events: legacy({count:121}), expected: {
    action:'propose_revocation', reasonCode:'burst_read', subject } },
  { name: '제공 v1 다른 사용자 각 100건은 유지', events: [...legacy({count:100}),
    ...legacy({count:100,owner:'other_fixture'})], expected: {action:'observe'} },
  { name: '제공 v1 10분 밖으로 분산된 200건은 유지', events: legacy({count:200,intervalSeconds:7}), expected: {action:'observe'} },
  { name: '제공 v1 조회 이외 요청은 집계하지 않음', events: legacy({count:200}).map(e=>({...e,method:'PUT'})), expected: {action:'observe'} },
);

// This is a practice contract, not a live engine assertion or judge score.
export async function checkDetection(detect) {
  if (typeof detect !== 'function') throw new TypeError('src/detect.mjs에서 detect 함수를 내보내야 합니다.');
  const results = [];
  for (const item of cases) {
    const actual = await detect(item.events);
    const passed = isDeepStrictEqual(actual, item.expected);
    results.push({ name: item.name, passed: Boolean(passed) });
  }
  return results;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const { detect } = await import('../src/detect.mjs');
    const results = await checkDetection(detect);
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('제공 v1 계약과 로컬 확장을 별도로 시험했습니다. 실제 회수·시간·심판 통과는 미확인입니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`탐지 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
