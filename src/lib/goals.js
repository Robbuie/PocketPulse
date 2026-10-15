// Savings goals: how much is saved, how much is left, and what it takes per
// month and per paycheck to get there by the target date.
import { checksPerMonth } from './income';

const DAY = 86400000;

// Months left to save in, counting this one: Oct 14 to Dec 15 is three
// (October, November, and December up to the 15th); Oct 14 to Nov 1 is one.
// Never less than one: a goal due now still needs its money now.
export function monthsUntil(targetDate, now = new Date()) {
  if (!targetDate) return null;
  const t = new Date(`${targetDate}T00:00:00`);
  const months = (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
  return Math.max(1, months + (t.getDate() >= now.getDate() ? 1 : 0));
}

export function goalProgress(goal, entries, incomeSources = [], now = new Date()) {
  const mine = (entries || []).filter((e) => e.goal_id === goal.id);
  const saved = Math.round(mine.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) * 100) / 100;
  const target = parseFloat(goal.target_amount) || 0;
  const left = Math.max(0, target - saved);
  const months = monthsUntil(goal.target_date, now);
  const overdue = goal.target_date ? new Date(`${goal.target_date}T00:00:00`) < new Date(now.getTime() - DAY) : false;
  const perMonth = months && left > 0 ? left / months : 0;
  const checks = (incomeSources || []).reduce((s, src) => s + checksPerMonth(src.frequency || 'biweekly'), 0);
  return {
    saved,
    target,
    left,
    share: target > 0 ? Math.min(1, saved / target) : 0,
    months,
    perMonth,
    perPaycheck: checks > 0 && perMonth > 0 ? perMonth / checks : null,
    done: target > 0 && saved >= target,
    overdue: overdue && left > 0,
  };
}

// What all active goals need each month together.
export function goalsMonthlyNeed(goals, entries, incomeSources, now = new Date()) {
  return (goals || [])
    .filter((g) => g.status === 'active')
    .reduce((s, g) => s + goalProgress(g, entries, incomeSources, now).perMonth, 0);
}
