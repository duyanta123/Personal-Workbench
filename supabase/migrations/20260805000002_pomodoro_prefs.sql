-- ============================================================
-- 个人工作台 · 番茄钟偏好
-- 用户偏好表增加 pomodoro jsonb 字段（专注/短休/长休时长、长休轮次阈值）
-- ============================================================

alter table public.user_preferences add column if not exists pomodoro jsonb not null
  default '{"focus": 25, "break": 5, "long_break": 15, "rounds_per_cycle": 4}'::jsonb;
