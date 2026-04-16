import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail]   = useState('')
  const [pass,  setPass]    = useState('')
  const [err,   setErr]     = useState('')
  const [busy,  setBusy]    = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    if (!email || !pass) { setErr('يرجى إدخال البريد وكلمة المرور'); return }
    setBusy(true); setErr('')
    try {
      await login(email, pass)
    } catch (ex) {
      const code = ex.code
      setErr(
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found'     ||
        code === 'auth/wrong-password'
          ? '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة'
          : '❌ ' + ex.message
      )
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">🏥</div>
        <div className="login-title">نظام إدارة المراكز التأهيلية</div>
        <div className="login-sub">سجّل دخولك للمتابعة</div>

        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>البريد الإلكتروني</label>
            <input
              type="email" value={email} autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              disabled={busy}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>كلمة المرور</label>
            <input
              type="password" value={pass} autoComplete="current-password"
              onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              disabled={busy}
            />
          </div>

          {err && <div className="login-err">{err}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16, padding: 13, fontSize: 15 }}
            disabled={busy}
          >
            {busy ? '⏳ جاري تسجيل الدخول...' : '🚀 تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  )
}
