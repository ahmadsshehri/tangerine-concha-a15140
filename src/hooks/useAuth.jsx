import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [role,        setRole]        = useState(null)
  const [name,        setName]        = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (snap.exists()) {
            const d = snap.data()
            setUser(firebaseUser)
            setRole(d.role)
            setName(d.name)
            setPermissions(d.permissions || {})
          } else {
            await signOut(auth)
          }
        } catch {
          await signOut(auth)
        }
      } else {
        setUser(null); setRole(null); setName(null); setPermissions({})
      }
      setLoading(false)
    })
  }, [])

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const logout = () => signOut(auth)

  const isAdmin = role === 'admin'
  // المدير له كل الصلاحيات تلقائياً
  const hasPerm = (key) => isAdmin || permissions?.[key] === true
  const canWrite = isAdmin || permissions?.supervisor_entry || permissions?.caretaker_entry

  return (
    <AuthContext.Provider value={{ user, role, name, permissions, loading, login, logout, isAdmin, canWrite, hasPerm }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
