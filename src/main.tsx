import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './desktop/desktop.css'
import {isDesktop,isDesktopPreview,isCompactSurface} from './desktop/bridge'
import Dashboard from './Dashboard'
import {engine} from './data/store'
import {timePreferences} from './data/time-preferences'

if(isDesktop)document.documentElement.classList.add('desktop')
if(isDesktopPreview)document.documentElement.classList.add('desktop-preview')
if(isCompactSurface)document.documentElement.classList.add('desktop-compact')
if(window.__APPLY_VIGIL_NATIVE__?.testing){
  Object.assign(window,{__applyVigilTest:{state:engine.getState,timePreferences:timePreferences.getSnapshot,setTimePreferences:(value:import('./utils/time').TimePreferences)=>timePreferences.save(value),log:(easy:number,external:number)=>engine.createEntry(easy,external),draft:(value:unknown)=>engine.saveDraft(value),sync:()=>engine.sync(),recover:(backup:import('../shared/model').Backup)=>engine.recoverLocalHistory(backup)}})
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Dashboard /></React.StrictMode>)
