import {writeSounds} from './sounds.mjs'
await writeSounds(new URL('../site/download/assets/sounds/',import.meta.url).pathname)
