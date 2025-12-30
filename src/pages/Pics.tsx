import { useEffect, useState } from "react";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import { Link } from "react-router-dom";
import { API_BASE } from '@/lib/config';

interface Pic {
    id: string;
    title: string;
    url: string;
    createdAt: string;
    userId?: string;
    author?: string;
    authorAvatar?: string | null;
    likes?: any[];
    comments?: any[];
}

const Pics = () => {
    const [pics, setPics] = useState<Pic[]>([]);
    const [currentPicIndex, setCurrentPicIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [userCache, setUserCache] = useState<Record<string, any>>({});

    const resolveAsset = (asset?: string | null) => {
        if (!asset) return `${API_BASE}/images/default-avatar.png`;
        if (/^https?:\/\//.test(asset)) return asset;
        if (asset.startsWith('/')) return `${API_BASE}${asset}`;
        if (asset.includes('/')) return `${API_BASE}/${asset}`;
        return `${API_BASE}/images/${asset}`;
    }

    useEffect(() => {
        let isMounted = true;
        
        async function fetchPics() {
            try {
                const res = await fetch(`${API_BASE}/pics`);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                if (isMounted) {
                    setPics(data);
                    setLoading(false);

                    // Fetch user info for all pics
                    const userIds = new Set<string>();
                    data.forEach((p: any) => {
                        if (p.userId) userIds.add(p.userId);
                    });

                    userIds.forEach(async (userId) => {
                        try {
                            const userRes = await fetch(`${API_BASE}/user/${userId}`);
                            if (userRes.ok) {
                                const userData = await userRes.json();
                                if (isMounted) {
                                    setUserCache(prev => ({ ...prev, [userId]: userData }));
                                }
                            }
                        } catch (err) {
                            console.error('Error fetching user:', err);
                        }
                    });
                }
            } catch (err) {
                console.error('Error fetching pics:', err);
                setLoading(false);
            }
        }

        fetchPics();
        return () => { isMounted = false; }
    }, []);

    const handleNext = () => {
        if (pics.length > 1) {
            setCurrentPicIndex(prev => Math.min(prev + 1, pics.length - 1));
        }
    };

    const handlePrev = () => {
        if (pics.length > 1) {
            setCurrentPicIndex(prev => Math.max(0, prev - 1));
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') handleNext();
            if (e.key === 'ArrowUp' || e.key === 'PageUp') handlePrev();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pics]);

    const currentPic = pics[currentPicIndex];

    return (
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />

            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    <div className="flex-grow flex-col">
                        <Navigation />
                    </div>
        
                    <main className="w-full lg:w-3/5 space-y-2 p-4">
                        <div className="flex flex-col justify-center items-center p-4">
                            {loading ? (
                                <div className="text-blue-600">Loading pictures...</div>
                            ) : pics.length === 0 ? (
                                <div className="text-blue-500">
                                    No pictures yet. Be the first to upload! 📸
                                </div>
                            ) : (
                                <div className="w-full flex flex-col items-center">
                                    {currentPic && (
                                        <div className="w-full flex flex-col items-center">
                                            {/* Picture Container */}
                                            <div className="relative bg-black/50 p-4 rounded-xl overflow-hidden max-w-2xl">
                                                <img
                                                    key={currentPic.id}
                                                    src={`${API_BASE}${currentPic.url}`}
                                                    alt={currentPic.title}
                                                    className="max-h-[70vh] w-auto max-w-full rounded-lg shadow-lg bg-black object-contain mx-auto"
                                                />

                                                {/* User Info + Title (Top Left) */}
                                                {currentPic.userId && (
                                                    <div className="absolute left-4 top-4 flex flex-col items-start space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <Link to={`/profile/${(userCache[currentPic.userId]?.username || currentPic.author)}`} className="block">
                                                                <img 
                                                                    src={resolveAsset((userCache[currentPic.userId]?.avatar) || currentPic.authorAvatar || '/images/default-avatar.png')} 
                                                                    alt={`${(userCache[currentPic.userId]?.username) || 'author'} avatar`}
                                                                    className="w-8 h-8 rounded-full border-2 border-white shadow-md object-cover hover:opacity-80 transition-opacity" 
                                                                    loading="eager"
                                                                    fetchPriority="high"
                                                                    width="32"
                                                                    height="32"
                                                                />
                                                            </Link>
                                                            <Link to={`/profile/${(userCache[currentPic.userId]?.username || currentPic.author)}`} className="text-white text-sm font-bold hover:underline">
                                                                {userCache[currentPic.userId]?.username || currentPic.author || 'Unknown'}
                                                            </Link>
                                                            <span className="text-white text-sm font-bold">-</span>
                                                            <span className="text-white text-sm font-bold">{currentPic.title}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Pagination indicator */}
                                                <div className="absolute left-0 right-0 bottom-3 flex justify-center">
                                                    <div className="bg-black/40 text-white text-sm px-3 py-1 rounded-md">
                                                        {pics.length > 0 ? `${currentPicIndex + 1} / ${pics.length}` : '0 / 0'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Navigation Buttons */}
                                            <div className="flex gap-4 mt-6">
                                                <button
                                                    onClick={handlePrev}
                                                    disabled={currentPicIndex === 0}
                                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg hover:animate-wiggle"
                                                >
                                                    ← Previous
                                                </button>
                                                <button
                                                    onClick={handleNext}
                                                    disabled={currentPicIndex === pics.length - 1}
                                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg hover:animate-wiggle"
                                                >
                                                    Next →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </main>

                    <div className="flex-col">
                        <div className="mt-3 mb-auto lg:w-[200px] space-y-4">
                            <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                                <div className="space-y-2 text-sm text-center font-bold">
                                    <h2 className="text-blue-600 font-bold text-lg pb-2">Upload 📸</h2>
                                    <Link to="/pics/edit">
                                        <div className="border border-blue-300 rounded-2xl bg-blue-200 p-1 hover:bg-blue-300 hover:animate-wiggle">
                                            Click here
                                        </div>
                                    </Link>
                                </div>
                            </aside>
                            <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                                <div className="space-y-2 text-sm text-center font-bold">
                                    <p className="text-blue-500 p-2">
                                        We have a total of <span className="font-bold text-blue-800 underline">{pics.length}</span> pictures.
                                    </p>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    )
}

export default Pics;