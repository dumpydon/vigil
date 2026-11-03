import {describe,expect,it} from 'vitest'
import {analytics,easyApplyStreak,FIRST_DAY,shiftDay,type Entry,type Snapshot} from '../shared/model'

const today='2026-11-02'
const entry=(date:string,easy:number,external=0):Entry=>({id:crypto.randomUUID(),date,easy,external,loggedAt:`${date}T12:00:00.000Z`,createdAt:`${date}T12:00:00.000Z`,updatedAt:`${date}T12:00:00.000Z`,version:1,deleted:false,backdated:false})
const snapshot=(entries:Entry[]):Snapshot=>({entries,trackingStart:shiftDay(today,-100),policies:[{date:FIRST_DAY,value:75}],overrides:[],revision:1,goalRevision:0,serverNow:`${today}T12:00:00.000Z`})

describe('20 Easy Apply applications per day streak',()=>{
  it.each([[0,0],[10,.5],[12,.6],[15,.75],[19,.95],[20,1],[21,1],[100,1]])('fills the ring for %i Easy Apply applications', (easy,fraction)=>{
    expect(easyApplyStreak(snapshot([entry(today,easy)]),today)).toMatchObject({todayEasy:easy,target:20,fraction,reached:easy>=20,days:easy>=20?1:0})
  })
  it('keeps seven completed days while today is at 12, then counts the eighth day at exactly 20',()=>{
    const previous=Array.from({length:7},(_,i)=>entry(shiftDay(today,-i-1),20))
    expect(easyApplyStreak(snapshot([...previous,entry(today,12)]),today)).toMatchObject({days:7,todayEasy:12,fraction:.6,reached:false})
    expect(easyApplyStreak(snapshot([...previous,entry(today,20)]),today)).toMatchObject({days:8,todayEasy:20,fraction:1,reached:true})
  })
  it('ignores external applications and the combined daily goal when qualifying dates',()=>{
    const data=snapshot([entry(shiftDay(today,-2),20),entry(shiftDay(today,-1),20),entry(today,19,100)])
    data.overrides=[{date:today,value:1},{date:shiftDay(today,-1),value:1000}]
    expect(easyApplyStreak(data,today)).toMatchObject({days:2,todayEasy:19,reached:false})
    expect(analytics(data,7,today).streak).toBe(2)
    data.entries[data.entries.length-1].easy=20
    expect(easyApplyStreak(data,today).days).toBe(3)
    expect(analytics(data,30,today).streak).toBe(3)
  })
  it('breaks on a missing or 19-Easy day, while a qualifying today starts a fresh streak',()=>{
    const data=snapshot([entry(shiftDay(today,-3),20),entry(shiftDay(today,-2),19,200),entry(shiftDay(today,-1),20),entry(today,15)])
    expect(easyApplyStreak(data,today).days).toBe(1)
    data.entries=data.entries.filter(e=>e.date!==shiftDay(today,-1))
    expect(easyApplyStreak(data,today).days).toBe(0)
    data.entries.push(entry(today,5))
    expect(easyApplyStreak(data,today).days).toBe(1)
  })
  it('sums multiple entries, ignores deleted records, and recalculates after undo or historical edits',()=>{
    const data=snapshot([entry(shiftDay(today,-1),20),entry(today,10,5),entry(today,10),{...entry(today,100),deleted:true}])
    const before=structuredClone(data)
    expect(easyApplyStreak(data,today)).toMatchObject({days:2,todayEasy:20})
    expect(data).toEqual(before)
    data.entries[2].deleted=true
    expect(easyApplyStreak(data,today)).toMatchObject({days:1,todayEasy:10,fraction:.5})
    data.entries[0].easy=19
    expect(easyApplyStreak(data,today).days).toBe(0)
  })
  it('uses assigned application dates for backdated counts and preserves today’s progress across future records',()=>{
    const data=snapshot([{...entry(shiftDay(today,-1),20),loggedAt:`${today}T12:00:00.000Z`,backdated:true},entry(today,12),entry(shiftDay(today,1),500)])
    expect(easyApplyStreak(data,today)).toMatchObject({days:1,todayEasy:12,fraction:.6})
  })
  it('retains streaks longer than the displayed chart and handles rollover at month/year boundaries',()=>{
    const day='2027-01-01',data=snapshot(Array.from({length:45},(_,i)=>entry(shiftDay(day,-i-1),20)))
    data.trackingStart=shiftDay(day,-45)
    expect(easyApplyStreak(data,day).days).toBe(45)
    expect(analytics(data,7,day).streak).toBe(45)
    data.entries.push(entry(day,20))
    expect(easyApplyStreak(data,day).days).toBe(46)
    expect(easyApplyStreak(data,shiftDay(day,1))).toMatchObject({days:46,todayEasy:0,fraction:0})
    expect(easyApplyStreak(data,shiftDay(day,2)).days).toBe(0)
  })
})
