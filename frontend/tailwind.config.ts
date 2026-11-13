import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#202820', moss: '#64745b', cream: '#f5f3ec', lime: '#d6ec88' } } }, plugins: [] } satisfies Config;
