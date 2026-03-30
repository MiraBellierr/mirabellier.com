import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/",
  optimizeDeps: {
    // Force pre-bundling to dedupe React instances
    include: ["react", "react-dom", "react-router-dom"],
  },
  build: {
    // Enable modulepreload for faster loading
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        // Optimize chunk splitting
        manualChunks: {
          // React core - frequently used
          "react-vendor": [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-router-dom",
            "scheduler",
          ],
        },
        // Optimize asset naming for better caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    // Minify and optimize
    minify: "esbuild",
    // Target modern browsers for smaller bundles
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prevent multiple React/router instances (avoids invalid hook calls)
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
});
