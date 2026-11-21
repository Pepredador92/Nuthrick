const key = 'nuthrick:private-login-return';

export function privateReturnPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/app(?:[/?#]|$)/.test(value) && !/[\\\u0000-\u0020]/.test(value) ? value : null;
}

export function rememberPrivateReturn(value: unknown) {
  try {
    const path = privateReturnPath(value);
    if (path) sessionStorage.setItem(key, path);
    else sessionStorage.removeItem(key);
  } catch { /* OAuth can still sign in when temporary storage is unavailable. */ }
}

export function takePrivateReturn() {
  try {
    const path = privateReturnPath(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    return path;
  } catch {
    return null;
  }
}
