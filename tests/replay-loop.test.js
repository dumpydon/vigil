import {describe,it,expect,vi,afterEach} from 'vitest'
import {createReplayLoop,pageReplayBudget} from '../site/download/replay-loop.js'

afterEach(()=>vi.useRealTimers())
function player(budget={plays:0}){
  const replay=vi.fn(()=>loop.begin())
  const loop=createReplayLoop({budget,replay,now:()=>Date.now()})
  return {loop,replay}
}
describe('bounded download-page replay',()=>{
  it('waits five full seconds, includes the initial play, and never starts a sixth automatic play',()=>{
    vi.useFakeTimers()
    const {loop,replay}=player();loop.begin()
    for(let play=1;play<5;play++){
      expect(loop.plays).toBe(play);loop.finish()
      vi.advanceTimersByTime(4999);expect(replay).toHaveBeenCalledTimes(play-1)
      vi.advanceTimersByTime(1);expect(replay).toHaveBeenCalledTimes(play)
    }
    loop.finish();vi.advanceTimersByTime(60_000)
    expect(loop.plays).toBe(5);expect(replay).toHaveBeenCalledTimes(4);expect(loop.waiting).toBe(false)
  })
  it('cancels an upcoming replay when the user pauses or selects a step',()=>{
    vi.useFakeTimers()
    const {loop,replay}=player();loop.begin();loop.finish()
    vi.advanceTimersByTime(2000);loop.cancel();vi.advanceTimersByTime(10_000)
    expect(replay).not.toHaveBeenCalled();expect(loop.waiting).toBe(false)
  })
  it('preserves the remaining break while the page is hidden',()=>{
    vi.useFakeTimers()
    const {loop,replay}=player();loop.begin();loop.finish()
    vi.advanceTimersByTime(2000);loop.setEnabled(false);vi.advanceTimersByTime(30_000)
    expect(replay).not.toHaveBeenCalled()
    loop.setEnabled(true);vi.advanceTimersByTime(2999);expect(replay).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1);expect(replay).toHaveBeenCalledOnce()
  })
  it('replaces a pending timer on manual replay without renewing the five-play allowance',()=>{
    vi.useFakeTimers()
    const {loop,replay}=player();loop.begin();loop.finish();vi.advanceTimersByTime(2000)
    loop.begin();vi.advanceTimersByTime(5000);expect(replay).not.toHaveBeenCalled()
    for(let i=0;i<10;i++)loop.begin()
    loop.finish();vi.advanceTimersByTime(10_000)
    expect(loop.plays).toBe(5);expect(replay).not.toHaveBeenCalled()
  })
  it('shares a budget with recreated same-origin frames and resets on a new top-level document',()=>{
    const root={location:{origin:'https://vigil.example'}};root.parent=root
    const child={location:root.location,parent:root}
    const nested={location:root.location,parent:child}
    const budget=pageReplayBudget(child,'install');budget.plays=4
    expect(pageReplayBudget(nested,'install')).toBe(budget)
    expect(pageReplayBudget({location:root.location,parent:root},'install').plays).toBe(4)
    expect(pageReplayBudget(root,'hero').plays).toBe(0)
    const refreshed={location:root.location};refreshed.parent=refreshed
    expect(pageReplayBudget(refreshed,'install').plays).toBe(0)
  })
  it('does not exceed the shared cap when two frames finish together',()=>{
    vi.useFakeTimers()
    const budget={plays:4},a=player(budget),b=player(budget)
    a.loop.finish();b.loop.finish();vi.advanceTimersByTime(5000)
    expect(a.replay.mock.calls.length+b.replay.mock.calls.length).toBe(1)
    expect(budget.plays).toBe(5)
  })
})
