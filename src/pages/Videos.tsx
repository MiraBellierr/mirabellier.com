import { useEffect, useState, useRef } from "react";
import { useAuth } from '@/states/AuthContext';
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import { Link, useLocation, useNavigate } from "react-router-dom";


import { API_BASE } from '@/lib/config';


interface Video {
    id: string;
    name: string;
    url: string;
    createdAt: string;
    description?: string;
    likes?: number;
    comments?: string[];
    userId?: string;
    author?: string;
    authorAvatar?: string | null;
}

const Videos = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(true);
    const [likesMap, setLikesMap] = useState<Record<string, { count: number; liked: boolean }>>({});
    const [commentsMap, setCommentsMap] = useState<Record<string, string[]>>({});
    const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
    const [newComment, setNewComment] = useState('');
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
    const [replyTo, setReplyTo] = useState<string | null>(null);
    const commentInputRef = useRef<HTMLInputElement | null>(null);
    const { token, user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [, setIsMobile] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const prevBodyOverflow = useRef<string | null>(null);
    const [Icons, setIcons] = useState<any>(null);
    const [isMuted, setIsMuted] = useState(true);
    const resolveAsset = (asset?: string | null) => {
        if (!asset) return `${API_BASE}/images/default-avatar.png`;
        if (/^https?:\/\//.test(asset)) return asset;
        if (asset.startsWith('/')) return `${API_BASE}${asset}`;
        if (asset.includes('/')) return `${API_BASE}/${asset}`;
        return `${API_BASE}/images/${asset}`;
    }
    const [userCache, setUserCache] = useState<Record<string, any>>({});
    useEffect(() => {
        let mounted = true;
        const cur = filteredVideos[currentVideoIndex];
        if (!cur || !cur.userId) return;
        if (userCache[cur.userId]) return;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/user/${cur.userId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!mounted) return;
            setUserCache(prev => ({ ...prev, [(cur.userId as string)]: data }));
            } catch (error) {
                console.error(error)
            }
        })();
        return () => { mounted = false }
    }, [currentVideoIndex, filteredVideos, userCache]);
    const fetchAndCacheUser = async (id?: string | null) => {
        if (!id) return null;
        if (userCache[id]) return userCache[id];
        try {
            const res = await fetch(`${API_BASE}/user/${id}`);
            if (!res.ok) return null;
            const data = await res.json();
            setUserCache(prev => ({ ...prev, [id]: data }));
            return data;
        } catch (error) {
            console.error(error)
            return null;
        }
    }
    

    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const urlSearchQuery = searchParams.get('search') || '';
        setSearchQuery(urlSearchQuery);
    }, [location.search]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery) {
            params.set('search', searchQuery);
        } else {
            params.delete('search');
        }
        navigate({ search: params.toString() }, { replace: true });
    }, [searchQuery, navigate]);

    useEffect(() => {
        let isMounted = true;
        
        async function fetchVideos() {
            try {
                const res = await fetch(`${API_BASE}/videos`);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                if (isMounted) {
                    setVideos(data);
                    setFilteredVideos(data);
                    setVideoError(null);
                    setLikesMap(() => {
                        const initial: Record<string, { count: number; liked: boolean }> = {};
                        data.forEach((v: any) => {
                            if (Array.isArray(v.likes)) {
                                initial[v.id] = { count: v.likes.length, liked: user ? v.likes.includes(user.id) : false };
                            } else if (typeof v.likes === 'number') {
                                initial[v.id] = { count: v.likes, liked: false };
                            }
                        });
                        return initial;
                    });

                    setCommentsMap(prev => {
                        const initial: Record<string, string[]> = {};
                        data.forEach((v: any) => {
                            if (Array.isArray(v.comments)) {
                                initial[v.id] = v.comments;
                            }
                        });
                        return { ...initial, ...prev };
                    });
                    (async () => {
                        try {
                            const ids = new Set<string>();
                            data.forEach((v: any) => {
                                if (v.userId) ids.add(v.userId);
                                if (Array.isArray(v.comments)) {
                                    const walk = (nodes: any[]) => {
                                        for (const n of nodes || []) {
                                            if (n.userId) ids.add(n.userId);
                                            if (n.children) walk(n.children);
                                        }
                                    }
                                    walk(v.comments);
                                }
                            });
                            await Promise.all(Array.from(ids).map(id => fetchAndCacheUser(id)));
                        } catch (error) { console.error(error) }
                    })();
                }
            } catch (err) {
                console.error("Failed to fetch videos:", err);
                if (isMounted) {
                    setVideos([]);
                    setFilteredVideos([]);
                    setVideoError("Failed to load videos.");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        
        fetchVideos();
        
        return () => {
            isMounted = false;
        };
    }, [user]);

    useEffect(() => {
        if (searchQuery.trim() === "") {
            setFilteredVideos(videos);
            setCurrentVideoIndex(0);
        } else if (!isNaN(Number(searchQuery)) && parseInt(searchQuery) <= videos.length) {
            const filtered = [videos[parseInt(searchQuery) - 1]];

            setFilteredVideos(filtered);
            setCurrentVideoIndex(0);
        } else {
            const filtered = videos.filter(video => 
                video.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                video.id.toString().includes(searchQuery)
            );
            setFilteredVideos(filtered);
            setCurrentVideoIndex(0);
        } 
    }, [filteredVideos.length, searchQuery, videos]);
























    useEffect(() => {
        const isMobileDevice = () => {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        };
        setIsMobile(isMobileDevice());
    }, []);
    useEffect(() => {
        let mounted = true;
        import('react-icons/fi').then(mod => {
            if (!mounted) return;
            setIcons({
                Like: mod.FiHeart,
                Comment: mod.FiMessageCircle,
                Share: mod.FiShare2,
                Volume: mod.FiVolume2,
                VolumeOff: mod.FiVolumeX
            });
        }).catch(() => {
        });
        return () => { mounted = false }
    }, []);

    const handleNext = () => {
        if (filteredVideos.length > 1) {
            setVideoLoading(true);
            setVideoError(null);
            setCurrentVideoIndex(prev => Math.min(prev + 1, filteredVideos.length - 1));
        }
    };

    const handlePrev = () => {
        if (filteredVideos.length > 1) {
            setVideoLoading(true);
            setVideoError(null);
            setCurrentVideoIndex(prev => Math.max(0, prev - 1));
        }
    };

    const handleVideoError = () => {
        setVideoError("Failed to load video.");
        setVideoLoading(false);
    };

    const handleTryPlaying = async () => {
        if (!videoRef.current || !currentVideo) return;
        
        setVideoLoading(true);
        setVideoError(null);
        
        try {
            videoRef.current.load();
            await new Promise(resolve => setTimeout(resolve, 1000));
            videoRef.current.muted = true;
            const playPromise = videoRef.current.play();
            
            if (playPromise !== undefined) {
                await playPromise;
                setVideoLoading(false);
            }
        } catch (error) {
            console.error("Error trying to play video:", error);
            setVideoError("Still unable to play video. Please try refreshing the page.");
            setVideoLoading(false);
        }
    };
    
    const toggleVideoLike = async (id: string) => {
        let nextLiked = false;
        setLikesMap(prev => {
            const cur = prev[id] || { count: 0, liked: false };
            const next = { count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1, liked: !cur.liked };
            nextLiked = next.liked;
            return { ...prev, [id]: next };
        });

        try {
            const action = nextLiked ? 'like' : 'unlike';
                const res = await fetch(`${API_BASE}/videos/${id}/like`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ action })
            });
            if (!res.ok) {
                const text = await res.text();
                console.error('like API error', res.status, text);
                setLikesMap(prev => {
                    const cur = prev[id] || { count: 0, liked: false };
                    const rollback = { count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1, liked: !cur.liked };
                    return { ...prev, [id]: rollback };
                });
                return;
            }
            const data = await res.json();
            const likesArr: string[] = Array.isArray(data.likes) ? data.likes : [];
            setLikesMap(prev => ({ ...prev, [id]: { count: likesArr.length, liked: user ? likesArr.includes(user.id) : nextLiked } }));
        } catch (e) {
            console.error('like request failed', e);
            setLikesMap(prev => {
                const cur = prev[id] || { count: 0, liked: false };
                const rollback = { count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1, liked: !cur.liked };
                return { ...prev, [id]: rollback };
            });
        }
    }

    const insertNestedComment = (arr: any[], comment: any) => {
        if (!comment.parentId) return [...arr, comment];
        const clone = arr.map(a => ({ ...a, children: a.children ? [...a.children] : [] }));
        const walker = (nodes: any[]): boolean => {
            for (const n of nodes) {
                if (n.id === comment.parentId) {
                    n.children = n.children || [];
                    n.children.push(comment);
                    return true;
                }
                if (n.children && n.children.length) {
                    if (walker(n.children)) return true;
                }
            }
            return false;
        }
        const found = walker(clone);
        if (found) return clone;
        return [...clone, comment];
    }

    const addComment = async (videoId: string, text: string, parentId?: string | null) => {
        if (!text.trim()) return;
        if (!token) {
            alert('Please log in to comment');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/videos/${videoId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ text, parentId })
            });

            if (!res.ok) {
                let details = '';
                try { details = await res.text(); } catch (error) { details = String(error) }
                console.error('Failed to post comment', res.status, details);
                alert(`Failed to post comment: ${res.status} ${details}`);
                return;
            }

            const created = await res.json();

            setCommentsMap(prev => {
                const cur = prev[videoId] ? [...prev[videoId]] : [];
                const updated = insertNestedComment(cur, created);
                return { ...prev, [videoId]: updated };
            });
            try {
                const uid = created.user?.id || created.userId || (user && user.id);
                if (uid) fetchAndCacheUser(uid);
            } catch (error) { console.error(error) }
            setNewComment('');
            setReplyTo(null);
        } catch (e) {
            console.error('post comment error', e);
            alert('Failed to post comment: ' + (e as any).message);
        }
    }

    const toggleExpand = (id: string) => {
        setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }));
    }

    const shareVideo = async (video: Video) => {
        const url = `${API_BASE}${video.url}`;
        try {
            if ((navigator as any).share) {
                await (navigator as any).share({ title: video.name, url });
            } else {
                await navigator.clipboard.writeText(url);
                alert('Video link copied to clipboard');
            }
        } catch (e) {
            console.warn('share failed', e)
        }
    }
    const touchStartY = useRef<number | null>(null);
    const lockBodyScroll = () => {
        if (typeof document === 'undefined') return;
        if (prevBodyOverflow.current == null) prevBodyOverflow.current = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }
    const unlockBodyScroll = () => {
        if (typeof document === 'undefined') return;
        if (prevBodyOverflow.current != null) {
            document.body.style.overflow = prevBodyOverflow.current;
            prevBodyOverflow.current = null;
        } else {
            document.body.style.overflow = '';
        }
    }

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        lockBodyScroll();
    }
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartY.current == null) {
            unlockBodyScroll();
            return;
        }
        const endY = e.changedTouches[0].clientY;
        const diff = touchStartY.current - endY;
        if (Math.abs(diff) > 50) {
            if (diff > 0) handleNext(); else handlePrev();
        }
        touchStartY.current = null;
        unlockBodyScroll();
    }

    const handlePointerEnter = () => lockBodyScroll();
    const handlePointerLeave = () => unlockBodyScroll();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') handleNext();
            if (e.key === 'ArrowUp' || e.key === 'PageUp') handlePrev();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [filteredVideos]);
    const lastWheel = useRef<number>(0);
    const handleWheel = (e: React.WheelEvent) => {
        const now = Date.now();
        if (now - lastWheel.current < 500) return;
        if (Math.abs(e.deltaY) < 30) return;

        const atTop = currentVideoIndex === 0;
        const atBottom = currentVideoIndex === Math.max(0, filteredVideos.length - 1);
        if (e.deltaY < 0 && atTop) {
            return;
        }
        if (e.deltaY > 0 && atBottom) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        lastWheel.current = now;
        if (e.deltaY > 0) handleNext(); else handlePrev();
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }
    useEffect(() => {
        const next = filteredVideos[currentVideoIndex + 1];
        if (!next) return;
        const pre = document.createElement('video');
        pre.preload = 'auto';
        pre.src = `${API_BASE}${next.url}`;
        pre.style.display = 'none';
        document.body.appendChild(pre);
        const t = setTimeout(() => {
            try { document.body.removeChild(pre); } catch (error) { console.error(error) }
        }, 15000);
        return () => {
            clearTimeout(t);
            try { if (pre.parentNode) pre.parentNode.removeChild(pre); } catch (error) { console.error(error) }
        }
    }, [currentVideoIndex, filteredVideos]);
    useEffect(() => {
        setVideoLoading(true);
    }, [currentVideoIndex]);

    const handleVideoCanPlay = async () => {
        try {
            if (videoRef.current) {
                try { videoRef.current.muted = isMuted } catch (error) { console.error(error) }
                const p = videoRef.current.play();
                if (p && p instanceof Promise) {
                    await p.catch(() => {});
                }
            }
        } finally {
            setVideoLoading(false);
        }
    }

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    };

    const currentVideo = filteredVideos[currentVideoIndex];
    useEffect(() => {
        const cur = filteredVideos[currentVideoIndex];
        if (!cur) return;
        if (!showCommentsFor) return; 
        setShowCommentsFor(cur.id);
        setCommentsMap(prev => {
            if (prev[cur.id]) return prev;
            return { ...prev, [cur.id]: cur.comments || [] };
        });
    }, [currentVideoIndex, filteredVideos]);

    const CommentItem = ({ comment, videoId, depth }: { comment: any, videoId: string, depth: number }) => {
        const author = comment.userId ? (userCache[comment.userId] || comment.user) : (comment.user || null)
        return (
            <div style={{ paddingLeft: depth * 12 }}>
                <div className="p-3 rounded-lg bg-white shadow-sm border border-pink-50">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                            <img src={resolveAsset(author?.avatar || '/images/default-avatar.png')} alt="avatar" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                            <div>
                                <div className="flex items-center space-x-2">
                                    <div className="font-semibold text-sm text-pink-600">{author?.username || 'Unknown'}</div>
                                    <div className="text-xs text-gray-400">@{(author?.username || 'user').toLowerCase()}</div>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">{new Date(comment.createdAt).toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                            <button onClick={() => {  }} className="text-pink-500 p-1 rounded-full hover:bg-pink-50">
                                {Icons && Icons.Like ? <Icons.Like size={18} /> : '❤'}
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-800">{comment.text}</div>
                    <div className="mt-3 flex items-center space-x-3">
                        <button onClick={() => {
                            setReplyTo(comment.id);
                            setNewComment(`@${author?.username || 'user'} `);
                            setTimeout(() => { try { commentInputRef.current?.focus(); } catch (error) { console.error(error) } }, 50);
                        }} className="text-pink-600 text-sm hover:underline">Reply ✨</button>
                    </div>
                </div>
                {comment.children && comment.children.length > 0 && (
                    <div className="mt-3 space-y-3">
                        {comment.children.map((ch: any) => (
                            <CommentItem key={ch.id} comment={ch} videoId={videoId} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />
            
            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    {}
                    <div className="flex-grow flex-col">
                        <Navigation />

                        {}
                        <div className="mt-4 p-4 border border-blue-300 rounded-lg bg-blue-100 shadow-md">
                            <h2 className="font-bold text-blue-500 text-lg pb-2">search video here</h2>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search video name or index..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                    className="border border-blue-400 rounded-lg w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {searchQuery && (
                                <p className="text-sm text-blue-600 mt-1">
                                    Showing {filteredVideos.length} of {videos.length} videos
                                </p>
                            )}
                        </div>

                        <div className="flex justify-center lg:w-[339px] mt-4 border border-blue-300 rounded-lg bg-blue-100 shadow-md">
                            <img className="border border-blue-300 rounded-lg" src="https://media1.tenor.com/m/hVmwmbz6u9oAAAAC/kobayashi-san-maid-dragon.gif" />
                        </div>
                    </div>
    
                    {}
                    <main className="w-full lg:w-3/5 space-y-2 p-4">
                        <div className="flex flex-col justify-center items-center p-4">
                            {loading ? (
                                <div className="text-blue-600">Loading videos...</div>
                            ) : videoError ? (
                                <div className="text-red-500 p-4 rounded bg-red-50 max-w-md text-center">
                                    {videoError}
                                    {currentVideo && (
                                        <button 
                                            onClick={handleTryPlaying}
                                            className="mt-2 block mx-auto border border-blue-500 px-3 py-1 rounded hover:bg-blue-50"
                                        >
                                            Try Playing
                                        </button>
                                    )}
                                </div>
                            ) : filteredVideos.length === 0 ? (
                                <div className="text-red-500">
                                    No videos found matching "{searchQuery}". Try a different search.
                                </div>
                            ) : (
                                null
                            )}

                                    {}
                                    <div
                                        ref={el => { containerRef.current = el }}
                                        onWheel={handleWheel}
                                        onTouchStart={handleTouchStart}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onMouseEnter={handlePointerEnter}
                                        onMouseLeave={handlePointerLeave}
                                        tabIndex={0}
                                        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
                                        className="w-full overflow-hidden flex justify-center items-center relative"
                                    >
                                        {currentVideo && (
                                            <div className="w-full flex flex-col items-center">
                                                <div className="relative bg-black/50 p-4 rounded-xl overflow-hidden">
                                                    <video
                                                        key={currentVideo.id}
                                                        ref={videoRef}
                                                        className="max-h-[70vh] w-auto max-w-full rounded-lg shadow-lg bg-black object-contain mx-auto"
                                                        autoPlay
                                                        playsInline
                                                        loop
                                                        muted={isMuted}
                                                        preload="auto"
                                                        onError={handleVideoError}
                                                        onCanPlay={handleVideoCanPlay}
                                                        onEnded={() => handleNext()}
                                                        style={{ visibility: videoLoading ? 'hidden' : 'visible', display: 'block' }}
                                                    >
                                                        <source src={`${API_BASE}${currentVideo.url}`} type="video/mp4" />
                                                    </video>

                                                    {videoLoading && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="p-4 bg-black/60 rounded-lg text-white">Loading video...</div>
                                                        </div>
                                                    )}

                                                    {}
                                                    <button
                                                        onClick={() => {
                                                            const next = !isMuted;
                                                            setIsMuted(next);
                                                            try { if (videoRef.current) videoRef.current.muted = next } catch (error) { console.error(error) }
                                                        }}
                                                        className="absolute left-3 top-3 z-50 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
                                                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                                                    >
                                                        {Icons && (isMuted ? Icons.VolumeOff : Icons.Volume) ? (
                                                            isMuted ? <Icons.VolumeOff size={18} /> : <Icons.Volume size={18} />
                                                        ) : (
                                                            isMuted ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-.77-3.29-1.98-4.32l1.42-1.42A8 8 0 0119.5 12a8 8 0 01-3.56 6.74l-1.42-1.42A5.99 5.99 0 0016.5 12zM5 9v6h4l5 5V4L9 9H5z"/></svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>
                                                            )
                                                        )}
                                                    </button>

                                                    {}
                                                    <div className="absolute left-4 bottom-4 bg-black/50 text-white p-3 rounded-md max-w-[70%]">
                                                        <div className="font-semibold">{(currentVideo.userId && (userCache[currentVideo.userId]?.username || currentVideo.author)) || currentVideo.author || 'Unknown'}</div>
                                                        {currentVideo.description && (
                                                            <div className="text-sm mt-1 leading-snug">
                                                                {(() => {
                                                                    const MAX = 20;
                                                                    const desc = currentVideo.description || '';
                                                                    const expanded = expandedMap[currentVideo.id];
                                                                    if (desc.length > MAX && !expanded) {
                                                                        return (
                                                                            <>
                                                                                {desc.slice(0, MAX)}... <button onClick={() => toggleExpand(currentVideo.id)} className="underline ml-1">more</button>
                                                                            </>
                                                                        )
                                                                    }
                                                                    if (desc.length > MAX && expanded) {
                                                                        return (
                                                                            <>
                                                                                {desc} <button onClick={() => toggleExpand(currentVideo.id)} className="underline ml-1">less</button>
                                                                            </>
                                                                        )
                                                                    }
                                                                    return desc;
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {}
                                                    <div className="absolute left-0 right-0 bottom-3 flex justify-center">
                                                        <div className="bg-black/40 text-white text-sm px-3 py-1 rounded-md">
                                                            {filteredVideos.length > 0 ? `${currentVideoIndex + 1} / ${filteredVideos.length}` : '0 / 0'}
                                                        </div>
                                                    </div>

                                                    {}
                                                        <div className="absolute right-4 bottom-8 flex flex-col items-center space-y-4">
                                                        <Link to={currentVideo.userId ? `/profile/${(userCache[currentVideo.userId]?.username || currentVideo.author)}` : '#'} className="block">
                                                            <img src={resolveAsset((currentVideo.userId && (userCache[currentVideo.userId]?.avatar)) || currentVideo.authorAvatar || '/images/default-avatar.png')} alt="author" className="w-12 h-12 rounded-full border-2 border-white shadow-md object-cover hover:opacity-80 transition-opacity" />
                                                        </Link>

                                                        <button onClick={() => toggleVideoLike(currentVideo.id)} className="flex flex-col items-center text-white">
                                                            <div className={`p-3 rounded-full bg-white/10 hover:bg-white/20 ${likesMap[currentVideo.id]?.liked ? 'text-pink-400' : 'text-white'}`}>
                                                                {Icons && Icons.Like ? (
                                                                    <Icons.Like size={24} />
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-7.07C-0.02 10.01 3 6 6.5 6c1.74 0 3.04.99 3.5 2.09C10.46 6.99 11.76 6 13.5 6 17 6 20.02 10.01 21.5 13.93 19 16.65 12 21 12 21z"/></svg>
                                                                )}
                                                            </div>
                                                            <span className="text-sm mt-1 text-white">{likesMap[currentVideo.id]?.count || 0}</span>
                                                        </button>

                                                        <button onClick={() => setShowCommentsFor(currentVideo.id)} className="flex flex-col items-center text-white">
                                                            <div className="p-3 rounded-full bg-white/10 hover:bg-white/20">
                                                                {Icons && Icons.Comment ? (
                                                                    <Icons.Comment size={22} />
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-18v12h4v4l4-4h10z"/></svg>
                                                                )}
                                                            </div>
                                                            <span className="text-sm mt-1 text-white">{(commentsMap[currentVideo.id] || []).length}</span>
                                                        </button>

                                                        <button onClick={() => shareVideo(currentVideo)} className="flex flex-col items-center text-white">
                                                            <div className="p-3 rounded-full bg-white/10 hover:bg-white/20">
                                                                {Icons && Icons.Share ? (
                                                                    <Icons.Share size={20} />
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8.59L16.59 7 12 11.59 7.41 7 6 8.59 10.59 13 6 17.41 7.41 19 12 14.41 16.59 19 18 17.41 13.41 13z"/></svg>
                                                                )}
                                                            </div>
                                                            <span className="text-sm mt-1 text-white">Share</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        
                                    </div>

                                    {}
                        </div>
                    </main>

                    {}
                    <div className="flex-col">
                        <div className="mt-3 mb-auto lg:w-[260px] space-y-4">
                            {showCommentsFor ? (
                                <div className="w-full bg-gradient-to-br from-pink-50 to-yellow-50 border border-pink-100 rounded-2xl shadow-lg max-h-[70vh] flex flex-col overflow-hidden">
                                    <div className="p-4 flex justify-between items-center border-b border-pink-100">
                                        <h3 className="font-bold text-pink-600 text-lg">💬 Cute Comments</h3>
                                        <button onClick={() => setShowCommentsFor(null)} className="text-pink-600 hover:underline">Close</button>
                                    </div>
                                    <div className="p-4 flex-grow overflow-auto">
                                        {(!commentsMap[showCommentsFor] || commentsMap[showCommentsFor].length === 0) ? (
                                            <div className="text-sm text-pink-600">No comments yet — be the first! ✨</div>
                                        ) : (
                                            <div className="space-y-3">
                                                                        {(commentsMap[showCommentsFor] || []).map((c: any) => (
                                                                            <CommentItem key={c.id} comment={c} videoId={showCommentsFor!} depth={0} />
                                                                        ))}
                                            </div>
                                        )}
                                    </div>
                                                    <div className="p-4 border-t bg-transparent flex flex-col space-y-2">
                                                        {replyTo && (
                                                            <div className="flex items-center justify-between bg-pink-50 border border-pink-100 rounded-full px-3 py-1 text-sm text-pink-600">
                                                                <div>Replying to <span className="font-semibold">@{(function(){
                                                                    const find = (nodes: any[]): any => {
                                                                        for (const n of nodes || []) {
                                                                            if (n.id === replyTo) return n;
                                                                            if (n.children) {
                                                                                const r = find(n.children);
                                                                                if (r) return r;
                                                                            }
                                                                        }
                                                                        return null;
                                                                    }
                                                                    const tree = commentsMap[showCommentsFor] || [];
                                                                    const node = find(tree);
                                                                    return node?.user?.username || 'user';
                                                                })()}</span></div>
                                                                <button onClick={() => { setReplyTo(null); setNewComment(''); }} className="text-pink-500 underline text-sm">Cancel</button>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center space-x-2">
                                                            <input
                                                                ref={el => { commentInputRef.current = el }}
                                                                value={newComment}
                                                                onChange={e => setNewComment(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter' && showCommentsFor) { addComment(showCommentsFor, newComment, replyTo); } }}
                                                                className="flex-grow min-w-0 border border-pink-200 rounded-full px-4 py-2 bg-white/90"
                                                                placeholder={replyTo ? 'Replying...' : 'Write a cute comment...'}
                                                            />
                                                            <button onClick={() => { if (showCommentsFor) addComment(showCommentsFor, newComment, replyTo); }} className="bg-pink-500 text-white px-4 py-2 rounded-full flex-shrink-0 hover:bg-pink-600">Send</button>
                                                        </div>
                                                    </div>
                                </div>
                            ) : (
                                <>
                                    <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                                        <div className="space-y-2 text-sm text-center font-bold">
                                            <h2 className="text-blue-600 font-bold text-lg pb-2">Upload 😸</h2>
                                            <Link to="/videos/edit">
                                                <div className="border border-blue-300 rounded-2xl bg-blue-200 p-1 hover:bg-blue-300 hover:animate-wiggle">
                                                    Click here
                                                </div>
                                            </Link>
                                        </div>
                                    </aside>
                                    <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                                        <div className="space-y-2 text-sm text-center font-bold">
                                            <p className="text-blue-500 p-2">
                                                We have a total of <span className="font-bold text-blue-800 underline">{videos.length}</span> videos from the internet.
                                            </p>
                                        </div>
                                    </aside>

                                    <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 space-y-2">
                                        <h3 className="font-bold text-center">WARNING!!</h3>
                                        <div className="space-y-2 text-sm text-center font-bold border-t border-blue-800">
                                            <p className="text-blue-500 p-2">
                                                Videos <span className="font-extrabold underline">may not work</span> on Safari and iOS devices.
                                            </p>
                                            <p className="text-blue-500 p-2">
                                                If the video is not loading, try <span className="font-extrabold underline">refreshing the page</span>.
                                            </p>
                                            <p className="text-blue-500 p-2">
                                                Recently uploaded videos <span className="font-extrabold underline">may take a while to load</span>.
                                            </p>
                                        </div>
                                    </aside>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <Footer />
        </div>
    );
};

export default Videos;