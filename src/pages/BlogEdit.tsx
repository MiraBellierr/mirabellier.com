import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Toast from "../parts/Toast";

import React, { useEffect, useState } from 'react';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor'
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '@/lib/config';
import { useAuth } from '@/states/AuthContext'

import background from "../assets/background.jpeg";


const BlogEdit = () => {
    const auth = useAuth()
    const [title, setTitle] = useState('');
    const [content, setContent] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [, setSubmitSuccess] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    const navigate = useNavigate();

    useEffect(() => {
        if (!auth?.token) {
            navigate('/login')
        }
    }, [auth, navigate])


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
            };
            if (auth?.user?.id) blogData.userId = auth.user.id

            const response = await fetch(`${API_BASE}/posts`, {
                method: 'POST',
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
            setContent({});

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
        <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
            <Header />

            <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: `url(${background})` }}>
                <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
                    <div className="flex-grow flex-col space-y-4">
                        <Navigation />
                        <div className=" mt-3 mb-auto justify-center items-center flex">
                            <img className="border-border-blue-300 rounded-lg shadow" src="https://media1.tenor.com/m/KHZPhIUhSBsAAAAC/miss-kobayashi.gif" />
                        </div>
                    </div>

                    <main className="w-full lg:w-3/5 space-y-2 p-4">
                        <h2 className="font-bold text-2xl text-blue-600">Create a new Post</h2>
                        
                        <form onSubmit={handleSubmit}>      
                                            {}

                            <div className="flex flex-col p-2 space-y-2">
                                <label className="font-bold text-blue-600" htmlFor="title">Title</label>
                                <input
                                    type="text"
                                    id="title"
                                    name="title"
                                    value={title}
                                    onChange={handleTitleChange}
                                    placeholder="Enter the title of the post"
                                    className="form-input border rounded-lg border-blue-300 p-2"
                                    required
                                />
                            </div>

                            <div className="flex flex-col p-2 space-y-2">
                                <div className="block 2xl:block">
                                    <label className="font-bold text-blue-600" htmlFor="content">Content</label>
                                    <SimpleEditor onContentChange={setContent} />
                                </div>
                                                  
                            </div>
                            
                            <div className="flex p-2">
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg hover:animate-wiggle"
                                >
                                    {isSubmitting ? "Publishing..." : "Publish Post"}
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
    )
}

export default BlogEdit;