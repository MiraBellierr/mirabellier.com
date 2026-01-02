import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navigation from "../parts/Navigation"
import Header from "../parts/Header"
import Footer from "../parts/Footer"
import Post from '../parts/Post'
import { API_BASE } from '@/lib/config'
import kannaHappy from '@/assets/anime/kanna-happy.webp'
import kannaSmile from '@/assets/anime/kanna-smile.webp'

type TextNode = {
  type: 'text'
  text: string
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
}

type ParagraphNode = {
  type: 'paragraph'
  attrs?: { textAlign: string | null }
  content: ContentNode[]
}

type HeadingNode = {
  type: 'heading'
  attrs?: { textAlign: string | null; level: number }
  content: ContentNode[]
}

type ListNode = {
  type: 'bulletList' | 'orderedList'
  content: ListItemNode[]
}

type ListItemNode = {
  type: 'listItem'
  content: ContentNode[]
}

type ImageNode = {
  type: 'image'
  attrs: {
    src: string
    alt: string
    title: string
    width: number | null
    height: number | null
  }
}

type HardBreakNode = {
  type: 'hardBreak'
}

type ContentNode =
  | TextNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | ImageNode
  | HardBreakNode

const resolveAsset = (val?: string | null) => {
  if (!val) return null
  if (val.startsWith('blob:')) return val
  if (/^https?:\/\//.test(val)) return val
  if (val.startsWith('/')) return `${API_BASE}${val}`
  if (val.includes('/')) return `${API_BASE}/${val}`
  return `${API_BASE}/images/${val}`
}

const BlogPost = () => {
  const { slug } = useParams()
  // slug format: title-slug-{id}
  const id = (() => {
    if (!slug) return undefined
    const parts = slug.split('-')
    return parts.length ? parts[parts.length - 1] : slug
  })()
  const [post, setPost] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Update canonical URL to point to the specific blog post
    if (slug) {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = `https://mirabellier.com/blog/${slug}`;
      }
    }

    return () => {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = 'https://mirabellier.com/';
      }
    };
  }, [slug]);

  useEffect(() => {
    // Add structured data for rich results when post is loaded
    if (post && slug) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'blogpost-structured-data';
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "url": `https://mirabellier.com/blog/${slug}`,
        "datePublished": post.createdAt,
        "author": {
          "@type": "Person",
          "name": post.author
        },
        "publisher": {
          "@type": "Person",
          "name": "Mirabellier"
        },
        "description": post.shortDescription || post.title
      });
      document.head.appendChild(script);

      return () => {
        const oldScript = document.getElementById('blogpost-structured-data');
        if (oldScript) oldScript.remove();
      };
    }
  }, [post, slug]);

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // fetch single post by id if available
        let found = null
        if (id) {
          const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(id)}`)
          if (res.ok) {
            found = await res.json()
          }
        }
        if (!found) {
          // fallback to fetching all posts if single fetch failed
          const resAll = await fetch(`${API_BASE}/posts`)
          if (!resAll.ok) throw new Error('Failed to fetch post')
          const data = await resAll.json()
          found = data.find((p: any) => String(p.id) === String(id))
        }
        if (!found) {
          setError('Post not found')
        } else {
          setPost(found)
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
            <div className="flex-grow flex-col space-y-4">
            <Navigation />
            <div className=" mt-3 mb-auto justify-center items-center flex">
              <img className="w-[350px] rounded-lg border border-blue-400" src={kannaHappy} width="350" height="350" alt="kanna gif" loading="eager" fetchPriority="high" />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-4 p-4">
            {loading ? (
              <div className="p-2 card-border text-center">
                <p>Loading post...</p>
              </div>
            ) : error ? (
              <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-xl">
                Error: {error}
              </div>
            ) : post ? (
              <>
                <div className="p-2 card-border">
                  <h2 className="text-xl font-bold text-blue-700 mb-2">{post.title}</h2>
                  <p className="text-sm text-blue-500 mb-2 flex items-center gap-2">
                    {(post as any).userId ? (
                      <Link to={`/profile/${post.author}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        {post.authorAvatar && (
                          <img src={resolveAsset(post.authorAvatar) || undefined} className="w-6 h-6 rounded-full" alt="author avatar" />
                        )}
                        <span>By {post.author}</span>
                      </Link>
                    ) : (
                      <>
                        {post.authorAvatar && (
                          <img src={resolveAsset(post.authorAvatar) || undefined} className="w-6 h-6 rounded-full" alt="author avatar" />
                        )}
                        <span>By {post.author}</span>
                      </>
                    )}
                    <span>• {new Date(post.createdAt).toLocaleDateString()}</span>
                  </p>

                  <div className="max-h-[500px] overflow-y-auto">
                    <Post html={post.content} />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1 p-2 card-border">
                <h2 className="text-xl font-bold text-blue-700 mb-2 text-center">Post not found</h2>
              </div>
            )}
          </main>

          <div className="flex-col">
            <div className="mt-3 mb-auto lg:w-[200px] space-y-4">
              <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                <div className="space-y-2 text-sm text-center font-bold">
                  <h2 className="text-blue-600 font-bold text-lg pb-2">Create 📒</h2>
                  <Link to="/blog/edit" aria-label="Create a new blog post">
                    <div className="border border-blue-300 rounded-2xl bg-blue-200 p-1 hover:bg-blue-300 hover:animate-wiggle">
                      Create new post
                    </div>
                  </Link>
                </div>
              </aside>
              <aside className="w-full lg:w-[200px] mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-md p-4 hidden lg:block">
                <h3 className="text-blue-700 font-bold text-lg text-center mb-2">Blog Tips</h3>
                <ul className="text-sm text-blue-600 space-y-2">
                  <li>• Use short, clear titles (≤60 chars).</li>
                  <li>• Split content into short paragraphs.</li>
                  <li>• Upload images to illustrate points.</li>
                  <li>• Preview posts before publishing.</li>
                </ul>
                <div className="mt-4 text-xs text-blue-400 text-center">Write kindly and credit sources 💖</div>
              </aside>
              <div className='flex justify-center'>
                <img className="border border-blue-400 rounded-lg" src={kannaSmile} width="498" height="498" alt="kanna gif" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default BlogPost
