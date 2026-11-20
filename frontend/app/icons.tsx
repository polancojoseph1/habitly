import type React from 'react';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, React.ReactNode> = {
    chart: <><path d="M4 19.5h16M6 16V10M12 16V5M18 16v-4"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19M16 5.5a3 3 0 0 1 0 5.8M16.5 13a4.5 4.5 0 0 1 4 4.5V19"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="7"/></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></>,
    leaf: <><path d="M20.5 3.5C12 3.5 5 6.4 5 13a6 6 0 0 0 6 6c6.6 0 9.5-7 9.5-15.5Z"/><path d="M3.5 21c3.5-5.5 7-8.5 13-12"/></>,
    heart: <path d="M20.8 8.7c0 5.2-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.7a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><path d="M12 14v3"/></>,
    spark: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    'arrow-up-right': <path d="M5 19 19 5M8 5h11v11"/>,
    'arrow-down-right': <path d="m5 5 14 14M8 19h11V8"/>,
    send: <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z"/><path d="M10 14 21 3"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    grip: <><circle cx="9" cy="6" r="1.25"/><circle cx="15" cy="6" r="1.25"/><circle cx="9" cy="12" r="1.25"/><circle cx="15" cy="12" r="1.25"/><circle cx="9" cy="18" r="1.25"/><circle cx="15" cy="18" r="1.25"/></>,
    check: <path d="m5 12 4.2 4.2L19 6.5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    flame: <path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-4-7-.3 2.2-1.5 3.3-2.5 3.7C12.5 8.5 11 5 8 2c.2 4.4-3 7.3-3 12a7 7 0 0 0 7 8Z"/>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}
