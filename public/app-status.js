// Display hints only. Installation and connectivity never approve a device.
const connection = document.querySelector('#connection-status');
function updateConnection() {
  connection.textContent = navigator.onLine === false
    ? '오프라인 · 연결을 복구한 뒤 자료 요청을 다시 시도해 주세요.'
    : '온라인으로 표시됩니다. 자료 요청 성공 여부는 서버 응답으로 확인합니다.';
}
updateConnection();
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch(() => {
      document.querySelector('#offline-capability').textContent =
        '오프라인 안내를 준비하지 못했습니다. 연결된 상태에서 다시 열어 주세요.';
    });
}
