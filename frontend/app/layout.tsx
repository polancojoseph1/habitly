import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Habitly — become who you practice', description: 'Small actions, stronger identity.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
