import type { MetadataRoute } from 'next';

/** The app shell and the API are not content; everything else is fair game. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/login'] },
  };
}
