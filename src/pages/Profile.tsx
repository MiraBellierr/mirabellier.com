import { useEffect, useState } from 'react'
import { useAuth } from '@/states/AuthContext'
import { API_BASE } from '@/lib/config'
import Header from '../parts/Header'
import Footer from '../parts/Footer'
import Navigation from '../parts/Navigation'
import { Link, useParams } from 'react-router-dom'
import kobayashiMaidDragon from '@/assets/anime/kobayashi-maid-dragon.webp'

interface Stats {
  postsCount: number
  likesCount: number
  commentsCount: number
  recentPosts: Array<{ id: string; title: string; createdAt: string }>
}

interface UserData {
  id: string
  username: string
  avatar?: string | null
  banner?: string | null
  bio?: string | null
  location?: string | null
  website?: string | null
}

const Profile = () => {
  const auth = useAuth()
  const { username } = useParams<{ username: string }>()
  const [profileUser, setProfileUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Update canonical URL to point to the Profile page
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      if (username) {
        canonicalLink.href = `https://mirabellier.com/profile/${username}`;
      } else {
        canonicalLink.href = 'https://mirabellier.com/profile';
      }
    }

    return () => {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = 'https://mirabellier.com/';
      }
    };
  }, [username]);

  // Determine which user to display
  const user = username ? profileUser : auth.user
  const isOwnProfile = auth.user && user && auth.user.id === user.id

  useEffect(() => {
    setLoading(true)
    setError(null)

    if (username) {
      // Fetch user by username
      fetch(`${API_BASE}/user/by-username/${username}`)
        .then(res => {
          if (!res.ok) throw new Error('User not found')
          return res.json()
        })
        .then(userData => {
          setProfileUser(userData)
          // Fetch stats for this user
          return fetch(`${API_BASE}/user/${userData.id}/stats`)
        })
        .then(res => res.json())
        .then(data => {
          setStats(data)
          setLoading(false)
        })
        .catch(err => {
          console.error('Failed to fetch user:', err)
          setError(err.message || 'User not found')
          setLoading(false)
        })
    } else if (auth.user) {
      // Fetch stats for logged-in user
      fetch(`${API_BASE}/user/${auth.user.id}/stats`)
        .then(res => res.json())
        .then(data => {
          setStats(data)
          setLoading(false)
        })
        .catch(err => {
          console.error('Failed to fetch stats:', err)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [username, auth.user])

  const resolveAsset = (val?: string | null) => {
    if (!val) return null
    if (val.startsWith('blob:')) return val
    if (/^https?:\/\//.test(val)) return val
    if (val.startsWith('/')) return `${API_BASE}${val}`
    if (val.includes('/')) return `${API_BASE}/${val}`
    return `${API_BASE}/images/${val}`
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
        <Header />
        <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
          <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
            <div className="flex-grow flex-col">
              <Navigation />
            </div>
            <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
              <div className="card-border rounded-2xl p-8 text-center bg-white/90 dark:bg-purple-900/80">
                <div className="text-4xl mb-4">{error ? '🚫' : '🔒'}</div>
                <h2 className="text-2xl font-bold text-blue-700 dark:text-purple-200 mb-2">
                  {error || 'Profile Not Found'}
                </h2>
                <p className="text-blue-500 dark:text-purple-300 mb-4">
                  {username ? 'This user does not exist.' : 'Please log in to view your profile.'}
                </p>
                {!username && (
                  <Link to="/login" className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full hover:bg-pink-600 transition-colors">
                    Login
                  </Link>
                )}
              </div>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
        <Header />
        <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
          <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
            <div className="flex-grow flex-col">
              <Navigation />
            </div>
            <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
              <div className="card-border rounded-2xl p-8 text-center bg-white/90 dark:bg-purple-900/80">
                <div className="text-4xl mb-4">⏳</div>
                <p className="text-blue-500 dark:text-purple-300">Loading profile...</p>
              </div>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    )
  }


  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto justify-center items-center flex lg:w-[339px]">
              <img className="w-full border border-blue-700 shadow-md rounded-2xl" src={kobayashiMaidDragon} width="498" height="498" alt="anime gif" />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl">
              {/* Profile Card with Banner */}
              <div className="card-border rounded-2xl overflow-hidden bg-white/90 dark:bg-purple-900/80">
                {/* Banner */}
                <div className="relative h-48 bg-pink-200 dark:bg-purple-800">
                  {user.banner ? (
                    <img 
                      src={resolveAsset(user.banner) || undefined} 
                      alt="banner" 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <>
                      {/* Decorative elements */}
                      <div className="absolute top-4 right-4 text-4xl">✨</div>
                      <div className="absolute bottom-4 left-4 text-3xl">🌸</div>
                      <div className="absolute top-8 left-1/3 text-2xl">💫</div>
                    </>
                  )}
                </div>

                {/* Avatar - overlapping banner */}
                <div className="relative px-6 pb-6">
                  <div className="flex flex-col items-center -mt-16">
                    <div className="w-32 h-32 rounded-full bg-white dark:bg-gray-800 p-2 border-4 border-white dark:border-purple-700">
                      <div className="w-full h-full rounded-full bg-pink-100 dark:bg-purple-700 flex items-center justify-center overflow-hidden">
                        {user.avatar ? (
                          <img 
                            src={resolveAsset(user.avatar) || undefined} 
                            alt={user.username} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="text-5xl">😺</div>
                        )}
                      </div>
                    </div>

                    {/* Username */}
                    <h1 className="mt-4 text-3xl font-bold text-blue-700 dark:text-purple-200 text-center">
                      {user.username}
                    </h1>

                    {/* Bio/Status */}
                    {user.bio && (
                      <p className="mt-2 text-sm text-blue-500 dark:text-purple-300 text-center max-w-md">
                        {user.bio}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="mt-6 flex gap-8 justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-pink-500 dark:text-pink-400">{loading ? '...' : stats?.postsCount || 0}</div>
                        <div className="text-xs text-blue-600 dark:text-purple-300">Posts</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-500 dark:text-purple-400">{loading ? '...' : stats?.likesCount || 0}</div>
                        <div className="text-xs text-blue-600 dark:text-purple-300">Likes</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-500 dark:text-blue-400">{loading ? '...' : stats?.commentsCount || 0}</div>
                        <div className="text-xs text-blue-600 dark:text-purple-300">Comments</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex gap-3">
                      {isOwnProfile && (
                        <>
                          <Link 
                            to="/settings" 
                            className="inline-flex items-center gap-2 bg-pink-400 dark:bg-purple-600 text-white px-6 py-2 rounded-full hover:bg-pink-500 dark:hover:bg-purple-700 transition-colors font-medium"
                          >
                            <span>⚙️</span>
                            <span>Edit Profile</span>
                          </Link>
                          <button
                            onClick={() => {
                              const shareUrl = `${window.location.origin}/profile/${user.username}`;
                              if (navigator.share) {
                                navigator.share({
                                  title: `${user.username}'s Profile`,
                                  text: user.bio || `Check out ${user.username}'s profile`,
                                  url: shareUrl
                                }).catch(() => {});
                              } else {
                                navigator.clipboard.writeText(shareUrl);
                                alert('Profile link copied to clipboard!');
                              }
                            }}
                            className="inline-flex items-center gap-2 bg-blue-400 dark:bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-500 dark:hover:bg-blue-700 transition-colors font-medium"
                          >
                            <span>🔗</span>
                            <span>Share</span>
                          </button>
                        </>
                      )}
                      {!isOwnProfile && user && (
                        <button
                          onClick={() => {
                            const shareUrl = `${window.location.origin}/profile/${user.username}`;
                            if (navigator.share) {
                              navigator.share({
                                title: `${user.username}'s Profile`,
                                text: user.bio || `Check out ${user.username}'s profile`,
                                url: shareUrl
                              }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(shareUrl);
                              alert('Profile link copied to clipboard!');
                            }
                          }}
                          className="inline-flex items-center gap-2 bg-blue-400 dark:bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-500 dark:hover:bg-blue-700 transition-colors font-medium"
                        >
                          <span>🔗</span>
                          <span>Share Profile</span>
                        </button>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="w-full h-px bg-blue-200 dark:bg-purple-600 my-6"></div>

                    {/* Additional Info */}
                    <div className="w-full space-y-3 text-sm">
                      <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-purple-300">
                        <span>📅</span>
                        <span>Joined recently</span>
                      </div>
                      {user.location && (
                        <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-purple-300">
                          <span>{user.location}</span>
                        </div>
                      )}
                      {user.website && (
                        <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-purple-300">
                          <span>🔗</span>
                          <a href={user.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {user.website.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity Section */}
              <div className="mt-6 card-border rounded-2xl p-6 bg-white/90 dark:bg-purple-900/80">
                <h3 className="text-xl font-bold text-blue-700 dark:text-purple-200 mb-4 flex items-center gap-2">
                  <span>📝</span>
                  <span>Recent Posts</span>
                </h3>
                {loading ? (
                  <div className="text-center text-blue-500 dark:text-purple-300 py-8">
                    <div className="text-4xl mb-2">⏳</div>
                    <p>Loading...</p>
                  </div>
                ) : stats?.recentPosts && stats.recentPosts.length > 0 ? (
                  <div className="space-y-3">
                    {stats.recentPosts.map(post => (
                      <Link 
                        key={post.id} 
                        to={`/blog?search=${encodeURIComponent(post.title)}`}
                        className="block p-3 bg-blue-50 dark:bg-purple-800/50 rounded-lg hover:bg-blue-100 dark:hover:bg-purple-700/50 transition-colors"
                      >
                        <h4 className="font-medium text-blue-700 dark:text-purple-200">{post.title}</h4>
                        <p className="text-xs text-blue-500 dark:text-purple-400 mt-1">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-blue-500 dark:text-purple-300 py-8">
                    <div className="text-4xl mb-2">🌟</div>
                    <p>No posts yet. Start creating!</p>
                  </div>
                )}
              </div>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-50 dark:bg-purple-950/30 border border-blue-200 dark:border-purple-500/30 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 dark:text-purple-200 font-bold text-lg text-center mb-2">Profile Info</h3>
            <ul className="text-sm text-blue-600 dark:text-purple-300 space-y-2">
              <li>• This is your public profile page</li>
              <li>• Others can view your posts and activity here</li>
              <li>• Edit your profile in Settings</li>
              <li>• Customize your avatar and bio</li>
            </ul>
            <div className="mt-4 text-xs text-blue-400 dark:text-purple-400 text-center">Be awesome! 💖</div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Profile