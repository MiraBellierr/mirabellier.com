#!/usr/bin/env node

/**
 * Generates sitemap.xml for the Mirabellier.com website
 * Includes static pages and dynamically fetches blog posts, videos, and pics
 * 
 * Usage:
 *   node generate-sitemap.cjs
 *   VITE_API_BASE=https://custom-domain.com/api node generate-sitemap.cjs
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration
const API_BASE = process.env.VITE_API_BASE || 'https://mirabellier.com/api';
const WEBSITE_BASE = process.env.WEBSITE_BASE || 'https://mirabellier.com';
const OUTPUT_PATH = path.join(__dirname, 'public', 'sitemap.xml');

// Static routes that don't require dynamic data
const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/home', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog', priority: '0.9', changefreq: 'daily' },
  { path: '/videos', priority: '0.8', changefreq: 'weekly' },
  { path: '/pics', priority: '0.8', changefreq: 'weekly' },
];

/**
 * Fetch data from API endpoint
 */
function fetchFromAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const protocol = url.protocol === 'https:' ? https : http;

    protocol
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${endpoint}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Generate XML sitemap
 */
function generateSiteMap(entries) {
  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${entry.changefreq || 'weekly'}</changefreq>
    <priority>${entry.priority || '0.5'}</priority>
  </url>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Convert slug or ID to URL-friendly format
 */
function getPostUrl(post) {
  // Try to use slug if available, otherwise use ID
  if (post.slug) {
    return `${WEBSITE_BASE}/blog/${post.slug}`;
  }
  // If post has a title, create a slug from it
  if (post.title) {
    const slug = post.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return `${WEBSITE_BASE}/blog/${slug}`;
  }
  // Fallback to ID
  return `${WEBSITE_BASE}/blog/${post.id}`;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🗺️  Generating sitemap.xml...');
    console.log(`   API Base: ${API_BASE}`);
    console.log(`   Website: ${WEBSITE_BASE}`);

    const entries = [];

    // Add static routes
    for (const route of STATIC_ROUTES) {
      entries.push({
        url: `${WEBSITE_BASE}${route.path}`,
        priority: route.priority,
        changefreq: route.changefreq,
      });
    }

    // Fetch and add blog posts
    try {
      console.log('📝 Fetching blog posts...');
      const posts = await fetchFromAPI('/posts');
      if (Array.isArray(posts)) {
        posts.forEach((post) => {
          entries.push({
            url: getPostUrl(post),
            lastmod: post.createdAt
              ? new Date(post.createdAt).toISOString().split('T')[0]
              : undefined,
            priority: '0.7',
            changefreq: 'monthly',
          });
        });
        console.log(`   ✓ Added ${posts.length} blog posts`);
      }
    } catch (err) {
      console.warn(
        `   ⚠️  Could not fetch blog posts: ${err.message}. Continuing with static routes...`
      );
    }

    // Fetch and add videos
    try {
      console.log('🎬 Fetching videos...');
      const videos = await fetchFromAPI('/videos');
      if (Array.isArray(videos) && videos.length > 0) {
        videos.forEach((video) => {
          entries.push({
            url: `${WEBSITE_BASE}/videos#${video.id || video.slug}`,
            lastmod: video.createdAt
              ? new Date(video.createdAt).toISOString().split('T')[0]
              : undefined,
            priority: '0.6',
            changefreq: 'monthly',
          });
        });
        console.log(`   ✓ Added ${videos.length} videos`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Could not fetch videos: ${err.message}`);
    }

    // Fetch and add pics
    try {
      console.log('🖼️  Fetching pictures...');
      const pics = await fetchFromAPI('/pics');
      if (Array.isArray(pics) && pics.length > 0) {
        pics.forEach((pic) => {
          entries.push({
            url: `${WEBSITE_BASE}/pics#${pic.id || pic.slug}`,
            lastmod: pic.createdAt
              ? new Date(pic.createdAt).toISOString().split('T')[0]
              : undefined,
            priority: '0.6',
            changefreq: 'monthly',
          });
        });
        console.log(`   ✓ Added ${pics.length} pictures`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Could not fetch pictures: ${err.message}`);
    }

    // Generate and write sitemap
    const sitemap = generateSiteMap(entries);
    const publicDir = path.join(__dirname, 'public');

    // Ensure public directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, sitemap, 'utf-8');
    console.log(`\n✅ Sitemap generated successfully!`);
    console.log(`   Total URLs: ${entries.length}`);
    console.log(`   Output: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error('❌ Error generating sitemap:', err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { generateSiteMap, fetchFromAPI, getPostUrl };
