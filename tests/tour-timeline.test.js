import {describe,it,expect} from 'vitest'
import {createTourClock,tourFrameAt} from '../site/download/tour-timeline.js'

describe('30-second product tour playback',()=>{
  it('uses elapsed time rather than timer tick counts and stops exactly at 30 seconds',()=>{
    let now=0
    const clock=createTourClock(()=>now)
    clock.play();now=12_350
    const frame=clock.snapshot()
    expect(frame.elapsed).toBeCloseTo(12.35);expect(frame.time).toBeCloseTo(.35)
    expect(frame).toMatchObject({index:2,playing:true})
    now=32_000
    expect(clock.snapshot()).toMatchObject({elapsed:30,index:4,time:6,ended:true,playing:false})
    now=95_000;expect(clock.snapshot().elapsed).toBe(30)
  })
  it('freezes the complete story on pause and resumes without counting the paused time',()=>{
    let now=0
    const clock=createTourClock(()=>now)
    clock.play();now=3_500;const paused=clock.pause()
    now=20_000;expect(clock.snapshot()).toEqual(paused)
    clock.play();now=21_000
    expect(clock.snapshot()).toMatchObject({elapsed:4.5,index:0,playing:true,total:46})
  })
  it('jumps to chapter boundaries without changing the paused or playing state',()=>{
    let now=0
    const clock=createTourClock(()=>now)
    expect(clock.seek(18)).toMatchObject({index:3,time:0,playing:false})
    now=5_000;expect(clock.snapshot().elapsed).toBe(18)
    clock.play();clock.seek(6);now=5_900
    expect(clock.snapshot().elapsed).toBeCloseTo(6.9)
    expect(clock.snapshot()).toMatchObject({index:1,playing:true})
    expect(clock.seek(100)).toMatchObject({elapsed:30,index:4,playing:false})
    expect(()=>clock.seek(Infinity)).toThrow('finite')
  })
  it('replays from the original counts and keeps totals continuous between Today and Compact',()=>{
    expect(tourFrameAt(5.99).total).toBe(46);expect(tourFrameAt(6).total).toBe(46)
    expect(tourFrameAt(11.99).total).toBe(51);expect(tourFrameAt(12).total).toBe(51)
    let now=0
    const clock=createTourClock(()=>now)
    clock.play();now=30_000;expect(clock.snapshot().ended).toBe(true)
    expect(clock.replay()).toMatchObject({elapsed:0,index:0,total:38,playing:true})
  })
})
