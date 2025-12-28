import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet'
import Navigation from "../parts/Navigation"
import Header from "../parts/Header"
import Footer from "../parts/Footer"
import Post from '../parts/Post'
import { API_BASE } from '@/lib/config'

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

type DocumentNode = {
  type: 'doc'
  content: ContentNode[]
}

type ContentNode =
  | TextNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | ImageNode
  | HardBreakNode

function extractTextFromContent(content: DocumentNode | ContentNode[] | undefined): string {
  if (!content) return ''
  if (typeof content === 'object' && 'type' in content && content.type === 'doc') {
    return extractTextFromContent(content.content)
  }
  if (Array.isArray(content)) {
    let result = ''

    content.forEach(node => {
      if (!node) return

      switch (node.type) {
        case 'text':
          result += (node as TextNode).text + ' '
          break

        case 'paragraph':
        case 'heading':
        case 'listItem':
          if ((node as any).content) {
            result += extractTextFromContent((node as any).content)
          }
          break

        case 'bulletList':
        case 'orderedList':
          if ((node as any).content) {
            ;(node as ListNode).content.forEach(item => {
              result += extractTextFromContent(item.content)
            })
          }
          break

        case 'image':
        case 'hardBreak':
          break

        default:
          break
      }
    })

    return result.trim()
  }

  return ''
}

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

  const metaDescription = post ? extractTextFromContent(post.content).slice(0, 160) : ''

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col space-y-4">
            <Navigation />
            <div className=" mt-3 mb-auto justify-center items-center flex">
              <img className="w-[350px] rounded-lg border border-blue-400" src="https://media1.tenor.com/m/cJ-bh8QFs9kAAAAC/anime-kanna.gif" />
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
                <Helmet>
                  <title>{post.title} — Mirabellier</title>
                  <meta name="description" content={metaDescription} />
                  <meta property="og:title" content={post.title} />
                  <meta property="og:description" content={metaDescription} />
                </Helmet>

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
                  <Link to="/blog/edit">
                    <div className="border border-blue-300 rounded-2xl bg-blue-200 p-1 hover:bg-blue-300 hover:animate-wiggle">
                      Click here
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
                <img className="border border-blue-400 rounded-lg" src='https://media1.tenor.com/m/JhZvuXpFmvIAAAAd/kobayashi-kanna.gif' />
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
