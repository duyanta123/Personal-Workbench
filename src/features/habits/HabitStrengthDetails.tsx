import type { HabitStrengthRow } from '../../utils/habitStrength'

export default function HabitStrengthDetails({ strength }: { strength: HabitStrengthRow }) {
  return (
    <details className="mt-3 rounded-xl bg-nested px-3 py-2 text-xs">
      <summary className="cursor-pointer list-none font-medium text-ink-2">
        习惯强度：{strength.score === null ? '积累中' : `${strength.score} 分 · ${strength.band === 'strong' ? '强劲' : strength.band === 'stable' ? '稳定' : '需关注'}`}
      </summary>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-ink-3">
        <span>机会完成率<br /><b className="text-ink">{strength.completionRate}%</b></span>
        <span>连续机会<br /><b className="text-ink">{strength.currentStreak} 次</b></span>
        <span>近 7 次机会<br /><b className="text-ink">{strength.recentRate}%</b></span>
      </div>
      {strength.score === null && <p className="mt-2 text-ink-3">记录满 3 个有效观察日后生成评分。</p>}
    </details>
  )
}
