import { ExternalLink } from 'lucide-react';
import { FacebookEmbed, InstagramEmbed, TikTokEmbed, XEmbed } from 'react-social-media-embed';
import type { TwitterTweetEmbedProps } from 'react-twitter-embed/dist/components/TwitterTweetEmbed';
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from '../utils/socialVideo';

function EmbedPlaceholder() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px 16px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 8 }}>
      <div style={{ width: 22, height: 22, border: '3px solid #2A2F3A', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'social-embed-spin 0.8s linear infinite' }} />
      <style>{`@keyframes social-embed-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function SocialVideoEmbed({ url }: { url: string }) {
  const platform = detectSocialPlatform(url);
  if (!platform) return null;

  const placeholder = <EmbedPlaceholder />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {platform === 'twitter'   && <XEmbed url={url} width="100%" embedPlaceholder={placeholder} twitterTweetEmbedProps={{ options: { theme: 'dark' } } as unknown as TwitterTweetEmbedProps} />}
        {platform === 'facebook'  && <FacebookEmbed url={url} width="100%" embedPlaceholder={placeholder} />}
        {platform === 'instagram' && <InstagramEmbed url={url} width="100%" embedPlaceholder={placeholder} />}
        {platform === 'tiktok'    && <TikTokEmbed url={url} width="100%" embedPlaceholder={placeholder} />}
      </div>
      <a href={url} target="_blank" rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: '0.8rem', textDecoration: 'none' }}>
        Ouvrir sur {SOCIAL_PLATFORM_LABELS[platform]}
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
