import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/states/AuthContext'
import Header from '../parts/Header'
import Footer from '../parts/Footer'
import Navigation from '../parts/Navigation'
import background from '../assets/background.jpeg'

const Register = () => {
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
      await auth.register(username, password)
      navigate('/')
    } catch (err) {
        console.error(err)
        setError('Register failed — try a different username')
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
                <img className="w-full border border-blue-700 shadow-md rounded-2xl" src="https://media1.tenor.com/m/CpMB2qh6yPMAAAAC/anime-kanna.gif" />
              </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-md backdrop-blur-sm border-[10px] [border-image:url('/border.png')_10_fill_round] rounded-2xl p-6 shadow-lg">
              <div className="text-center">
                <div className="text-4xl">✨</div>
                <h2 className="text-2xl font-bold text-blue-700 mt-2">Create your account</h2>
                <p className="text-sm text-blue-500">Join the cute community 💖</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-blue-600">Username</label>
                <input
                  placeholder="choose a username"
                  value={username}
                  onChange={e=>setUsername(e.target.value)}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200"
                />

                <label className="block text-sm font-medium text-blue-600">Password</label>
                <input
                  placeholder="create a password"
                  type="password"
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-200"
                />

                {error && <div className="text-red-600 text-sm">{error}</div>}

                <div className="flex items-center justify-between">
                  <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition">
                    {isSubmitting ? 'Creating...' : 'Create account'}
                  </button>
                  <Link to="/login" className="text-sm text-blue-600 hover:underline">Already have an account?</Link>
                </div>
              </form>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 font-bold text-lg text-center mb-2">Register Tips</h3>
            <ul className="text-sm text-blue-600 space-y-2">
              <li>• Pick a memorable, unique username (no spaces).</li>
              <li>• Use a strong password: 8+ chars with numbers/symbols.</li>
              <li>• You can update your avatar in <strong>Profile</strong> after signing up.</li>
              <li>• Keep your token safe — this site uses simple tokens.</li>
            </ul>
            <div className="mt-4 text-xs text-blue-400 text-center">Welcome — be adorable and safe 💖</div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Register
