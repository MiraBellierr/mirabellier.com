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
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
            <div className="flex-col space-y-4 lg:sticky lg:top-4 lg:self-start lg:w-[250px]">
            < Navigation />
            <div className=" mt-3 mb-auto justify-center items-center flex">
              <img className="w-full rounded-lg border border-blue-400" src={kannaHappy} width="350" height="350" alt="kanna gif" loading="eager" fetchPriority="high" />
            </div>
          </div>

          <main className="w-full lg:flex-1 space-y-4 p-4">
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

                  <div>
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


        </div>
      </div>
      <Footer />
    </div>
  )
}

export default BlogPost
