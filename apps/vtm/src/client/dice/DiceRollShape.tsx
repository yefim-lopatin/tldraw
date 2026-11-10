import { BaseBoxShapeUtil, SVGContainer } from 'tldraw'
import { diceRollProps, type DiceRollShape, type Roll } from '../../shared/dice'
import { createDieSvg, getDieDimensions } from './diceSvg'
import { createV5DieSvg, getV5Result } from './v5Dice'

export function rollSize(roll: Pick<Roll, 'sides' | 'results' | 'difficulty'>) {
	const columns = Math.min(roll.results.length, 5)
	const rows = Math.ceil(roll.results.length / columns)
	return {
		w: Math.max(
			roll.difficulty >= 0 ? 320 : 240,
			columns * (getDieDimensions(roll.sides).width + 12) + 20
		),
		h: rows * 76 + (roll.difficulty >= 0 ? 76 : 42),
	}
}

function RollSvg({ shape }: { shape: DiceRollShape }) {
	const p = shape.props
	const columns = Math.min(p.results.length, 5)
	const rows = Math.ceil(p.results.length / columns)
	const width = getDieDimensions(p.sides).width
	return (
		<svg width={p.w} height={p.h} viewBox={`0 0 ${p.w} ${p.h}`}>
			<rect x="1" y="1" width={p.w - 2} height={p.h - 2} rx="12" fill="#fff" stroke="#ded8d5" />
			<text x="16" y="25" fill="#59524f" fontSize="13" fontFamily="Arial, sans-serif">
				{p.username.slice(0, 24)} · {p.results.length}d{p.sides}
			</text>
			{p.results.map((result, index) => (
				<svg
					key={index}
					x={16 + (index % columns) * (width + 12)}
					y={36 + Math.floor(index / columns) * 76}
					width={width}
					height={64}
					dangerouslySetInnerHTML={{
						__html:
							p.difficulty >= 0
								? createV5DieSvg(result, index < p.hunger)
								: createDieSvg(p.sides, result, '', false),
					}}
				/>
			))}
			{p.difficulty >= 0 && (
				<text x="16" y={rows * 76 + 54} fill="#7d1922" fontSize="16" fontFamily="Arial, sans-serif">
					{getV5Result(p.results, p.hunger, p.difficulty)}
				</text>
			)}
		</svg>
	)
}

export class DiceRollShapeUtil extends BaseBoxShapeUtil<DiceRollShape> {
	static override type = 'dice-roll' as const
	static override props = diceRollProps
	getDefaultProps(): DiceRollShape['props'] {
		return {
			w: 240,
			h: 152,
			sides: 10,
			results: [6],
			hunger: 0,
			difficulty: 1,
			username: 'Игрок',
			time: 0,
		}
	}
	override canResize() {
		return false
	}
	component(shape: DiceRollShape) {
		return (
			<SVGContainer>
				<RollSvg shape={shape} />
			</SVGContainer>
		)
	}
	getIndicatorPath(shape: DiceRollShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
	override toSvg(shape: DiceRollShape) {
		return <RollSvg shape={shape} />
	}
}
