/*
	Seeded random
	
	Currently not used. Idea was to be able to input a specific seed,
	which would then deterministically generate a bitting and binding order 
	for use in fair competitions.
	Implementation is a basic and lazy Xor-Shift generator.
*/

function generateSeed() {
	return Math.floor(Math.random() * 0x100000000).toString(36);
}

class SeededRandom {
	constructor(s) {
		this.seed(s);
	}
	
	seed(s) {
		this.state = (s || 0) === 0 ? 0x01234567 : s;
	}
	
	randInt() {
		this.state ^= this.state << 13;
		this.state ^= this.state >>> 7;
		this.state ^= this.state << 17;
		this.state &= 0xFFFFFFFF;
		this.state >>>= 0; /* Cast to unsigned */
		return this.state;
	}
	
	random() {
		return this.randInt() / 0xFFFFFFFF;
	}
	
	randIntRange(min, max) {
		if (min == max) return min;
		return min + (this.randInt() % (max - min));
	}
}