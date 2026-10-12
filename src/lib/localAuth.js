// المصادقة المحلية بنفس أسماء دوال firebase/auth المستخدمة في المشروع
import { api, onUnauthenticated } from './api'

export const auth = { currentUser: null }

const listeners = new Set()
const emit = user => {
  auth.currentUser = user
  listeners.forEach(fn => fn(user))
}

// عند انتهاء الجلسة على الخادم نعيد المستخدم لشاشة الدخول
onUnauthenticated(() => { if (auth.currentUser) emit(null) })

export function onAuthStateChanged(_auth, callback) {
  listeners.add(callback)
  api('GET', '/api/auth/me')
    .then(({ user }) => { auth.currentUser = user; callback(user) })
    .catch(() => callback(null))
  return () => listeners.delete(callback)
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const { user } = await api('POST', '/api/auth/login', { email, password })
  emit(user)
  return { user }
}

export async function signOut() {
  await api('POST', '/api/auth/logout').catch(() => {})
  emit(null)
}

// الجلسة تُدار بملف تعريف (cookie) على الخادم — لا حاجة لتجديد رمز
export async function getIdToken() {
  return 'session'
}

// إنشاء حساب دخول جديد دون تغيير المستخدم الحالي
export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { user } = await api('POST', '/api/auth/users', { email, password })
  return { user }
}

// المدير يعيّن كلمة مرور جديدة لمستخدم
export const setUserPassword = (uid, password) => api('POST', `/api/auth/users/${encodeURIComponent(uid)}/password`, { password })

// المستخدم يغيّر كلمة مروره
export const changeMyPassword = (currentPassword, newPassword) => api('POST', '/api/auth/password', { currentPassword, newPassword })
