import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";

import { useEffect, useState } from 'react'
import { useOptionalAuth } from '@/hooks/use-optional-auth'

import { Link } from 'react-router-dom'
import { API_BASE } from '@/lib/config'
import kannaKobayashi from '@/assets/anime/kanna-kobayashi.webp'

type AnimeItem = { id: string; title: string; url: string; img: string }
const STORAGE_KEY = 'miraiscute-anime-list'

const defaultAnime: AnimeItem[] = [
  { id: '1', title: 'The Fragrant Flower Blooms with Dignity', url: 'https://myanimelist.net/anime/59845/Kaoru_Hana_wa_Rin_to_Saku', img: 'https://i.pinimg.com/736x/a2/f6/94/a2f694c10cc0294b62d136e1c54a7731.jpg' },
  { id: '2', title: 'Dan Da Dan Season 2', url: 'https://myanimelist.net/anime/60543/Dandadan_2nd_Season', img: 'https://i.pinimg.com/736x/23/e7/f5/23e7f559ae81d246abb9ba9e456f9075.jpg' },
  { id: '3', title: 'One Piece', url: 'https://myanimelist.net/anime/21/One_Piece', img: 'https://i.pinimg.com/736x/eb/ad/26/ebad2683b9ce3d2eb0fdd23f4e3f8eda.jpg' },
]

const Home = () => {
  const auth = useOptionalAuth()
  const [animeList, setAnimeList] = useState<AnimeItem[]>(defaultAnime) // Start with default data
  const [showAllAnime, setShowAllAnime] = useState(false)
  const ANIME_PREVIEW_LIMIT = 10;

  useEffect(() => {
    // Update canonical URL to point to homepage
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = 'https://mirabellier.com/';
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/anime`)
        if (res.ok) {
          const data = await res.json()
          setAnimeList(data)
          return
        }
      } catch (err) {
        console.error('Failed fetching anime from server', err)
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) setAnimeList(JSON.parse(raw))
      } catch {
        // Already using defaultAnime as initial state
      }
    }

    // Defer anime fetch until browser is idle to avoid blocking critical path
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => load(), { timeout: 2000 })
    } else {
      setTimeout(load, 100)
    }
  }, [])

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
      
      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          
          <div className="flex-grow flex-col">
            <Navigation />

            <div className=" mt-3 mb-auto justify-center items-center flex">
              <img className="h-101 border border-blue-700 shadow-md rounded-2xl" src={kannaKobayashi} width="300" height="404" alt="anime gif" loading="eager" fetchPriority="high" />
            </div>
          </div>
    

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            
            <div className="space-y-1 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">🌸 About Me 🌸</h2>
              <p>Hiya!! I'm Mirabellier! 💙</p>
              <p>I'm just a <span className="font-bold text-blue-600">chill internet spirit</span> who loves <span className="underline font-bold text-blue-600">cute</span> things, and making friends!</p>
              <p>I also enjoy programming, watching anime and cuddling with my cat. (I love cats!! 😸)</p>
              <div className="mt-2 text-sm text-blue-500">
                <p>If you see this, you're cute!!</p>
              </div>
              <div className="mt-2 border-t border-blue-200 pt-2 text-[14px]">
                  <p className='pr-2'>channeling my phychic power. ⚡</p>
              </div>
            </div>

            <Divider />   

            <div className="space-y-1 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">🧠 Random Facts!</h2>
              <p className="">• My favorite color is <span className="font-bold text-blue-300">pastel blue</span> 💙</p>
              <p className="">• I love collecting plushies and stickers</p>
              <p className="">• Sometimes I stay up too late making silly stuff like this</p>
              <p className="">• I think you're awesome just for being here ^-^</p>
            </div>

            <Divider />

            <div className="space-y-1 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">💬 What You’ll Find Here</h2>
              <p className="">This site is just my little corner of the web where I share my thoughts, memories, and maybe some projects I’m working on!
                I might add more pages soon, like:</p>
              <p className="">• ✏️ My blog</p>
              <p className="">• 🎨 Art or doodles</p>
              <p className="">• 🎥 Short videos</p>
              <p className="">• 💾 Programming experiments</p>
            </div>

          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
            <div className="space-y-2 text-sm">
              <h2 className="text-blue-600 font-bold text-lg text-center">anime updatess!!</h2>
              <p>updates of my currently watching anime displayed here</p>
              <div className="flex flex-col mt-3">
                <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2">
                  {(showAllAnime ? animeList : animeList.slice(0, ANIME_PREVIEW_LIMIT)).map((a, idx) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                      <div className="hover:animate-zoom-out-once card-border rounded-lg p-2 mb-4">
                        <h3 className="font-bold text-blue-700">{idx + 1}. {a.title}</h3>
                        {a.img && <img className="rounded w-full object-cover" src={a.img} alt={a.title} loading={idx < 3 ? "eager" : "lazy"} />}
                      </div>
                    </a>
                  ))}
                </div>
                {animeList.length > ANIME_PREVIEW_LIMIT && (
                  <button 
                    onClick={() => setShowAllAnime(!showAllAnime)}
                    className="mt-2 text-sm text-blue-600 underline hover:text-blue-700"
                  >
                    {showAllAnime ? 'Show less' : `Show all ${animeList.length} anime`}
                  </button>
                )}
                {auth && auth.user && (auth.user as any).discordId === '548050617889980426' && (
                  <div className="mt-2 text-center">
                    <Link to="/admin/anime" className="text-sm text-pink-500 underline">Edit anime list</Link>
                  </div>
                )}
              </div>
            </div>
          </aside>

        </div>
      </div>

        <Footer />

    </div>
  );
}

export default Home;