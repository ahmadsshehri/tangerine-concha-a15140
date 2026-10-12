import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken, auth } from '../lib/localAuth'
import { doc, getDoc, db } from '../lib/localDb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,              setUser]              = useState(null)
  const [role,              setRole]              = useState(null)
  const [name,              setName]              = useState(null)
  const [permissions,       setPermissions]       = useState({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [loading,           setLoading]           = useState(true)
  const refreshTimerRef = useRef(null)

  const fetchUserData = async (authUser, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await getIdToken(authUser, true)
        const snap = await getDoc(doc(db, 'users', authUser.uid))
        if (snap.exists()) return snap.data()
        return null
      } catch (err) {
        if (i < retries - 1 && err.code !== 'permission-denied') {
          await new Promise(res => setTimeout(res, 1000 * (i + 1)))
          continue
        }
        console.error('fetchUserData error:', err)
        return 'error'
      }
    }
    return 'error'
  }

  const scheduleTokenRefresh = (authUser) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    refreshTimerRef.current = setInterval(async () => {
      try {
        await getIdToken(authUser, true)
        const data = await fetchUserData(authUser, 1)
        if (data && data !== 'error') {
          setRole(data.role)
          setName(data.name)
          setPermissions(data.permissions || {})
          // لا نعيد permissionsLoaded لـ false هنا أبداً
        }
      } catch (err) {
        console.error('Token refresh failed:', err)
      }
    }, 55 * 60 * 1000)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        const data = await fetchUserData(authUser)

        if (data === null) {
          // المستخدم غير موجود في قاعدة البيانات
          if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
          setPermissionsLoaded(false)
          await signOut(auth)
        } else if (data === 'error') {
          // خطأ في الجلب — افتح الموقع بصلاحيات فارغة
          setUser(authUser)
          setPermissions({})
          setPermissionsLoaded(true)
          setLoading(false)
          scheduleTokenRefresh(authUser)
        } else {
          // نجاح — حدّث كل البيانات دفعة واحدة
          setUser(authUser)
          setRole(data.role)
          setName(data.name)
          setPermissions(data.permissions || {})
          setPermissionsLoaded(true)
          setLoading(false)
          scheduleTokenRefresh(authUser)
        }
      } else {
        // تسجيل خروج
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
        setUser(null)
        setRole(null)
        setName(null)
        setPermissions({})
        setPermissionsLoaded(false)
        setLoading(false)
      }
    })

    return () => {
      unsubscribe()
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [])

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const logout = () => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    return signOut(auth)
  }

  const isAdmin  = role === 'admin'
  const hasPerm  = (key) => isAdmin || permissions?.[key] === true
  const canWrite = isAdmin || permissions?.supervisor_entry || permissions?.caretaker_entry

  return (
    <AuthContext.Provider value={{
      user, role, name, permissions, permissionsLoaded,
      loading, login, logout, isAdmin, canWrite, hasPerm
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
