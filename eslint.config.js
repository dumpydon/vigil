import js from '@eslint/js'
import ts from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import refresh from 'eslint-plugin-react-refresh'

export default ts.config(
  { ignores:['node_modules/**','dist/**','.wrangler/**','output/**','test-results/**','scripts/**','public/sw.js'] },
  js.configs.recommended,...ts.configs.recommended,
  { files:['src/**/*.{ts,tsx}'],plugins:{'react-hooks':hooks,'react-refresh':refresh},rules:{...hooks.configs.recommended.rules,'react-refresh/only-export-components':['warn',{allowConstantExport:true}]} },
  { files:['**/*.{ts,tsx}'],rules:{'@typescript-eslint/no-explicit-any':'error'} },
)
