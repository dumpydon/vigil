export const SOUND_OPTIONS=[
  {value:'soft',label:'Soft chime'},
  {value:'glass',label:'macOS Glass'},
  {value:'bell',label:'Bell'},
  {value:'ripple',label:'Ripple'},
  {value:'marimba',label:'Marimba'},
  {value:'stardust',label:'Stardust'},
  {value:'none',label:'Silent'},
] as const
export type AlertSound=typeof SOUND_OPTIONS[number]['value']
