import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,             setUser]             = useState(null)
  const [role,             setRole]             = useState(null)
  const [name,             setName]             = useState(null)
  const [permissions,      setPermissions]      = useState({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [loading,          setLoading]          = useState(true)
  const refreshTimerRef = useRef(null)

  // ── جلب بيانات المستخدم من Firestore مع إعادة المحاولة
  const fetchUserData = async (firebaseUser, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await getIdToken(firebaseUser, true)
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
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

  // ── جدولة تجديد تلقائي للـ token كل 55 دقيقة
  const scheduleTokenRefresh = (firebaseUser) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    refreshTimerRef.current = setInterval(async () => {
      try {
        await getIdToken(firebaseUser, true)
        const data = await fetchUserData(firebaseUser, 1)
        if (data && data !== 'error') {
          setRole(data.role)
          setName(data.name)
          setPermissions(data.permissions || {})
        }
      } catch (err) {
        console.error('Token refresh failed:', err)
      }
    }, 55 * 60 * 1000)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // أعد تعيين permissionsLoaded عند كل login جديد
        setPermissionsLoaded(false)

        const data = await fetchUserData(firebaseUser)

        if (data === null) {
          if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
          await signOut(auth)
        } else if (data === 'error') {
          setUser(firebaseUser)
          setPermissionsLoaded(true) // حتى في حالة الخطأ نفتح الموقع
          setLoading(false)
          scheduleTokenRefresh(firebaseUser)
        } else {
          setUser(firebaseUser)
          setRole(data.role)
          setName(data.name)
          setPermissions(data.permissions || {})
          setPermissionsLoaded(true)
          setLoading(false)
          scheduleTokenRefresh(firebaseUser)
        }
      } else {
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
