'use strict';

const { escHtml } = require('./html-head.js');
const { fillTemplate } = require('./copy-data.js');
const { buildYouTubeWatchUrl } = require('../validate-reviews.js');

function toIsoDuration(durationSec) {
  const total = Math.max(0, Number(durationSec) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${minutes}M${seconds}S`;
}

function selectDisclaimerTemplate({ creator, disclaimerCopy }) {
  const tier = String(creator?.trustTier ?? '').trim().toUpperCase();
  const templateKey = tier === 'B' ? 'tierB' : tier === 'M' ? 'tierM' : 'tierA';
  return fillTemplate(disclaimerCopy?.[templateKey] ?? '', {
    creator: creator?.displayName ?? ''
  });
}

function buildVideoObject(review, creator) {
  return {
    '@type': 'VideoObject',
    name: review.title,
    description: `${creator.displayName} review of ${review.title}`,
    thumbnailUrl: review?.oembed?.thumbnail_url ?? `https://i.ytimg.com/vi/${review.youtubeId}/hqdefault.jpg`,
    contentUrl: buildYouTubeWatchUrl(review.youtubeId),
    embedUrl: `https://www.youtube-nocookie.com/embed/${review.youtubeId}`,
    uploadDate: review.publishedAt,
    duration: toIsoDuration(review.durationSec),
    creator: {
      '@type': 'Person',
      name: creator.displayName
    }
  };
}

function buildTimestampLinks(review) {
  return (Array.isArray(review.timestamps) ? review.timestamps : []).slice(0, 3).map((stamp) => {
    const seconds = Math.max(0, Number(stamp?.t) || 0);
    const url = `${buildYouTubeWatchUrl(review.youtubeId)}&t=${seconds}s`;
    return `<a class="review-video-timestamp" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(stamp.label)}</a>`;
  }).join('');
}

function buildReviewVideoSection({
  modelSlug,
  reviews,
  whitelistDocument,
  disclaimerCopy,
  pilotSlugs
} = {}) {
  const pilotSet = new Set(Array.isArray(pilotSlugs) ? pilotSlugs : []);
  if (!pilotSet.has(modelSlug)) return '';

  const creators = new Map((whitelistDocument?.creators ?? []).map((creator) => [creator.id, creator]));
  const validReviews = (Array.isArray(reviews) ? reviews : [])
    .filter((review) => review && review.validatedAt && creators.has(review.creatorId))
    .slice(0, 2);

  if (validReviews.length === 0) return '';

  const cards = validReviews.map((review) => {
    const creator = creators.get(review.creatorId);
    const disclaimer = selectDisclaimerTemplate({ creator, disclaimerCopy });
    const thumbnail = review?.oembed?.thumbnail_url ?? `https://i.ytimg.com/vi/${review.youtubeId}/hqdefault.jpg`;
    return `<article class="review-video-card">
      <button class="review-video-facade" type="button" data-youtube-id="${escHtml(review.youtubeId)}" aria-label="Play ${escHtml(review.title)}">
        <img src="${escHtml(thumbnail)}" alt="${escHtml(review.title)} thumbnail" loading="lazy" decoding="async">
        <span class="review-video-play">▶</span>
      </button>
      <div class="review-video-copy">
        <div class="review-video-kicker">${escHtml(creator.displayName)}</div>
        <h3>${escHtml(review.title)}</h3>
        <div class="review-video-timestamps">${buildTimestampLinks(review)}</div>
        <p class="review-video-disclaimer">${escHtml(disclaimer)}</p>
      </div>
    </article>`;
  }).join('\n');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': validReviews.map((review) => buildVideoObject(review, creators.get(review.creatorId)))
  };

  return `<!-- fit-review-video:start -->
<section id="review-videos" class="review-videos" data-review-model-slug="${escHtml(modelSlug)}">
  <h2>Independent reviews</h2>
  <p class="review-videos-intro">Watch two outside perspectives on this model before you lock in the cavity size.</p>
  <div class="review-video-grid">
${cards}
  </div>
</section>
<style id="fit-review-video-style">
  .review-videos { margin: 30px 0 18px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--white); }
  .review-videos h2 { margin: 0 0 10px; font-size: 20px; color: var(--ink); font-family: 'Instrument Serif', serif; }
  .review-videos-intro { margin: 0 0 14px; font-size: 14px; color: var(--ink-2); }
  .review-video-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .review-video-card { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; }
  .review-video-facade { width: 100%; border: none; background: #111; padding: 0; cursor: pointer; position: relative; display: block; }
  .review-video-facade img { width: 100%; height: auto; display: block; }
  .review-video-play { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%,-50%); width: 46px; height: 46px; border-radius: 999px; background: rgba(0,0,0,.65); color: #fff; font-size: 22px; line-height: 46px; text-align: center; }
  .review-video-copy { padding: 12px; }
  .review-video-kicker { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
  .review-video-copy h3 { margin: 6px 0 8px; font-size: 15px; line-height: 1.4; color: var(--ink); font-family: 'Outfit', sans-serif; }
  .review-video-timestamps { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .review-video-timestamp { font-size: 12px; color: var(--copper); text-decoration: none; font-weight: 600; }
  .review-video-timestamp:hover { text-decoration: underline; }
  .review-video-disclaimer { margin: 0; font-size: 12px; line-height: 1.5; color: var(--ink-3); }
</style>
<script id="fit-review-video-loader">
  (function() {
    if (window.__fitReviewVideoLoaderBound) return;
    window.__fitReviewVideoLoaderBound = true;
    document.addEventListener('click', function(event) {
      const button = event.target.closest('.review-video-facade');
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
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + youtubeId + '?autoplay=1&rel=0';
      iframe.title = 'YouTube review video player';
      iframe.style.width = '100%';
      iframe.style.aspectRatio = '16 / 9';
      iframe.style.border = '0';
      button.replaceWith(iframe);
    });
  }());
</script>
<script type="application/ld+json" id="fit-review-video-schema">${JSON.stringify(schema)}</script>
<!-- fit-review-video:end -->`;
}

module.exports = {
  buildReviewVideoSection,
  selectDisclaimerTemplate,
  toIsoDuration
};
