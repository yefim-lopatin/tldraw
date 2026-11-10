import { describe, expect, it } from 'vitest'
import { createV5DieSvg, getHungerCount, getV5Result } from './v5Dice'

describe('Правила бросков из Excalidraw', () => {
	it.each<[number[], number, number, string]>([
		[[2, 5], 1, 0, 'Состязание — 0 успехов'],
		[[1, 6], 1, 0, 'Состязание — 1 успех'],
		[[10, 10], 1, 0, 'Состязание — 4 успеха'],
		[[2, 5], 1, 1, 'Нет успехов'],
		[[1, 6], 1, 2, 'Кровавый провал — 1 успех'],
		[[1, 6], 1, 1, '1 успех'],
		[[6, 3], 0, 2, '1 успех — провал'],
		[[10, 10], 0, 4, 'Прорыв — 4 успеха'],
		[[10, 10], 1, 4, 'Кровавый триумф — 4 успеха'],
		[[10, 10], 1, 5, '4 успеха — провал'],
		[[10, 10, 10], 1, 1, 'Кровавый триумф — 5 успехов'],
	])(
		'сохраняет результат %j при Голоде %i и сложности %i',
		(results, hunger, difficulty, expected) => {
			expect(getV5Result(results, hunger, difficulty)).toBe(expected)
		}
	)
	it('заменяет обычные d10 и ограничивает Голод размером броска', () => {
		expect(getHungerCount(10, 3, 10)).toBe(3)
		expect(getHungerCount(6, 3, 2)).toBe(0)
		expect(getHungerCount(10, 20, 12)).toBe(10)
	})
	it('сохраняет красный цвет и шестигранник символов Голода', () => {
		expect(createV5DieSvg(1, true)).toContain('#b52025')
		expect(createV5DieSvg(10, false)).toContain('M32 4L56 18V46L32 60L8 46V18Z')
	})
})
