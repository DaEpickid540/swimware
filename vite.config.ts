import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // We inject our own iOS/meta tags in index.html, so don't let the plugin
      // duplicate them; it still injects the manifest link + registers the SW.
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "favicon-32.png", "favicon-16.png"],
      manifest: {
        name: "Mason Rec Rays",
        short_name: "Rec Rays",
        description: "Secure swim team hub for coaches, swimmers & families.",
        theme_color: "#0b6bcb",
        background_color: "#0b6bcb",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        categories: ["sports", "education", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/__\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Cache-first for hashed static assets (immutable build output).
            urlPattern: ({ request }) =>
              ["style", "script", "worker", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Cache-first for images (icons, uploaded logos, etc.).
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Network-first for dynamic Firestore/Firebase API reads, falling
            // back to the last cached response when offline. (Firestore's own
            // IndexedDB persistence is the primary offline layer; this is a
            // belt-and-suspenders cache for REST-style reads.)
            urlPattern: /^https:\/\/(firestore|firebasestorage)\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firebase-data",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // keep the SW off during `vite dev` for fast HMR
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Split the heavy vendor libs so the initial app chunk stays small and the
    // browser can cache vendor code across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-app": ["firebase/app", "firebase/auth"],
          "firebase-data": ["firebase/firestore", "firebase/storage", "firebase/functions"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
