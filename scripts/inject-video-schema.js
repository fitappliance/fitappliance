#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile, writeFile } = require('node:fs/promises');
const { extractYouTubeId } = require('./validate-videos');

const VIDEO_START = '<!-- fit-video:start -->';
const VIDEO_END = '<!-- fit-video:end -->';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function extractBrandSlugFromPageSlug(pageSlug) {
  return String(pageSlug ?? '').replace(/-(fridge|dishwasher|dryer|washing-machine)-clearance$/, '');
}

function buildVideoSchema(videos) {
  return {
    '@context': 'https://schema.org',
    '@graph': videos.map((video) => {
      const youtubeId = extractYouTubeId(video.youtubeUrl);
      return {
        '@type': 'VideoObject',
        name: video.oembed.title,
        description: video.oembed.title,
        thumbnailUrl: video.oembed.thumbnail_url,
        embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
        contentUrl: video.youtubeUrl,
        publisher: {
          '@type': 'Organization',
          name: video.oembed.author_name
        }
      };
    })
  };
}

function buildVideoBlock({ videos, brandSlug }) {
  const cards = videos.map((video) => {
    const youtubeId = extractYouTubeId(video.youtubeUrl);
    const thumb = video.oembed.thumbnail_url;
    const title = video.oembed.title;
    return `<article class="video-card">
        <button class="video-facade" type="button" data-youtube-id="${youtubeId}" aria-label="Play ${escHtml(title)}">
          <img src="${escHtml(thumb)}" alt="${escHtml(title)} thumbnail" loading="lazy" decoding="async">
          <span class="video-play">▶</span>
        </button>
        <p class="video-title">${escHtml(title)}</p>
      </article>`;
  }).join('\n');

  const schemaJson = JSON.stringify(buildVideoSchema(videos), null, 2);

  return `${VIDEO_START}
<section id="install-video" class="install-video">
  <h2>Official installation videos</h2>
  <div class="video-grid">
${cards}
  </div>
</section>
<style id="fit-video-style">
  .install-video { margin: 30px 0 18px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--white); }
  .install-video h2 { margin: 0 0 12px; font-size: 18px; color: var(--ink); font-family: 'Instrument Serif', serif; }
  .video-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .video-card { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; }
  .video-facade { width: 100%; border: none; background: #111; padding: 0; cursor: pointer; position: relative; display: block; }
  .video-facade img { width: 100%; height: auto; display: block; }
  .video-play { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%,-50%); width: 46px; height: 46px; border-radius: 999px; background: rgba(0,0,0,.65); color: #fff; font-size: 22px; line-height: 46px; text-align: center; }
  .video-title { margin: 8px 10px 12px; font-size: 13px; line-height: 1.4; color: var(--ink-2); }
</style>
<script id="fit-video-loader">
  (function() {
    if (window.__fitVideoLoaderBound) return;
    window.__fitVideoLoaderBound = true;
    document.addEventListener('click', function(event) {
      const button = event.target.closest('.video-facade');
      if (!button) return;
      const youtubeId = button.getAttribute('data-youtube-id');
      if (!youtubeId) return;
      const iframe = document.createElement('iframe');
      iframe.width = '560';
      iframe.height = '315';
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.src = 'https://www.youtube.com/embed/' + youtubeId + '?autoplay=1&rel=0';
      iframe.title = 'YouTube video player';
      iframe.style.width = '100%';
      iframe.style.aspectRatio = '16 / 9';
      iframe.style.border = '0';
      button.replaceWith(iframe);
    });
  }());
</script>
<script type="application/ld+json" id="fit-video-schema">
${schemaJson}
</script>
${VIDEO_END}`;
}

function injectVideoSectionIntoHtml(html, block) {
  let next = String(html ?? '');
  const markerPattern = new RegExp(`${VIDEO_START}[\\s\\S]*?${VIDEO_END}\\n?`, 'g');
  next = next.replace(markerPattern, '');
  if (!block) return next;
  if (next.includes('</main>')) {
    return next.replace('</main>', `${block}\n</main>`);
  }
  return `${next}\n${block}\n`;
}

async function injectVideoSchema({
  repoRoot = path.resolve(__dirname, '..'),
  indexPath = path.join(repoRoot, 'pages', 'brands', 'index.json'),
  videosPath = path.join(repoRoot, 'data', 'videos', 'brand-videos.json'),
  logger = console
} = {}) {
  const indexRows = JSON.parse(await readFile(indexPath, 'utf8'));
  const videosDoc = JSON.parse(await readFile(videosPath, 'utf8'));
  const videos = Array.isArray(videosDoc.videos) ? videosDoc.videos : [];

  const videosByBrand = new Map();
  for (const row of videos) {
    const list = videosByBrand.get(row.brandSlug) ?? [];
    list.push(row);
    videosByBrand.set(row.brandSlug, list.slice(0, 3));
  }

  let touched = 0;
  for (const row of indexRows) {
    const pageSlug = row.slug;
    const brandSlug = extractBrandSlugFromPageSlug(pageSlug);
    const pagePath = path.join(repoRoot, 'pages', 'brands', `${pageSlug}.html`);
    const pageHtml = await readFile(pagePath, 'utf8');
    const blockVideos = videosByBrand.get(brandSlug) ?? [];
    const block = blockVideos.length > 0 ? buildVideoBlock({
      videos: blockVideos,
      brandSlug
    }) : '';
    const nextHtml = injectVideoSectionIntoHtml(pageHtml, block);
    if (nextHtml !== pageHtml) {
      await writeFile(pagePath, nextHtml, 'utf8');
      touched += 1;
    }
  }

  logger.log(`[inject-video-schema] updated ${touched} brand pages`);
  return { touched };
}

if (require.main === module) {
  injectVideoSchema().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildVideoBlock,
  injectVideoSchema,
  injectVideoSectionIntoHtml,
  extractBrandSlugFromPageSlug
};
