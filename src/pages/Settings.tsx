import React, { useEffect, useState } from 'react'
import { useAuth } from '@/states/AuthContext'
import { API_BASE } from '@/lib/config'
import Header from '../parts/Header'
import Footer from '../parts/Footer'
import Navigation from '../parts/Navigation'


const Settings = () => {
  const auth = useAuth()
  const user = auth.user
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(user?.avatar || null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(user?.banner || null)
  const [bio, setBio] = useState(user?.bio || '')
  const [location, setLocation] = useState(user?.location || '')
  const [website, setWebsite] = useState(user?.website || '')
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (avatarFile) {
      const url = URL.createObjectURL(avatarFile)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [avatarFile])

  useEffect(() => {
    if (bannerFile) {
      const url = URL.createObjectURL(bannerFile)
      setBannerPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [bannerFile])

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
    
    if (password && password !== confirmPassword) {
      setMessage('Passwords do not match')
      setIsSaving(false)
      return
    }
    
    try {
      const fd = new FormData()
      fd.append('username', username)
      if (password) fd.append('password', password)
      if (avatarFile) fd.append('avatar', avatarFile)
      if (bannerFile) fd.append('banner', bannerFile)
      fd.append('bio', bio)
      fd.append('location', location)
      fd.append('website', website)
      const updated = await auth.updateProfile(fd)
      setMessage('Settings updated')
      setPreview(updated.avatar || preview)
      setBannerPreview(updated.banner || bannerPreview)
      setBio(updated.bio || '')
      setLocation(updated.location || '')
      setWebsite(updated.website || '')
      setPassword('')
      setConfirmPassword('')
      setAvatarFile(null)
      setBannerFile(null)
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

      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col">
            <Navigation />

            <div className=" mt-3 mb-auto justify-center items-center flex lg:w-[339px]">
              <img className="w-full border border-blue-700 shadow-md rounded-2xl" src="https://media1.tenor.com/m/lSmr5M7po7QAAAAC/kanna-kamui-kanna-police.gif" />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-lg backdrop-blur-sm card-border rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden border border-blue-200">
                  {preview ? (
                    <img src={resolveAsset(preview) || undefined} alt="avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-3xl">😺</div>
                  )}
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-blue-700">Account Settings</h2>
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

                {password && (
                  <div>
                    <label className="block text-sm font-medium text-blue-600">Confirm New Password</label>
                    <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-blue-600">Avatar</label>
                  <input type="file" accept="image/*" onChange={e=>setAvatarFile(e.target.files?.[0]||null)} className="mt-2" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">Banner</label>
                  <input type="file" accept="image/*" onChange={e=>setBannerFile(e.target.files?.[0]||null)} className="mt-2" />
                  {bannerPreview && (
                    <div className="mt-2 h-24 rounded-lg overflow-hidden border border-blue-200">
                      <img src={resolveAsset(bannerPreview) || undefined} alt="banner preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">Bio</label>
                  <textarea 
                    value={bio} 
                    onChange={e=>setBio(e.target.value)} 
                    placeholder="Tell us about yourself..."
                    rows={3}
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">Short Tagline</label>
                  <input 
                    value={location} 
                    onChange={e=>setLocation(e.target.value)} 
                    placeholder="A short description or tagline..."
                    maxLength={60}
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600">Website</label>
                  <input 
                    value={website} 
                    onChange={e=>setWebsite(e.target.value)} 
                    placeholder="https://yourwebsite.com"
                    type="url"
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200" 
                  />
                </div>

                {message && <div className="text-green-600">{message}</div>}

                <div className="flex items-center justify-between">
                  <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition">
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                  <button type="button" onClick={() => { setUsername(user?.username||''); setPassword(''); setConfirmPassword(''); setAvatarFile(null); setBannerFile(null); setPreview(user?.avatar||null); setBannerPreview(user?.banner||null); setBio(user?.bio||''); setLocation(user?.location||''); setWebsite(user?.website||''); }} className="text-sm text-blue-600 hover:underline">Reset</button>
                </div>
              </form>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 font-bold text-lg text-center mb-2">Settings Tips</h3>
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

export default Settings
