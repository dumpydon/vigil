import { describe,expect,it } from 'vitest'
import { progressTone } from '../src/utils/progress'

describe('remaining-percentage color bands',()=>{
  it.each([
    [100,'deep-red'],[80,'deep-red'],[79,'red'],[60,'red'],[59,'amber'],
    [40,'amber'],[39,'light-green'],[20,'light-green'],[19,'green'],[0,'green'],
  ] as const)('uses the correct band at %s%% left',(percentage,tone)=>expect(progressTone(percentage)).toBe(tone))
  it('keeps the color consistent with the rounded text at boundaries',()=>{
    expect(progressTone(79.6)).toBe('deep-red')
    expect(progressTone(79.4)).toBe('red')
    expect(progressTone(19.6)).toBe('light-green')
    expect(progressTone(19.4)).toBe('green')
  })
  it('keeps the requested 16-of-75 example red and 19% left bright green',()=>{
    expect(progressTone(59/75*100)).toBe('red')
    expect(progressTone(14/75*100)).toBe('green')
  })
})
