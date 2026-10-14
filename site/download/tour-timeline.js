export const TOUR_DURATION=30
export const SCENE_DURATION=6

// One clock supplies both the player and its sample UI, including chapter jumps.
export function tourFrameAt(seconds){
  const elapsed=Math.max(0,Math.min(TOUR_DURATION,seconds))
  const index=Math.min(4,Math.floor(elapsed/SCENE_DURATION))
  const time=elapsed-index*SCENE_DURATION
  const easy=elapsed<.7?26:elapsed<3.3?27:elapsed<8.1?32:35
  const external=elapsed<2?12:elapsed<6.7?14:16
  return {elapsed,index,time,easy,external,total:easy+external,ended:elapsed===TOUR_DURATION}
}

export function createTourClock(now=()=>performance.now()){
  let position=0,anchor=0,playing=false
  function snapshot(){
    const frame=tourFrameAt(position+(playing?Math.max(0,now()-anchor)/1000:0))
    if(frame.ended){position=TOUR_DURATION;playing=false}
    return {...frame,playing}
  }
  return {
    snapshot,
    play(){position=snapshot().elapsed;if(position===TOUR_DURATION)position=0;anchor=now();playing=true;return snapshot()},
    pause(){position=snapshot().elapsed;playing=false;return snapshot()},
    seek(seconds){if(!Number.isFinite(seconds))throw new TypeError('Tour time must be finite.');position=Math.max(0,Math.min(TOUR_DURATION,seconds));anchor=now();return snapshot()},
    replay(){position=0;anchor=now();playing=true;return snapshot()},
  }
}
