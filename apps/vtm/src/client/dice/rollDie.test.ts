import { describe, expect, it } from 'vitest'
import { DICE_SIDES } from '../../shared/dice'
import { rollDie } from './DiceRoller'

describe('Мгновенные броски без объёмной анимации', () => {
	it.each(DICE_SIDES)('возвращает допустимое значение для d%i', (sides) => {
		for (let i = 0; i < 30; i++) {
			const result = rollDie(sides)
			expect(Number.isInteger(result)).toBe(true)
			expect(result).toBeGreaterThanOrEqual(1)
			expect(result).toBeLessThanOrEqual(sides)
		}
	})
	it.each([0, 1, -2, 2.5, NaN, Infinity])('отклоняет неверное число граней %s', (sides) => {
		expect(() => rollDie(sides)).toThrow()
	})
})
