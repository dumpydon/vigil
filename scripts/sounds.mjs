import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'

export async function writeSounds(directory){
await mkdir(directory,{recursive:true})
// Original short sine/bell chimes. No reference-app audio is redistributed.
function chime(notes,duration,{decay=6,brightness=.12,gain=.18}={}){
  const rate=44100,frames=Math.ceil(rate*duration),buffer=Buffer.alloc(44+frames*2)
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2,40)
  for(let i=0;i<frames;i++){
    const t=i/rate
    let sample=0
    for(const [frequency,start] of notes){const a=t-start;if(a>=0){const envelope=Math.min(1,a/.015)*Math.exp(-a*decay)*(1-Math.max(0,(t-duration+.12)/.12));sample+=envelope*(Math.sin(2*Math.PI*frequency*a)+brightness*Math.sin(2*Math.PI*frequency*2*a))*gain}}
    buffer.writeInt16LE(Math.round(Math.max(-.9,Math.min(.9,sample))*32767),44+i*2)
  }
  return buffer
}
await writeFile(path.join(directory,'gentle.wav'),chime([[740,0],[987.77,.11]],.75))
await writeFile(path.join(directory,'complete.wav'),chime([[659.25,0],[830.61,.10],[987.77,.20]],1.05))
await writeFile(path.join(directory,'bell.wav'),chime([[523.25,0],[1444.17,0]],1.1,{decay:4.5,brightness:.2,gain:.14}))
await writeFile(path.join(directory,'ripple.wav'),chime([[587.33,0],[783.99,.16],[1174.66,.32]],1.2,{decay:7,brightness:.04}))
await writeFile(path.join(directory,'marimba.wav'),chime([[523.25,0],[659.25,.10],[783.99,.20]],.7,{decay:16,brightness:.34,gain:.23}))
await writeFile(path.join(directory,'stardust.wav'),chime([[1318.51,0],[1661.22,.13],[1975.53,.26],[2637.02,.39]],1.25,{decay:10,brightness:.07,gain:.14}))
}
