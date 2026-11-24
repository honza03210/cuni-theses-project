import { mount } from 'svelte'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import './app.css'
import Playground from './playground/Playground.svelte'

export default mount(Playground, { target: document.getElementById('app')! })
