import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
	plugins: [viteSingleFile()],
    build: {
        outDir: "../src/assets",
        emptyOutDir: false,
        rollupOptions: {
            input: {
                app: './app.html'
            }
        }
    }
})
