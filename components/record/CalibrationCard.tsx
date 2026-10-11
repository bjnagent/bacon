import { Brain } from "lucide-react";
import s from "./CalibrationCard.module.css";

// The feedback half of the loop: what the graded calls have taught the desk,
// in the same words the prompts receive. Below the sample threshold the memo is
// deliberately empty (lib/calls.ts keeps noise out of it), so say that and show
// how far along the account is, rather than a blank card.

export function CalibrationCard({ memo, graded, minGraded }: { memo: string; graded: number; minGraded: number }) {
  const ready = !!memo.trim();
  const progress = Math.min(1, minGraded > 0 ? graded / minGraded : 0);
  return (
    <section className={s.card} aria-labelledby="calib-title">
      <div className={s.head}>
        <span className={s.icon} aria-hidden="true"><Brain /></span>
        <div>
          <h2 id="calib-title" className={s.title}>What the desk has learned about itself</h2>
          <p className={s.sub}>
            {ready
              ? `From ${graded} graded call${graded === 1 ? "" : "s"}. Bacon reads this before every brief and analysis.`
              : "Bacon's calibration memo, built from its own graded calls."}
          </p>
        </div>
      </div>
      {ready ? (
        <p className={s.memo}>{memo}</p>
      ) : (
        <div className={s.waiting}>
          <p>
            The memo starts once {minGraded} calls have been graded on direction — below that it would be learning from noise.
            {" "}{graded >= minGraded ? "You're there; it appears after the next grading run." : `${graded} of ${minGraded} so far.`}
          </p>
          <div className={s.meter} role="progressbar" aria-label="Graded calls toward the memo" aria-valuemin={0} aria-valuemax={minGraded} aria-valuenow={Math.min(graded, minGraded)}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
