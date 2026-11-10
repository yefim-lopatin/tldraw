import blackDot from './v5-symbols/black-dot.svg?raw'
import blackSuccess from './v5-symbols/black-success.svg?raw'
import blackTriumph from './v5-symbols/black-triumph.svg?raw'
import redDot from './v5-symbols/red-dot.svg?raw'
import redSuccess from './v5-symbols/red-success.svg?raw'
import redTriumph from './v5-symbols/red-triumph.svg?raw'
import redUnluck from './v5-symbols/red-unluck.svg?raw'

export function getV5Symbol(result: number, hunger: boolean) {
	if (hunger && result === 1) {
		return redUnluck
	}
	if (result === 10) {
		return hunger ? redTriumph : blackTriumph
	}
	if (result >= 6) {
		return hunger ? redSuccess : blackSuccess
	}
	return hunger ? redDot : blackDot
}

export function getHungerCount(sides: number, count: number, hunger: number) {
	return sides === 10 ? Math.min(count, Math.max(0, Math.min(10, hunger))) : 0
}

export function createV5DieSvg(result: number, hunger: boolean) {
	const raw = getV5Symbol(result, hunger)
	const viewBox = raw
		.match(/viewBox="([^"]+)"/)![1]
		.split(' ')
		.map(Number)
	const scale = Math.min(30 / viewBox[2], 32 / viewBox[3])
	const symbol = raw
		.replace(
			/<svg\b/,
			`<svg x="${32 - (viewBox[2] * scale) / 2}" y="${32 - (viewBox[3] * scale) / 2}"`
		)
		.replace(/width="[^"]*"/, `width="${viewBox[2] * scale}"`)
		.replace(/height="[^"]*"/, `height="${viewBox[3] * scale}"`)
	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M32 4L56 18V46L32 60L8 46V18Z" fill="none" stroke="${hunger ? '#b52025' : '#333333'}" stroke-width="2"/>${symbol}</svg>`
}

export function getV5Result(results: readonly number[], hunger: number, difficulty: number) {
	const tens = results.filter((value) => value === 10).length
	const successes = results.filter((value) => value >= 6).length + Math.floor(tens / 2) * 2
	const hungerDice = results.slice(0, hunger)
	const count = `${successes} ${
		successes % 10 === 1 && successes % 100 !== 11
			? 'успех'
			: successes % 10 >= 2 && successes % 10 <= 4 && (successes % 100 < 12 || successes % 100 > 14)
				? 'успеха'
				: 'успехов'
	}`
	if (difficulty === 0) {
		return `Состязание — ${count}`
	}
	if (successes < difficulty) {
		if (hungerDice.includes(1)) {
			return `Кровавый провал — ${count}`
		}
		return successes === 0 ? 'Нет успехов' : `${count} — провал`
	}
	if (tens >= 2) {
		return `${hungerDice.includes(10) ? 'Кровавый триумф' : 'Прорыв'} — ${count}`
	}
	return count
}
