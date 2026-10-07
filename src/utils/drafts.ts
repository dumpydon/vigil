import type { Entry } from '../../shared/model'
import type { EntryDraft } from '../components/EntryForm'
export function draftFor(entry:Entry):EntryDraft{return {kind:'entry',category:'mixed',date:entry.date,easy:String(entry.easy),external:String(entry.external),entryId:entry.id,version:entry.version}}
