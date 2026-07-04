import { FacebookEmbed, InstagramEmbed, TikTokEmbed, XEmbed } from 'react-social-media-embed';
import { detectSocialPlatform } from '../utils/socialVideo';

export function SocialVideoEmbed({ url }: { url: string }) {
  const platform = detectSocialPlatform(url);
  if (!platform) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {platform === 'twitter'   && <XEmbed url={url} width="100%" />}
        {platform === 'facebook'  && <FacebookEmbed url={url} width="100%" />}
        {platform === 'instagram' && <InstagramEmbed url={url} width="100%" />}
        {platform === 'tiktok'    && <TikTokEmbed url={url} width="100%" />}
      </div>
    </div>
  );
}
