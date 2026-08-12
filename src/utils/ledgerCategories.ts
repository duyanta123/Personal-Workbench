export const BUILTIN_LEDGER_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '学习', '医疗', '其他'],
  income: ['工资', '奖金', '理财', '其他']
} as const

export type LedgerCategoryKind = keyof typeof BUILTIN_LEDGER_CATEGORIES

const CATEGORY_ALIASES: Record<string, string[]> = {
  餐饮: ['吃饭', '午饭', '晚饭', '早餐', '餐厅', '外卖', '咖啡', '奶茶'],
  交通: ['打车', '出租车', '地铁', '公交', '高铁', '机票', '加油', '停车'],
  购物: ['买', '购买', '网购', '淘宝', '京东'],
  居住: ['房租', '水费', '电费', '燃气', '物业'],
  娱乐: ['电影', '游戏', '演出', '聚会'],
  学习: ['书', '课程', '培训', '考试'],
  医疗: ['医院', '看病', '药', '体检'],
  工资: ['工资', '薪资', '薪水'],
  奖金: ['奖金', '年终奖', '红包'],
  理财: ['利息', '分红', '理财', '收益']
}

export function categoryAliases(category: string) {
  return CATEGORY_ALIASES[category] ?? []
}
