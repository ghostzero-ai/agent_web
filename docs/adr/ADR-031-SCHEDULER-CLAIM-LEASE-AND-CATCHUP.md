# ADR-031：Scheduler Claim、租约与错过任务策略

- 状态：Accepted
- 日期：2026-09-10

## 背景

笔记本可能关机、休眠或重启，未来也可能同时运行多个 Worker。仅靠“查询 `next_run_at <= now` 后执行”会产生重复提醒；永久锁会让崩溃中的任务永远丢失；逐条补齐所有错过时间则可能在开机后制造提醒风暴。

## 决策

1. 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 并发领取到期 Task 和过期 Run。
2. 在同一事务中创建唯一 TaskRun，并推进 Task 的下次时间或完成单次 Task。
3. `(task_id, scheduled_for)` 唯一索引作为竞态和重试的最终幂等防线。
4. `claimed_by`、`attempt` 与 `lease_expires_at` 共同形成 Worker fencing；接管时递增 attempt。
5. start、续租和结束操作必须同时匹配 Worker、attempt、状态及未过期租约。
6. 迟到的重复任务合并为一个补偿 Run，下一计划直接推进到当前时间之后。
7. 用户编辑或暂停 Task 时取消非终态 Run。
8. 调度命令是单次扫描，不在 Web 进程中创建计时循环；常驻执行属于独立 Worker。

## 技术细节

PostgreSQL `timestamptz` 可保存微秒，而 JavaScript `Date` 只有毫秒。真实数据库验收证明，使用往返后的时间相等条件更新 Task 会失配。因此 Task 已加行锁时使用整数 `version` 作为推进护栏；如果推进没有返回记录，抛出错误并回滚整个事务。

## 取舍

- 当前语义是“至少一次扫描、单个有效所有者”，而不是依赖不可恢复的进程内 exactly-once。
- 合并补偿优先保护用户免受通知风暴，不保留每个错过周期的独立 Run。
- 一个 Run 只保存最新 attempt 的租约状态，不保存每次接管的独立明细；如果未来需要完整 attempt 审计，再增加子表，而不提前复杂化。
- 单次命令不会自动提醒用户，但它为 Sprint 2.3 的常驻 Worker 提供了可测试、可迁移的数据库边界。

## 结果

两个真实 PostgreSQL Worker 同时运行时只创建一个 Run；租约过期后第三个 Worker 接管同一个 Run，Run 数量保持 1 且 attempt 递增。该行为不依赖网页是否打开，也不依赖当前部署在笔记本还是云端。
