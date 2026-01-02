import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/states/AuthContext'

const AuthCallback = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()

  useEffect(() => {
    // Update canonical URL to point to the AuthCallback page
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = 'https://mirabellier.com/auth/callback';
    }

    return () => {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = 'https://mirabellier.com/';
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')
    
    if (token) {
      auth.handleAuthCallback(token).then(() => {
        navigate('/')
      }).catch((err) => {
        console.error('Auth callback failed:', err)
        navigate('/login?error=callback_failed')
      })
    } else {
      navigate('/login?error=no_token')
    }
  }, [location, auth, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="text-center">
        <div className="text-4xl mb-4">🌸</div>
        <p className="text-blue-600">Completing Discord authentication...</p>
      </div>
    </div>
  )
}

export default AuthCallback
