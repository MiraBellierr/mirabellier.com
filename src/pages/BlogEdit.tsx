import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Toast from "../parts/Toast";

import React, { useEffect, useState } from 'react';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor'
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE } from '@/lib/config';
// tags use neutral theme-aware styling now
import { useAuth } from '@/states/AuthContext'
import missKobayashi from '@/assets/anime/miss-kobayashi.webp'




const BlogEdit = () => {
    const auth = useAuth()
    const [title, setTitle] = useState('');
    const [content, setContent] = useState<object | null>(null);
    const [shortDescription, setShortDescription] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const MAX_TAGS = 5;
    const [highlighted, setHighlighted] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [, setSubmitSuccess] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [isLoadingPost, setIsLoadingPost] = useState(false);
    const [postId, setPostId] = useState<string | null>(null);

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Update canonical URL to point to the BlogEdit page
        const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (canonicalLink) {
            canonicalLink.href = 'https://mirabellier.com/blog/edit';
        }

        // Add structured data for rich results
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'blogedit-structured-data';
        script.text = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Create/Edit Blog Post",
            "description": "Create or edit a blog post",
            "url": "https://mirabellier.com/blog/edit"
        });
        document.head.appendChild(script);

        return () => {
            const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
            if (canonicalLink) {
                canonicalLink.href = 'https://mirabellier.com/';
            }
            const oldScript = document.getElementById('blogedit-structured-data');
            if (oldScript) oldScript.remove();
        };
    }, []);

    useEffect(() => {
        if (!auth?.token) {
            navigate('/login')
        }
    }, [auth, navigate])

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const id = params.get('id');
        if (!id) {
            setIsLoadingPost(false);
            return;
        }

        setPostId(id);
        setIsLoadingPost(true);

        const load = async () => {
            try {
                console.log('Loading post with id:', id, 'from:', `${API_BASE}/posts/${id}`);
                const res = await fetch(`${API_BASE}/posts/${id}`);
                console.log('Response status:', res.status);
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('Failed to load post. Status:', res.status, 'Response:', errorText);
                    throw new Error('Failed to load post');
                }
                const data = await res.json();
                console.log('Loaded post data:', data);

                // If the post has an owner, ensure current user is the owner
                if (data.userId && auth?.user) {
                    const currentUserId = auth?.user?.id;
                    if (!currentUserId || String(currentUserId) !== String(data.userId)) {
                        setToastMessage('❌ You are not allowed to edit this post');
                        setShowToast(true);
                        setTimeout(() => {
                            setShowToast(false);
                            setToastMessage('');
                            navigate('/blog');
                        }, 2000);
                        return;
                    }
                }

                setTitle(data.title || '');
                setContent(data.content || {});
                setShortDescription(data.shortDescription || '');
                setThumbnail(data.thumbnail || '');
                const loadedTags = Array.isArray(data.tags) ? data.tags : (data.tags ? (typeof data.tags === 'string' ? JSON.parse(data.tags) : []) : []);
                const normalized = Array.isArray(loadedTags)
                    ? loadedTags.map((t: any) => String(t || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10)).filter(Boolean).slice(0, MAX_TAGS)
                    : [];
                setTags(normalized);
            } catch (err) {
                console.error('Failed to load post for edit', err);
                setToastMessage('❌ Failed to load post');
                setShowToast(true);
            } finally {
                setIsLoadingPost(false);
            }
        };

        load();
    }, [location.search, auth?.user]);

    useEffect(() => {
        // fetch existing tags from posts to use as suggestions
        const loadSuggestions = async () => {
            try {
                const res = await fetch(`${API_BASE}/tags`);
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data)) setSuggestions(data.filter(Boolean).slice(0, 100));
            } catch {
                // ignore
            }
        };
        loadSuggestions();
    }, []);

    const addTag = (t: string) => {
        const raw = String(t || '').trim();
        if (!raw) return;
        // disallow spaces and special characters
        if (/[^A-Za-z0-9_-]/.test(raw)) {
            setToastMessage('Tags can only contain letters, numbers, hyphens and underscores');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2000);
            return;
        }
        const val = raw.slice(0, 10);
        if (tags.includes(val)) return;
        if (tags.length >= MAX_TAGS) {
            setToastMessage(`You can add up to ${MAX_TAGS} tags`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2000);
            return;
        }
        setTags(prev => [...prev, val]);
        setTagInput('');
    };

    const removeTag = (t: string) => {
        setTags(prev => prev.filter(x => x !== t));
    };

    const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const filtered = suggestions.filter(s => s.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(s)).slice(0,10);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted(prev => {
                if (prev === null) return filtered.length ? 0 : null;
                return Math.min(filtered.length - 1, prev + 1);
            });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted(prev => {
                if (prev === null) return filtered.length ? filtered.length - 1 : null;
                return Math.max(0, prev - 1);
            });
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted !== null) {
                const filteredItem = filtered[highlighted];
                if (filteredItem) addTag(filteredItem);
                setHighlighted(null);
                return;
            }
            if (tagInput.trim()) addTag(tagInput.trim());
            return;
        }
        if (e.key === ',') {
            e.preventDefault();
            if (tagInput.trim()) addTag(tagInput.trim());
            return;
        }
        if (e.key === 'Escape') {
            setTagInput('');
            setHighlighted(null);
        }
    };


    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setIsSubmitting(true);
        
        try {
            const blogData: Record<string, unknown> = {
                title,
                content: content,
                shortDescription: shortDescription || undefined,
                thumbnail: thumbnail || undefined,
            };
            if (tags && tags.length) blogData.tags = tags.slice(0, MAX_TAGS).map(t => String(t).trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10));
            if (auth?.user?.id) blogData.userId = auth.user.id

            const method = postId ? 'PUT' : 'POST';
            const url = postId ? `${API_BASE}/posts/${postId}` : `${API_BASE}/posts`;

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
                },
                body: JSON.stringify(blogData),
            });

            if (!response.ok) throw new Error('Failed to save post');

            setSubmitSuccess(true);
            setTimeout(() => setSubmitSuccess(false), 3000);
            
            setTitle('');
            setContent(null);
            setShortDescription('');
            setThumbnail('');
            setTags([]);

            setToastMessage("🎉 Post published successfully!");
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
                setToastMessage("");
                navigate("/blog");
            }, 3000);
        } catch (error) {
            setToastMessage("❌ Failed to publish post");
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
                setToastMessage("");
            }, 3000);
            console.error('Error saving blog post:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />

            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    <div className="flex-grow flex-col space-y-4">
                        <Navigation />
                        <div className=" mt-3 mb-auto justify-center items-center flex">
                            <img className="border-border-blue-300 rounded-lg shadow" src={missKobayashi} width="498" height="280" alt="anime gif" />
                        </div>
                    </div>

                    <main className="w-full lg:w-3/5 space-y-2 p-4 relative">
                        <h2 className="font-bold text-2xl text-blue-600">{postId ? 'Edit Post' : 'Create a new Post'}</h2>
                        
                        {isLoadingPost && (
                            <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
                                <div className="text-center space-y-3">
                                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                                    <p className="text-xl font-bold text-blue-600">Loading post content...</p>
                                    <p className="text-sm text-gray-600">Please wait while we fetch your post</p>
                                </div>
                            </div>
                        )}
                        
                        <form id="blog-form" onSubmit={handleSubmit}>      
                                            {}

                            <div className="flex flex-col p-2 space-y-2">
                                <label className="font-bold text-blue-600" htmlFor="title">Title</label>
                                <input
                                    type="text"
                                    id="title"
                                    name="title"
                                    value={title}
                                    disabled={isLoadingPost}
                                    onChange={handleTitleChange}
                                    placeholder="Enter the title of the post"
                                    className="form-input border rounded-lg border-blue-300 p-2 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:placeholder-gray-400"
                                    required
                                />
                            </div>

                                <div className="flex flex-col p-2 space-y-2">
                                    <label className="font-bold text-blue-600" htmlFor="shortDescription">Short description</label>
                                    <input
                                        type="text"
                                        id="shortDescription"
                                        name="shortDescription"
                                        value={shortDescription}
                                        disabled={isLoadingPost}
                                        onChange={(e) => setShortDescription(e.target.value)}
                                        placeholder="Brief summary (for listings, ~160 chars)"
                                        className="form-input border rounded-lg border-blue-300 p-2 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:placeholder-gray-400"
                                    />
                                </div>

                                <div className="flex flex-col p-2 space-y-2">
                                    <label className="font-bold text-blue-600" htmlFor="thumbnail">Thumbnail URL</label>
                                    <input
                                        type="text"
                                        id="thumbnail"
                                        name="thumbnail"
                                        value={thumbnail}
                                        disabled={isLoadingPost}
                                        onChange={(e) => setThumbnail(e.target.value)}
                                        placeholder="Optional thumbnail image URL"
                                        className="form-input border rounded-lg border-blue-300 p-2 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:placeholder-gray-400"
                                    />
                                </div>

                                    <div className="flex flex-col p-2 space-y-2">
                                        <label className="font-bold text-blue-600" htmlFor="tags">Tags</label>

                                        <div className="flex flex-wrap gap-2">
                                            {tags.map(t => {
                                                const lower = String(t || '').toLowerCase();
                                                const isRainbow = ['cat', 'cats', 'kitten', 'kittens'].includes(lower);
                                                const rainbowStyle: Record<string, string> | undefined = isRainbow
                                                    ? { background: 'linear-gradient(90deg, #ff4d4d, #ffb84d, #fff14d, #4dff88, #4da6ff, #b84dff)', color: '#ffffff', border: 'none', backgroundSize: '300% 100%' }
                                                    : undefined;
                                                const themeDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                                                const baseClass = `inline-flex items-center gap-2 text-xs px-2 py-1 rounded-md font-medium border transform transition duration-150 ease-in-out hover:shadow-sm hover:scale-105 ${themeDark ? 'bg-gray-800 text-white border-gray-700' : 'bg-gray-200 text-gray-800 border-gray-300'}`;
                                                const rainbowClass = isRainbow ? 'rainbow-tag' : '';
                                                return (
                                                    <span key={t} className={`${baseClass} ${rainbowClass}`} style={rainbowStyle}>
                                                        <span>{t}</span>
                                                        <button type="button" onClick={() => removeTag(t)} className="opacity-80 hover:opacity-100">✕</button>
                                                    </span>
                                                )
                                            })}
                                        </div>

                                        <input
                                            type="text"
                                            id="tags"
                                            name="tags"
                                            value={tagInput}
                                            disabled={isLoadingPost}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={onTagKeyDown}
                                            placeholder="Add a tag and press Enter or comma (e.g. cats)"
                                            className="form-input border rounded-lg border-blue-300 p-2 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:placeholder-gray-400"
                                        />

                                        {tagInput && (
                                            <div className="mt-1 bg-white border rounded shadow-sm max-h-40 overflow-auto z-40 dark:bg-gray-800 dark:border-gray-600">
                                                {suggestions.filter(s => s.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(s)).slice(0,10).map((s, idx) => (
                                                    <div key={s}
                                                         className={`px-2 py-1 cursor-pointer dark:text-white ${highlighted === idx ? 'bg-blue-100 dark:bg-gray-700' : 'hover:bg-blue-50 dark:hover:bg-gray-700'}`}
                                                         onMouseEnter={() => setHighlighted(idx)}
                                                         onClick={() => { addTag(s); setHighlighted(null); }}
                                                    >
                                                        {s}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                            <div className="flex flex-col p-2 space-y-2">
                                <div className="block 2xl:block">
                                    <label className="font-bold text-blue-600" htmlFor="content">Content</label>
                                    {isLoadingPost ? (
                                        <div className="border rounded-lg border-blue-300 p-4 text-center text-blue-600">
                                            Loading post content...
                                        </div>
                                    ) : (
                                        <SimpleEditor key={postId || 'new'} onContentChange={setContent} initialContent={content} />
                                    )}
                                </div>
                                                  
                            </div>
                            
                            <div className="flex p-2">
                                <button 
                                    type="submit"
                                    disabled={isSubmitting || isLoadingPost}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg hover:animate-wiggle disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoadingPost ? "Loading..." : isSubmitting ? "Publishing..." : "Publish Post"}
                                </button>
                            </div>
                        </form>
                    </main>

                    <div className="flex-col">

                        <div className="mt-3 mb-auto lg:w-[200px]">
                        </div>
                    </div>
                </div>
            </div>

            {showToast && (
            <Toast message={toastMessage} onClose={() => {
                setShowToast(false);
                setToastMessage("");
                navigate("/blog");
            }} />
            )}
            
            <Footer />
        </div>
        
        {/* Sticky publish button - outside main container for proper fixed positioning */}
        <button
            type="submit"
            form="blog-form"
            disabled={isSubmitting || isLoadingPost}
            aria-label="Publish Post"
            className={`fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-2xl transition-all duration-200 hover:scale-110 hover:shadow-blue-500/50 ${isSubmitting || isLoadingPost ? 'opacity-70 cursor-not-allowed scale-95' : ''}`}
            style={{ transform: 'translateZ(0)' }}
        >
            {isLoadingPost ? '⏳ Loading...' : isSubmitting ? '📤 Publishing...' : '✨ Publish'}
        </button>
        </>
    )
}

export default BlogEdit;