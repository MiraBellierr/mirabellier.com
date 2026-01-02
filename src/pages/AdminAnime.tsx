import { useEffect, useState } from 'react'
import { useAuth } from '@/states/AuthContext'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '@/lib/config'
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import kannaKobayashi from '@/assets/anime/kanna-kobayashi.webp'

type Anime = { id: string; title: string; url: string; img: string; bg?: string }

const AdminAnime = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState<Anime[]>([])
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [img, setImg] = useState('')

  useEffect(() => {
    // Update canonical URL to point to the AdminAnime page
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = 'https://mirabellier.com/admin/anime';
    }

    return () => {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = 'https://mirabellier.com/';
      }
    };
  }, []);

  useEffect(() => {
    if (!auth?.user || (auth.user as any).discordId !== '548050617889980426') {
      return
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/anime`)
        if (res.ok) {
          const data = await res.json()
          setList(data)
          return
        }
      } catch (err) {
        console.error('AdminAnime load error', err)
      }
    }

    load()
  }, [auth])

  if (!auth?.user) return <div className="p-6">Please login to access this page.</div>
  if ((auth.user as any).discordId !== '548050617889980426') return <div className="p-6">Not authorized.</div>

  const save = async (next: Anime[]) => {
    try {
      if (!auth?.token) {
        console.error('No auth token available for saving anime')
        return
      }

      const res = await fetch(`${API_BASE}/anime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(next),
      })

      if (!res.ok) {
        console.error('Failed to persist anime to server', await res.text())
        return
      }

      setList(next)
    } catch (err) {
      console.error('Failed to persist anime to server', err)
    }
  }

  const add = () => {
    if (!title) return
    const item: Anime = { id: Date.now().toString(), title, url, img }
    save([item, ...list])
    setTitle(''); setUrl(''); setImg('')
  }

  const remove = async (id: string) => {
    try {
      if (!auth?.token) {
        console.error('No auth token available for deleting anime')
        return
      }

      const res = await fetch(`${API_BASE}/anime/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      })

      if (!res.ok) {
        console.error('Failed to delete on server', await res.text())
        return
      }

      const next = list.filter((i) => i.id !== id)
      setList(next)
    } catch (err) {
      console.error('Failed to delete on server', err)
    }
  }

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col">
            <Navigation />

            <div className=" mt-3 mb-auto justify-center items-center flex">
              <img className="h-101 border border-blue-700 shadow-md rounded-2xl" src={kannaKobayashi} width="300" height="404" alt="anime gif"/>
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <div className="space-y-1 p-2 card-border bg-white/80 rounded-lg">
              <h2 className="text-xl font-bold text-blue-700 mb-2">✨ Anime List Editor ✨</h2>
              <p className="text-sm text-blue-500">Add or remove entries from the anime sidebar. Changes persist to the server.</p>

              <div className="mt-4 space-y-3">
                <input placeholder="Title (required)" value={title} onChange={e=>setTitle(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <input placeholder="Link URL" value={url} onChange={e=>setUrl(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <input placeholder="Image URL" value={img} onChange={e=>setImg(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <div className="flex gap-3">
                  <button onClick={add} className="px-4 py-2 bg-pink-500 text-white rounded-full shadow">Add</button>
                  <button onClick={() => { save([]) }} className="px-4 py-2 border border-blue-200 rounded-full bg-white">Clear</button>
                  <button onClick={() => navigate('/')} className="px-4 py-2 border border-blue-200 rounded-full bg-white">Back</button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {list.length === 0 && (
                <div className="text-center text-sm text-blue-500">No items yet — add one to get started</div>
              )}

              {list.map((item, idx) => (
                <div key={item.id} className="p-2 card-border rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.img ? <img src={item.img} className="w-12 h-12 rounded object-cover" width="48" height="48" alt={item.title} /> : <div className="w-12 h-12 rounded bg-blue-50"/>}
                    <div>
                      <div className="font-bold text-blue-700">{idx + 1}. {item.title}</div>
                      <a href={item.url} className="text-sm text-blue-600" target="_blank" rel="noreferrer">{item.url}</a>
                    </div>
                  </div>
                  <div>
                    <button onClick={() => remove(item.id)} className="px-3 py-1 rounded-full bg-red-500 text-white">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
            <div className="space-y-2 text-sm">
              <h2 className="text-blue-600 font-bold text-lg text-center">anime updatess!!</h2>
              <p>updates of my currently watching anime displayed here</p>
              <div className="flex flex-col mt-3">
                <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2">
                  {list.map((a, idx) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                      <div className="hover:animate-zoom-out-once card-border rounded-lg p-2 mb-4">
                        <h3 className="font-bold text-blue-700">{idx + 1}. {a.title}</h3>
                        {a.img && <img className="rounded w-full object-cover" src={a.img} alt={a.title} />}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default AdminAnime
