import { useState, useEffect } from 'react';
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Divider from '../parts/Divider';
import Post from '../parts/Post';

import background from '../assets/background.jpeg';
import { API_BASE } from '@/lib/config';

const resolveAsset = (val?: string | null) => {
    if (!val) return null
    if (val.startsWith('blob:')) return val
    if (/^https?:\/\//.test(val)) return val
    if (val.startsWith('/')) return `${API_BASE}${val}`
    if (val.includes('/')) return `${API_BASE}/${val}`
    return `${API_BASE}/images/${val}`
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
};

const Blog = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const postsPerPage = 2;

    const location = useLocation();
    const navigate = useNavigate();

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
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />
            
            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: `url(${background})` }}>
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
                            <div className="p-2 border-[10px] [border-image:url('/border.png')_10_fill_round] text-center">
                                <p>Loading posts...</p>
                            </div>
                        ) : error ? (
                            <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-xl">
                                Error: {error}
                            </div>
                        ) : filteredPosts.length === 0 ? (
                            <div className="space-y-1 p-2 border-[10px] [border-image:url('/border.png')_10_fill_round]">
                                <h2 className="text-xl font-bold text-blue-700 mb-2 text-center">
                                    {searchTerm ? 'No matching posts found' : 'No posts yet'}
                                </h2>
                                <img src="https://media1.tenor.com/m/vk4u2ez6sHUAAAAd/kanna-eating.gif" alt="No posts" className="mx-auto" />
                            </div>
                        ) : (
                            <>
                                {currentPosts.map((post, index) => (
                                    <>
                                        <div key={post.id} className="p-2 border-[10px] [border-image:url('/border.png')_10_fill_round]">
                                            <h2 className="text-xl font-bold text-blue-700 mb-2">{post.title}</h2>
                                                                                        <p className="text-sm text-blue-500 mb-2 flex items-center gap-2">
                                                                                            {post.authorAvatar ? (
                                                                                                <img src={resolveAsset(post.authorAvatar) || undefined} className="w-6 h-6 rounded-full" alt="author avatar" />
                                                                                            ) : null}
                                                                                            <span>By {post.author} • {new Date(post.createdAt).toLocaleDateString()}</span>
                                                                                        </p>
                                             <div className="max-h-[500px] overflow-y-auto">
                                                <Post html={post.content} />
                                             </div>
                                        </div>
                                        
                                        {index < currentPosts.length - 1 && (
                                            <Divider />
                                        )}
                                    </>
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
                <div className="flex flex-col flex-grow p-4 max-w-7xl mx-auto w-full justify-center">
                    {}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center mt-6 space-x-2 opacity-90">
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