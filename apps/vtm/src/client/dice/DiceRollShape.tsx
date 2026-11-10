import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw'
import { diceRollProps, type DiceRollShape } from '../../shared/dice'
import { diceFontFace } from '../../shared/diceFont'
import { getDieCharacter } from './diceText'
import { getV5Result } from './v5Dice'

// Retained only to open boards saved before dice became native text shapes.
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
	override getFontFaces() {
		return [diceFontFace]
	}
	component(shape: DiceRollShape) {
		const p = shape.props
		return (
			<HTMLContainer style={{ width: p.w, height: p.h }}>
				<div className="dice-font">
					{p.results.map((n, i) => (
						<span key={i} style={{ color: i < p.hunger ? '#b52025' : 'currentColor' }}>
							{getDieCharacter(p.sides, n, p.difficulty >= 0, i < p.hunger)}{' '}
						</span>
					))}
				</div>
				{p.difficulty >= 0 && <div>{getV5Result(p.results, p.hunger, p.difficulty)}</div>}
			</HTMLContainer>
		)
	}
	getIndicatorPath(shape: DiceRollShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
