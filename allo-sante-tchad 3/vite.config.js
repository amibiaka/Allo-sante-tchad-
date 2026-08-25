import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build`             -> site normal (dist/)
// `vite build --mode demo` -> un seul fichier, pour la demo hors ligne
export default defineConfig(({ mode }) => {
  const fichierUnique = mode === 'demo'

  return {
    plugins: [react()],
    // base relative : le site fonctionne a la racine, dans un sous-dossier,
    // ou depuis un fichier local. Le routeur est en mode "hash" pour la
    // meme raison (aucune configuration serveur necessaire).
    base: './',

    // --- Mode ultra-leger (facultatif) --------------------------------
    // Preact remplace React a l'identique et fait tomber le socle de
    // ~45 Ko a ~5 Ko une fois compresse : sur un forfait 2G, c'est
    // plusieurs secondes gagnees a la premiere visite.
    // Pour l'activer : `npm i preact` puis decommentez ces 6 lignes.
    // resolve: {
    //   alias: {
    //     react: 'preact/compat',
    //     'react-dom': 'preact/compat',
    //     'react/jsx-runtime': 'preact/jsx-runtime',
    //   },
    // },

    build: {
      outDir: fichierUnique ? 'dist-demo-tmp' : 'dist',
      target: ['es2018', 'chrome70', 'firefox78', 'safari12'],
      cssCodeSplit: false,
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true, drop_debugger: true, passes: 2 },
      },
      rollupOptions: {
        output: fichierUnique
          ? {
              // Tout dans un seul fichier : indispensable pour la demo
              // autonome (pas de reseau, pas de serveur).
              inlineDynamicImports: true,
              entryFileNames: 'app.js',
              assetFileNames: 'app.[ext]',
            }
          : {
              // Un socle minuscule pour l'accueil ; chaque page est
              // chargee a la demande.
              manualChunks(id) {
                if (id.includes('node_modules')) return 'socle'
              },
            },
      },
      chunkSizeWarningLimit: 250,
    },

    server: { host: true, port: 5173 },
  }
})
