export default [{
  ignores: ['node_modules/**', 'data/**', 'temp/**', 'logs/**'],
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: Object.fromEntries([
    'console','process','Buffer','setTimeout','clearTimeout','setInterval','clearInterval','globalThis',
    'URL','URLSearchParams','AbortController','AbortSignal','fetch','document','window','FileReader','navigator',
    'crypto','performance','structuredClone','TextDecoder','TextEncoder'
  ].map(name => [name, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-constant-condition': ['error', { checkLoops: false }] }
}]
