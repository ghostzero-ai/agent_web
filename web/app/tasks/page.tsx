import { AppShell } from "@/components/ui/AppShell";
import { TaskManager } from "@/components/tasks/TaskManager";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <AppShell route="/tasks" title="任务与提醒" description="把要做的事交给时间，把注意力留给现在。">
      <TaskManager />
    </AppShell>
  );
}
