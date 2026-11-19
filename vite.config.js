import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' -> derlenen dist/ klasörü herhangi bir alt dizinde (GitHub Pages vb.) çalışır
export default defineConfig({ plugins: [react()], base: './' });
