// اتصال الواجهة بخادم الشبكة الداخلية
const unauthListeners = new Set()
export const onUnauthenticated = fn => { unauthListeners.add(fn); return () => unauthListeners.delete(fn) }

export async function api(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw Object.assign(new Error('تعذّر الاتصال بالخادم — تأكد من اتصالك بالشبكة الداخلية'), { code: 'unavailable' })
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = Object.assign(new Error(json.error?.message || `خطأ ${res.status}`), { code: json.error?.code, status: res.status })
    if (res.status === 401 && json.error?.code === 'unauthenticated') unauthListeners.forEach(fn => fn())
    throw err
  }
  return json
}
