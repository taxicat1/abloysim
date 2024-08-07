/*
	Seeded random
	
	Currently not fully used. Idea was to be able to input a specific seed,
	which would then deterministically generate a bitting and binding order 
	for use in fair competitions.
	Implementation is a basic and lazy Xor-Shift generator.
*/

"use strict";

function generateSeed() {
	let seed;
	do {
		seed = Math.floor(Math.random() * 0x100000000);
	} while (seed === 0);
	
	return seed;
}

class SeededRandom {
	constructor(s) {
		this.seed(s);
	}
	
	seed(s) {
		s >>>= 0; /* Cast to u32 */
		if (s === 0) {
			s = generateSeed();
		}
		
		this.state = s;
	}
	
	randInt() {
		this.state ^= this.state << 13;
		this.state ^= this.state >>> 7;
		this.state ^= this.state << 17;
		this.state >>>= 0; /* Cast to u32 */
		return this.state;
	}
	
	random() {
		return this.randInt() / 0x100000000;
	}
	
	randIntRange(min, max) {
		if (min == max) return min;
		return min + (this.randInt() % (max - min));
	}
}