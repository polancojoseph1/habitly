import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Habitly — small actions, stronger identity',
    short_name: 'Habitly',
    description: 'Build habits that cast a vote for who you are becoming.',
    start_url: '/',
    display: 'standalone',
    background_color: '#11111a',
    theme_color: '#11111a',
  };
}
