import React, { useEffect, useState } from 'react'
import { useAuth } from '@/states/AuthContext'
import { API_BASE } from '@/lib/config'
import Header from '../parts/Header'
import Footer from '../parts/Footer'
import Navigation from '../parts/Navigation'
import background from '../assets/background.jpeg'

const Profile = () => {
  const auth = useAuth()
  const user = auth.user
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(user?.avatar || null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (avatarFile) {
      const url = URL.createObjectURL(avatarFile)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [avatarFile])

  const resolveAsset = (val?: string | null) => {
    if (!val) return null
    if (val.startsWith('blob:')) return val
    if (/^https?:\/\//.test(val)) return val
    if (val.startsWith('/')) return `${API_BASE}${val}`
    if (val.includes('/')) return `${API_BASE}/${val}`
    return `${API_BASE}/images/${val}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('username', username)
      if (password) fd.append('password', password)
      if (avatarFile) fd.append('avatar', avatarFile)
      const updated = await auth.updateProfile(fd)
      setMessage('Profile updated')
      setPreview(updated.avatar || preview)
      setPassword('')
      setAvatarFile(null)
    } catch (error) {
      console.error(error)
      setMessage('Update failed')
    } finally {
      setIsSaving(false)
    }
  }


  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: `url(${background})` }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col">
            <Navigation />

            <div className=" mt-3 mb-auto justify-center items-center flex lg:w-[339px]">
              <img className="w-full border border-blue-700 shadow-md rounded-2xl" src="https://media1.tenor.com/m/lSmr5M7po7QAAAAC/kanna-kamui-kanna-police.gif" />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-lg backdrop-blur-sm border-[10px] [border-image:url('/border.png')_10_fill_round] rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden border border-blue-200">
                  {preview ? (
                    <img src={resolveAsset(preview) || undefined} alt="avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-3xl">😺</div>
                  )}
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-blue-700">{user?.username || 'Your profile'}</h2>
                  <p className="text-sm text-blue-500">Change your avatar, username, or password</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-600">Username</label>
                  <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">New Password <span className="text-xs text-blue-400">(leave blank to keep)</span></label>
                  <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">Avatar</label>
                  <input type="file" accept="image/*" onChange={e=>setAvatarFile(e.target.files?.[0]||null)} className="mt-2" />
                </div>

                {message && <div className="text-green-600">{message}</div>}

                <div className="flex items-center justify-between">
                  <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition">
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                  <button type="button" onClick={() => { setUsername(user?.username||''); setPassword(''); setAvatarFile(null); setPreview(user?.avatar||null); }} className="text-sm text-blue-600 hover:underline">Reset</button>
                </div>
              </form>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 font-bold text-lg text-center mb-2">Profile Tips</h3>
            <ul className="text-sm text-blue-600 space-y-2">
              <li>• Update your avatar to personalize your profile.</li>
              <li>• Your username must be unique; changing to an existing username will fail.</li>
              <li>• Password changes apply immediately — keep it safe.</li>
              <li>• Posts you create will show your current username and avatar.</li>
            </ul>
            <div className="mt-4 text-xs text-blue-400 text-center">Be kind — share smiles 💖</div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Profile
