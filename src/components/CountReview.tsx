export interface DayCounts {date:string;easy:number;external:number}
export default function CountReview({before,after,busy,error,onBack,onConfirm}:{before:DayCounts[];after:DayCounts[];busy:boolean;error:string;onBack:()=>void;onConfirm:()=>void}){
  return <div className="count-review">
    <h3>Double-check this past-day change</h3>
    <p className="form-note">Review the UTC date and category totals before saving. This changes your history and recalculates progress and streaks.</p>
    {before.map((old,i)=>{const next=after[i];return <section key={old.date} aria-label={`Changes for ${old.date} UTC`}>
      <strong>{old.date} · UTC</strong>
      <table><thead><tr><th>Applications</th><th>Before</th><th>After</th></tr></thead><tbody>
        <tr><th>Easy Apply</th><td>{old.easy.toLocaleString()}</td><td>{next.easy.toLocaleString()}</td></tr>
        <tr><th>External / form</th><td>{old.external.toLocaleString()}</td><td>{next.external.toLocaleString()}</td></tr>
        <tr className="review-total"><th>Total</th><td>{(old.easy+old.external).toLocaleString()}</td><td>{(next.easy+next.external).toLocaleString()}</td></tr>
      </tbody></table>
    </section>})}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" disabled={busy} onClick={onBack}>Back to edit</button><button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>{busy?'Retaining…':'Confirm past-day change'}</button></div>
  </div>
}
