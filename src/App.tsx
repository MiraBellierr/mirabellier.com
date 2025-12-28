import { Routes, Route } from "react-router-dom";
import { Helmet } from "react-helmet";
import Home from "./pages/Home";
import About from "./pages/About";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Art from "./pages/Art";
import BlogEdit from "./pages/BlogEdit";
import Videos from "./pages/Videos";
import VideosEdit from "./pages/VideosEdit";
import AdminAnime from './pages/AdminAnime'
import CursorManager from "./parts/CursorManager";
import { CursorProvider } from "./states/CursorContext";
import { AuthProvider } from './states/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'
import Profile from './pages/Profile'

function App() {

  return (
    <div>
      <CursorProvider>
        <AuthProvider>
        <CursorManager />
        <Helmet>
          <title>Mirabellier ⭐ — Cute thoughts & cozy corners</title>
          <link rel="icon" href="https://mirabellier.com/favicon.jpg" />
          <link rel="canonical" href="https://mirabellier.com/" />
          <meta name="description" content="Mirabellier — a tiny, cozy blog where I share cute thoughts, fuzzy photos, and little projects. Come say hi and find something to smile about!" />
          <meta name="keywords" content="mirabellier, blog, cute, kittens, art, videos, personal" />
          <meta name="author" content="Mirabellier" />
          <meta name="robots" content="index, follow" />
          <meta name="theme-color" content="#EE82EE" />

          <meta property="og:type" content="website" />
          <meta property="og:title" content="Mirabellier ⭐ — Cute thoughts & cozy corners" />
          <meta property="og:description" content="A tiny, cozy blog sharing small joys: photos, videos, and short posts." />
          <meta property="og:site_name" content="Mirabellier" />
          <meta property="og:url" content="https://mirabellier.com/" />
          <meta property="og:image" content="https://mirabellier.com/background.jpg" />

          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:site" content="@mirabellier" />
          <meta name="twitter:creator" content="@mirabellier" />
          <meta name="twitter:title" content="Mirabellier ⭐ — Cute thoughts & cozy corners" />
          <meta name="twitter:description" content="A tiny, cozy blog sharing small joys: photos, videos, and short posts." />
          <meta name="twitter:image" content="https://mirabellier.com/background.jpg" />

          <script type="application/ld+json">{`{
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "Mirabellier",
            "url": "https://mirabellier.com",
            "description": "A tiny, cozy blog sharing small joys: photos, videos, and short posts.",
            "publisher": {
              "@type": "Person",
              "name": "Mirabellier"
            }
          }`}</script>
        </Helmet>
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/spill" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/art" element={<Art />} />
          <Route path="/blog/edit" element={<BlogEdit />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/videos/edit" element={<VideosEdit />} />
          <Route path="/admin/anime" element={<AdminAnime />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
        </AuthProvider>
      </CursorProvider>
    </div>
  )
}

export default App
