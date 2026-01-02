import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Toast from "../parts/Toast";

import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { API_BASE } from '@/lib/config';
import { useAuth } from '@/states/AuthContext'

const PicsEdit = () => {
    const [title, setTitle] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");

    const navigate = useNavigate();
    const auth = useAuth()

    useEffect(() => {
        // Update canonical URL to point to the PicsEdit page
        const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (canonicalLink) {
            canonicalLink.href = 'https://mirabellier.com/pics/edit';
        }

        // Add structured data for rich results
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'picsedit-structured-data';
        script.text = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Upload Picture",
            "description": "Upload a new picture",
            "url": "https://mirabellier.com/pics/edit"
        });
        document.head.appendChild(script);

        return () => {
            const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
            if (canonicalLink) {
                canonicalLink.href = 'https://mirabellier.com/';
            }
            const oldScript = document.getElementById('picsedit-structured-data');
            if (oldScript) oldScript.remove();
        };
    }, []);

    useEffect(() => {
        if (!auth?.token) navigate('/login')
    }, [auth, navigate])
    

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setImageFile(file || null);
        if (file) {
            setImagePreview(URL.createObjectURL(file));
        } else {
            setImagePreview(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imageFile) return;
        
        setIsSubmitting(true);

        const formData = new FormData();
        formData.append('image', imageFile as Blob);
        if (title) {
            formData.append('title', title);
        }
        if (auth?.user?.id) formData.append('userId', auth.user.id)

        try {
                const res = await fetch(`${API_BASE}/upload-pic`, {
                method: 'POST',
                body: formData,
                headers: {
                    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
                }
            });
            if (res.ok) {
                setTitle('');
                setImageFile(null);
                setImagePreview(null);
                setToastMessage("🎉 Picture uploaded successfully!");
                setShowToast(true);
                setTimeout(() => {
                    setShowToast(false);
                    setToastMessage("");
                        navigate("/pics");
                }, 3000);
            } else {
                const errorData = await res.json();
                setToastMessage(`❌ ${errorData.error || 'Picture upload failed!'}`);
                setShowToast(true);
                setTimeout(() => {
                    setShowToast(false);
                    setToastMessage("");
                }, 3000);
            }
        } catch (err) {
            console.error(err);
            setToastMessage("❌ Picture upload failed!");
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
                setToastMessage("");
            }, 3000);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />

            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    <div className="flex-grow flex-col">
                        <Navigation />
                    </div>

                    <main className="w-full lg:w-3/5 space-y-2 p-4">
                                                <h2 className="font-bold text-2xl text-blue-600">Upload a picture</h2>
                        
                        <form onSubmit={handleSubmit}>
                                        <div className="flex flex-col p-2 space-y-2">
                                            <label className="font-bold text-blue-600" htmlFor="title">
                                                Title (optional)
                                            </label>
                                            <input
                                                type="text"
                                                id="title"
                                                name="title"
                                                value={title}
                                                onChange={handleTitleChange}
                                                className="form-input border rounded-lg border-blue-300 p-2"
                                                placeholder="Enter a title for your picture"
                                            />
                                        </div>

                            <div className="flex flex-col p-2 space-y-2">
                                <label className="font-bold text-blue-600" htmlFor="image">
                                    Upload Picture
                                </label>
                                <input
                                    type="file"
                                    id="image"
                                    name="image"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    onChange={handleImageChange}
                                    className="form-input border rounded-lg border-blue-300 p-2"
                                    required
                                />
                            </div>

                            {imagePreview && (
                                <div className="flex flex-col items-center p-2">
                                    <span className="text-blue-500 mb-2">Preview:</span>
                                    <img
                                        src={imagePreview}
                                        alt="preview"
                                        className="max-w-xs rounded-lg shadow-lg"
                                    />
                                </div>
                            )}

                            <div className="flex p-2">
                                <button 
                                    type="submit" 
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg hover:animate-wiggle"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? "Submitting..." : "Submit"}
                                </button>
                            </div>
                        </form>
                    </main>

                    <div className="flex-col">
                        <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                            <div className="space-y-2 text-sm font-bold">
                                <h2 className="text-blue-600 font-bold text-lg">Tips & Tricks</h2>
                                <div className="border-t border-blue-300 pt-2">
                                    <p className="text-blue-500">
                                        1. Supported formats: JPEG, PNG, GIF, WebP
                                    </p>
                                    <p className="text-blue-500">
                                        2. Add a title to make your picture more discoverable.
                                    </p>
                                </div>
                            </div>
                        </aside>                    
                        <div className="mt-3 mb-auto lg:w-[200px]">
                        </div>
                    </div>
                </div>
            </div>

            {showToast && (
                <Toast message={toastMessage} onClose={() => {
                    setShowToast(false);
                    setToastMessage("");
                    if (toastMessage.includes("success")) {
                            navigate("/pics");
                    }
                }} />
            )}
            <Footer />
        </div>
    )
}

export default PicsEdit;
