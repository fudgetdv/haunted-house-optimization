import { defineConfig } from 'vite'

export default defineConfig({
    root: 'src/',
    base: process.env.NODE_ENV === 'production' ? '/haunted-room/' : '/',
    server:
    {
        host: true,
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
    },
    build:
    {
        outDir: '../../dist/haunted-room',
        emptyOutDir: true,
        sourcemap: true,
    },
})
