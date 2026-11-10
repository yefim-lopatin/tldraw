// Contour drawings based on the user's reference, in a 64 × 64 view box.
export const BOARD_DICE = {
	4: {
		shape: 'tetrahedron',
		outline: 'M32 4 60 56H4Z',
		facets: 'M32 4V37L4 56M32 37 60 56',
		x: 32,
		y: 44,
	},
	6: {
		shape: 'cube',
		outline: 'M32 3 59 18V47L32 62 5 47V18Z',
		facets: 'M5 18 32 33 59 18M32 33V62',
		x: 32,
		y: 18,
	},
	8: {
		shape: 'octahedron',
		outline: 'M32 3 59 19V47L32 62 5 47V19Z',
		facets: 'M32 3 5 47H59L32 3',
		x: 32,
		y: 35,
	},
	10: {
		shape: 'pentagonal-trapezohedron',
		outline: 'M32 3 62 33 32 62 2 33Z',
		facets: 'M32 3 14 29 32 39 50 29 32 3M2 33 14 29M62 33 50 29M32 39V62',
		x: 32,
		y: 26,
	},
	12: {
		shape: 'dodecahedron',
		outline: 'M23 3 43 5 59 20 62 39 50 56 31 62 12 54 2 36 5 17Z',
		facets: 'M32 14 49 26 43 45H22L15 26 32 14V4M49 26 59 20M43 45 50 56M22 45 12 54M15 26 5 17',
		x: 32,
		y: 32,
	},
	20: {
		shape: 'icosahedron',
		outline: 'M32 2 60 18V47L32 63 4 47V18Z',
		facets:
			'M4 18 32 15 60 18 46 45 32 63 18 45 4 18M32 2V15L18 45H46L32 15M4 47 18 45M60 47 46 45',
		x: 32,
		y: 34,
	},
} as const

export function drawBoardDie(sides: keyof typeof BOARD_DICE, ink: string, paper: string) {
	const die = BOARD_DICE[sides]
	return `<g data-die-shape="${die.shape}" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round"><path d="${die.outline}" fill="${paper}"/><path d="${die.facets}" stroke-width="1.25" ${sides === 10 ? 'data-die-facets="d10"' : ''}/></g>`
}
