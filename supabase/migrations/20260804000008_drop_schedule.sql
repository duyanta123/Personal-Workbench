-- ============================================================
-- 个人工作台 · 移除课表管理模块（回滚 20260804000007_schedule.sql）
-- ============================================================

drop table if exists public.exams;
drop table if exists public.assignments;
drop table if exists public.course_slots;
drop table if exists public.courses;
