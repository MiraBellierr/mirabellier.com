# Mirabellier.com Frontend

![mirabellier.com](https://socialify.git.ci/MiraBellierr/mirabellier.com/image?custom_language=React&description=1&font=Inter&forks=1&issues=1&language=1&logo=https%3A%2F%2Fmirabellier.com%2Fbackground.jpg&name=1&owner=1&pattern=Solid&pulls=1&stargazers=1&theme=Auto)

## 🚀 Features

- **Blog System** - Create, edit, and publish blog posts with a rich WYSIWYG editor
- **Media Management** - Upload and manage images, videos, and GIFs
- **Anime Database** - Browse and manage anime information
- **User Authentication** - Discord OAuth integration for user login
- **Dark Mode** - System-aware dark mode with manual toggle
- **Custom Cursor** - Interactive custom cursor system
- **Performance Optimized** - Code splitting, lazy loading, and asset optimization
- **Responsive Design** - Mobile-first design with Tailwind CSS

## 📁 Project Structure

```
src/
├── pages/          # Route pages (Home, Blog, Videos, Pics, etc.)
├── components/     # Reusable UI components
│   ├── tiptap-*   # Tiptap editor components
│   └── DarkToggle.tsx
├── parts/          # Layout components (Header, Footer, Navigation)
├── lib/            # Utility functions and config
│   ├── config.ts       # API base configuration
│   ├── tiptap-utils.ts # Editor upload handlers
│   └── tag-utils.ts    # Tag processing utilities
├── hooks/          # Custom React hooks
├── states/         # React context providers
│   ├── AuthContext.tsx
│   └── CursorContext.tsx
├── assets/         # Static assets (icons, anime data)
└── styles/         # Global styles

```

## 🛠️ Tech Stack

- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS 4
- **Router:** React Router v6 (HashRouter)
- **Rich Text Editor:** Tiptap
- **UI Components:** Radix UI
- **Icons:** React Icons

## 📦 Installation

```bash
npm install
```

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
# API Base URL (defaults to production if not set)
VITE_API_BASE=http://localhost:3000
```

## 🚦 Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Running with Backend

To run the full stack locally:

1. Start the backend server (in a separate terminal):

   ```bash
   npm run backend:dev
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

Make sure `VITE_API_BASE=http://localhost:3000` is set in your `.env` file.

## 🏗️ Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## 📝 Available Scripts

| Command               | Description              |
| --------------------- | ------------------------ |
| `npm run dev`         | Start development server |
| `npm run build`       | Build for production     |
| `npm run preview`     | Preview production build |
| `npm run lint`        | Run ESLint               |
| `npm run backend:dev` | Start backend server     |
| `npm run deploy`      | Deploy to GitHub Pages   |

## 🎨 Key Features

### Tiptap Rich Text Editor

The blog editor uses Tiptap with custom extensions:

- Text formatting (bold, italic, code, etc.)
- Headings, lists, blockquotes
- Image uploads with drag & drop
- Text alignment
- Syntax highlighting for code blocks
- Typography enhancements (smart quotes, em-dashes)

### Performance Optimizations

- **Code Splitting:** React vendor, Tiptap core, and extensions are split into separate chunks
- **Lazy Loading:** Non-critical routes load on demand
- **Image Optimization:** WebP support with preloading for backgrounds
- **CSS Lazy Loading:** Styles load after first paint to improve initial rendering
- **Asset Caching:** Long-term cache headers for static assets

### Routing

The app uses HashRouter for GitHub Pages compatibility. Main routes:

- `/` - Home page
- `/blog` - Blog listing
- `/blog/:slug` - Individual blog post
- `/blog/edit` - Blog editor (admin)
- `/pics` - Image gallery
- `/videos` - Video gallery
- `/about` - About page
- `/login` - Authentication
- `/profile/:username` - User profile

## 🔐 Authentication

Authentication is handled via Discord OAuth:

1. User clicks "Login with Discord"
2. Redirected to Discord OAuth flow
3. Callback returns to `/auth/callback`
4. Token stored in localStorage
5. Auth context provides user state throughout app

## 📱 Responsive Design

The UI adapts to different screen sizes:

- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Touch-friendly interfaces on mobile

## 🎯 Path Aliases

The project uses `@` as an alias for the `src/` directory:

```typescript
import { API_BASE } from "@/lib/config";
import Header from "@/parts/Header";
```

## 🔄 API Integration

API calls are made to the backend server. Base URL is configured via:

- Environment variable: `VITE_API_BASE`
- Defaults to: `https://mirabellier.my.id/api`

Key API endpoints:

- `GET /posts` - Fetch blog posts
- `POST /posts` - Create new post
- `PUT /posts/:id` - Update post
- `POST /posts-img` - Upload image for editor
- `GET /videos` - Fetch videos
- `GET /pics` - Fetch pictures
- `POST /auth/login` - User login
- `GET /auth/user` - Get current user

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 🐛 Known Issues & Limitations

- The app uses HashRouter for GitHub Pages, which creates URLs like `/#/blog`
- Maximum file upload size is 50MB (configurable in backend)
- Discord OAuth requires proper callback URL configuration

## 🔍 Troubleshooting

### Images not loading

- Check that `VITE_API_BASE` points to your backend server
- Verify the backend is running and serving static files
- Check browser console for CORS errors

### Editor not working

- Tiptap requires modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
- Check that all tiptap packages are installed

### Build errors

- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (requires Node 18+)
- Clear node_modules and reinstall if issues persist

## 📚 Additional Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tiptap Documentation](https://tiptap.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
