export type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'tiktok';

export function detectSocialPlatform(url: string): SocialPlatform | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '');
    if (host === 'twitter.com' || host === 'x.com') return 'twitter';
    if (host === 'facebook.com' || host === 'fb.watch' || host === 'm.facebook.com') return 'facebook';
    if (host === 'instagram.com') return 'instagram';
    if (host === 'tiktok.com' || host === 'vm.tiktok.com') return 'tiktok';
    return null;
  } catch {
    return null;
  }
}

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  twitter: 'Twitter/X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};
