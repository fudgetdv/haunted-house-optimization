import restart from 'vite-plugin-restart'
import { defineConfig } from 'vite'

export default defineConfig({
    root: 'src/',
    publicDir: '../static/',
    base: process.env.NODE_ENV === 'production' ? '/panorama-tour/' : '/',
    server:
    {
        host: true,
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
    },
    build:
    {
        outDir: '../../dist/panorama-tour',
        emptyOutDir: true,
        sourcemap: true,
    },
    plugins:
    [
        restart({ restart: ['../static/**'] }),
    ],
})
