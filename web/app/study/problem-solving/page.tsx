import { AppShell } from "@/components/ui/AppShell";
import { ProblemSolvingActivity } from "@/components/problemSolving/ProblemSolvingActivity";

export const dynamic = "force-dynamic";

export default function ProblemSolvingPage() {
  return (
    <AppShell route="/study/problem-solving" title="解题训练" description="输入题目 → 选择策略 → 分析 → 错因与复习。">
      <ProblemSolvingActivity />
    </AppShell>
  );
}
