import { useState, useEffect } from 'react';
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/states/AuthContext'
import Post from '../parts/Post';
import { API_BASE } from '@/lib/config';

const resolveAsset = (val?: string | null) => {
    if (!val) return null
    if (val.startsWith('blob:')) return val
    if (/^https?:\/\//.test(val)) return val
    if (val.startsWith('/')) return `${API_BASE}${val}`
    if (val.includes('/')) return `${API_BASE}/${val}`
    return `${API_BASE}/images/${val}`
}

function slugify(input?: string) {
    if (!input) return ''
    return input
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
}

type TextNode = {
  type: 'text';
  text: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
};

type ParagraphNode = {
  type: 'paragraph';
  attrs?: { textAlign: string | null };
  content: ContentNode[];
};

type HeadingNode = {
  type: 'heading';
  attrs?: { textAlign: string | null; level: number };
  content: ContentNode[];
};

type ListNode = {
  type: 'bulletList' | 'orderedList';
  content: ListItemNode[];
};

type ListItemNode = {
  type: 'listItem';
  content: ContentNode[];
};

type ImageNode = {
  type: 'image';
  attrs: {
    src: string;
    alt: string;
    title: string;
    width: number | null;
    height: number | null;
  };
};

type HardBreakNode = {
  type: 'hardBreak';
};

type DocumentNode = {
  type: 'doc';
  content: ContentNode[];
};

type ContentNode = 
  | TextNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | ImageNode
  | HardBreakNode;
function extractTextFromContent(content: DocumentNode | ContentNode[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'object' && 'type' in content && content.type === 'doc') {
    return extractTextFromContent(content.content);
  }
  if (Array.isArray(content)) {
    let result = '';
    
    content.forEach(node => {
      if (!node) return;
      
      switch (node.type) {
        case 'text':
          result += node.text + ' ';
          break;
          
        case 'paragraph':
        case 'heading':
        case 'listItem':
          if (node.content) {
            result += extractTextFromContent(node.content);
          }
          break;
          
        case 'bulletList':
        case 'orderedList':
          if (node.content) {
            node.content.forEach(item => {
              result += extractTextFromContent(item.content);
            });
          }
          break;
          
        case 'image':
        case 'hardBreak':
          break;
          
        default:
          break;
      }
    });
    
    return result.trim();
  }
  
  return '';
}
type Post = {
    id: string | number;
    title: string;
    author: string;
    authorAvatar?: string | null;
    createdAt: string;
    content: ContentNode[];
    shortDescription?: string | null;
    thumbnail?: string | null;
};

const Blog = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const postsPerPage = 4;

    const location = useLocation();
    const navigate = useNavigate();
    const auth = useAuth();
    const [openMenuId, setOpenMenuId] = useState<string | number | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as Element | null;
            if (!target) return;
            if (target.closest('[data-post-menu]') || target.closest('[data-post-menu-button]')) return;
            setOpenMenuId(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenuId(null);
        };
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const toggleMenu = (id: string | number) => {
        setOpenMenuId(prev => (prev === id ? null : id));
    };

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const urlSearchTerm = searchParams.get('search') || '';
        setSearchTerm(urlSearchTerm);
    }, [location.search]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (searchTerm) {
            params.set('search', searchTerm);
        } else {
            params.delete('search');
        }
        navigate({ search: params.toString() }, { replace: true });
    }, [searchTerm, navigate]);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await fetch(`${API_BASE}/posts`);
                if (!response.ok) {
                    throw new Error('Failed to fetch posts');
                }
                const data = await response.json();
                setPosts(data);
                setFilteredPosts(data);
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('An unknown error occurred');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, []);

    const handleDelete = async (id: string | number) => {
        if (!confirm('Delete this post? This cannot be undone.')) return;

        try {
            const resp = await fetch(`${API_BASE}/posts/${id}`, {
                method: 'DELETE',
                headers: {
                    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
                },
            });

            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                alert(body.error || 'Failed to delete post');
                return;
            }

            setPosts(prev => prev.filter(p => p.id !== id));
            setFilteredPosts(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error('Delete post error', err);
            alert('Failed to delete post');
        }
    };

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredPosts(posts);
            setCurrentPage(1); 
        } else {
            const term = searchTerm.toLowerCase();
            const filtered = posts.filter(post => 
                post.title.toLowerCase().includes(term) || 
                post.author.toLowerCase().includes(term) ||
                extractTextFromContent(post.content).toLowerCase().includes(term)
            );
            setFilteredPosts(filtered);
            setCurrentPage(1); 
        }
    }, [searchTerm, posts]);
    const indexOfLastPost = currentPage * postsPerPage;
    const indexOfFirstPost = indexOfLastPost - postsPerPage;
    const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);
    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);

    const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

    return (
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col blog-page">
            <Header />
            
            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    <div className="flex-grow flex-col space-y-4">
                        <Navigation />
                        <div className="h-101 border rounded-lg p-4 bg-blue-100 border-blue-300 shadow-md opacity-90">
                            <h3 className="font-bold text-blue-600 mb-2">search posts here</h3>
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <p className="mt-2 text-sm text-blue-600">
                                    {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} found
                                </p>
                            )}
                        </div>
                        <div className='flex justify-center'>
                            <img className="w-[350px] rounded-lg border border-blue-400" src="https://media1.tenor.com/m/cJ-bh8QFs9kAAAAC/anime-kanna.gif" />
                        </div>
                        
                    </div>

                    <main className="w-full lg:w-3/5 space-y-4 p-4">
                        {loading ? (
                            <div className="p-2 card-border text-center">
                                <p>Loading posts...</p>
                            </div>
                        ) : error ? (
                            <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-xl">
                                Error: {error}
                            </div>
                        ) : filteredPosts.length === 0 ? (
                            <div className="space-y-1 p-2 card-border">
                                <h2 className="text-xl font-bold text-blue-700 mb-2 text-center">
                                    {searchTerm ? 'No matching posts found' : 'No posts yet'}
                                </h2>
                                <img src="https://media1.tenor.com/m/vk4u2ez6sHUAAAAd/kanna-eating.gif" alt="No posts" className="mx-auto" />
                            </div>
                        ) : (
                            <>
                                                                {currentPosts.map((post) => (
                                                                    <div key={post.id}>
                                                                        <div className="p-2 card-border flex gap-4 items-start">
                                                                            <Link to={`/blog/${slugify(post.title)}-${post.id}`} className="flex-1 flex gap-4 items-start no-underline">
                                                                                {post.thumbnail ? (
                                                                                    <img src={resolveAsset(post.thumbnail) ?? undefined} alt="thumbnail" className="w-28 h-20 object-cover rounded-md" />
                                                                                ) : (
                                                                                    <div className="w-28 h-20 bg-blue-50 rounded-md" />
                                                                                )}

                                                                                <div>
                                                                                    <h2 className="text-lg font-bold text-blue-700 mb-1">
                                                                                        {post.title}
                                                                                    </h2>
                                                                                    <p className="text-sm text-blue-500 mb-2">By {post.author} • {new Date(post.createdAt).toLocaleDateString()}</p>
                                                                                    {post.shortDescription ? (
                                                                                        <p className="text-sm text-blue-600">{post.shortDescription}</p>
                                                                                    ) : null}
                                                                                </div>
                                                                            </Link>

                                                                            {auth?.user?.id && String(auth.user.id) === String((post as any).userId) ? (
                                                                                <div className="relative ml-2">
                                                                                    <button
                                                                                        onClick={() => toggleMenu(post.id)}
                                                                                        className="p-1 rounded hover:bg-blue-100"
                                                                                        aria-haspopup="menu"
                                                                                        aria-expanded={openMenuId === post.id}
                                                                                        data-post-menu-button
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                                                                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                                                                                        </svg>
                                                                                    </button>

                                                                                    {openMenuId === post.id && (
                                                                                        <div data-post-menu className="absolute right-0 mt-2 w-36 bg-white border rounded shadow z-50 text-sm">
                                                                                            <Link to={`/blog/edit?id=${post.id}`} className="block px-3 py-2 hover:bg-blue-50">Edit</Link>
                                                                                            <button onClick={() => { setOpenMenuId(null); handleDelete(post.id); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700">Delete</button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                ))}

                                
                            </>
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
                <div className="flex flex-col flex-grow p-3 max-w-7xl mx-auto w-full justify-center">
                    {}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center mt-6 lg:mt-[-200px] space-x-2 opacity-90">
                            <button
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1}
                                className={`px-4 py-2 rounded-lg border ${currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-200 text-blue-700 hover:bg-blue-300'}`}
                            >
                                Previous
                            </button>
                            
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
                                <button
                                    key={number}
                                    onClick={() => paginate(number)}
                                    className={`px-4 py-2 rounded-lg border ${currentPage === number ? 'bg-blue-500 text-white' : 'bg-blue-200 text-blue-700 hover:bg-blue-300'}`}
                                >
                                    {number}
                                </button>
                            ))}
                            
                            <button
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className={`px-4 py-2 rounded-lg border ${currentPage === totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-200 text-blue-700 hover:bg-blue-300'}`}
                            >
                                Next
                            </button>
                        </div>
                    )}

                    <div className="text-center text-sm text-blue-600 mt-2 mb-4">
                        Showing posts {indexOfFirstPost + 1} to {Math.min(indexOfLastPost, filteredPosts.length)} of {filteredPosts.length}
                    </div>
                </div>
            </div>

                <Footer />            
        </div>
    )
}

export default Blog;