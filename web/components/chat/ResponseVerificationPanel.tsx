import type {
  ResponseVerification,
  VerificationCheckStatus,
} from "@/lib/ai/messages";

const STATUS_LABEL: Record<VerificationCheckStatus, string> = {
  pass: "通过",
  warning: "需复核",
  fail: "未通过",
  "not-applicable": "不适用",
};

const STATUS_ICON: Record<VerificationCheckStatus, string> = {
  pass: "✓",
  warning: "!",
  fail: "×",
  "not-applicable": "–",
};

const PANEL_STYLE: Record<ResponseVerification["status"], string> = {
  pass: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
  warning: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20",
  fail: "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20",
};

const SUMMARY_STYLE: Record<ResponseVerification["status"], string> = {
  pass: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-800 dark:text-amber-300",
  fail: "text-red-700 dark:text-red-400",
};

export function ResponseVerificationPanel({
  verification,
}: {
  verification: ResponseVerification;
}) {
  return (
    <details
      open={verification.status !== "pass"}
      className={`mt-4 rounded-lg border px-3 py-2 ${PANEL_STYLE[verification.status]}`}
    >
      <summary
        className={`cursor-pointer text-xs font-medium ${SUMMARY_STYLE[verification.status]}`}
      >
        回答规则检查：{verification.summary}
      </summary>
      <div className="mt-3 space-y-2">
        {verification.checks.map((check) => (
          <div key={check.id} className="text-xs leading-5">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">{STATUS_ICON[check.status]}</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {check.label}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {STATUS_LABEL[check.status]}
              </span>
            </div>
            <p className="pl-5 text-zinc-500 dark:text-zinc-400">
              {check.detail}
            </p>
          </div>
        ))}
        <p className="border-t border-black/5 pt-2 text-[11px] leading-4 text-zinc-500 dark:border-white/10 dark:text-zinc-500">
          {verification.limitations.join(" ")}
        </p>
      </div>
    </details>
  );
}
