// Only same-origin server requests. No provider key is delivered to the browser.
export async function authRequest(payload) {
  const response = await fetch('/api/auth', {
    method: 'POST', cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '로그인 요청에 실패했습니다.');
  return result.session;
}

export function createBrowserAuth() {
  const storageKey = 'vault-session-v5';
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  let generation = 0;
  let refreshing;
  const listeners = new Set();
  function save(value) {
    session = value;
    try {
      if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.removeItem(storageKey);
    } catch {}
    for (const listener of listeners) listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
  }
  async function getSession() {
    if (!session) return { data: { session: null }, error: null };
    if (session.expires_at * 1000 > Date.now() + 60000) return { data: { session }, error: null };
    if (!refreshing) {
      const version = generation;
      const refreshToken = session.refresh_token;
      refreshing = (async () => {
        try {
          const fresh = await authRequest({ action: 'refresh', refresh_token: refreshToken });
          if (generation === version) save(fresh);
          return { data: { session }, error: null };
        } catch (error) {
          if (generation === version) { ++generation; save(null); }
          return { data: { session: null }, error };
        } finally { refreshing = undefined; }
      })();
    }
    return refreshing;
  }
  return {
    getSession,
    onAuthStateChange(listener) {
      listeners.add(listener);
      // Preserve the initial login view after a page reload.
      queueMicrotask(async () => {
        const result = await getSession();
        listener('INITIAL_SESSION', result.data.session);
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signInWithPassword(credentials) {
      const version = ++generation;
      try {
        const fresh = await authRequest({ action: 'login', ...credentials });
        if (generation === version) save(fresh);
        return { error: null };
      } catch (error) { return { error }; }
    },
    async signOut() {
      const token = session?.access_token;
      ++generation;
      save(null);
      try {
        if (token) await authRequest({ action: 'logout', access_token: token });
        return { error: null };
      } catch (error) { return { error }; }
    }
  };
}
