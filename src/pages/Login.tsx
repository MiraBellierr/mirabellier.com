import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/states/AuthContext'
import Header from '../parts/Header'
import Footer from '../parts/Footer'
import Navigation from '../parts/Navigation'
import background from '../assets/background.jpeg'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const auth = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await auth.login(username, password)
      navigate('/')
    } catch (error) {
      console.error(error)
      setError('Login failed — check your credentials')
    } finally {
      setIsSubmitting(false)
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
              <img className="w-full border border-blue-700 shadow-md rounded-2xl" src="https://media1.tenor.com/m/jfQ2ctn0IQMAAAAC/kanna-kamui.gif" />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-md backdrop-blur-sm border-[10px] [border-image:url('/border.png')_10_fill_round] rounded-2xl p-6 shadow-lg">
              <div className="text-center">
                <div className="text-4xl">🌸</div>
                <h2 className="text-2xl font-bold text-blue-700 mt-2">Welcome back!</h2>
                <p className="text-sm text-blue-500">Login to access your cute profile</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-blue-600">Username</label>
                <input
                  placeholder="your username"
                  value={username}
                  onChange={e=>setUsername(e.target.value)}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200"
                />

                <label className="block text-sm font-medium text-blue-600">Password</label>
                <input
                  placeholder="password"
                  type="password"
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200"
                />

                {error && <div className="text-red-600 text-sm">{error}</div>}

                <div className="flex items-center justify-between">
                  <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition">
                    {isSubmitting ? 'Signing in...' : 'Sign in'}
                  </button>
                  <Link to="/register" className="text-sm text-blue-600 hover:underline">Don't have an account?</Link>
                </div>
              </form>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 font-bold text-lg text-center mb-2">Login Tips</h3>
            <ul className="text-sm text-blue-600 space-y-2">
              <li>• Use a unique username (no spaces).</li>
              <li>• Passwords should be 8+ characters.</li>
              <li>• To change avatar go to <strong>Profile</strong> after login.</li>
              <li>• If you forget password, re-register with a new username.</li>
            </ul>
            <div className="mt-4 text-xs text-blue-400 text-center">Be kind — this site is cute 💖</div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Login
