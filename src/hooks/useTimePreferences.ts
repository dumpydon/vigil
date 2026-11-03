import {useEffect,useSyncExternalStore} from 'react'
import {timePreferences} from '../data/time-preferences'

export default function useTimePreferences(){
  const preferences=useSyncExternalStore(timePreferences.subscribe,timePreferences.getSnapshot)
  useEffect(()=>{void timePreferences.init()},[])
  return preferences
}
