/*
	Overly large monolithic file containing all main game logic
	
	Could use refactoring to properly use classes instead of raw objects, but not
	to much benefit with only one game instance created per page.
*/

const c = document.getElementById("c");
const ctx = c.getContext("2d");

// Master offset on the canvas used as a fixed point to calculate other positions
const pickingPosition = [ 70, 155 ];

const gameData = {
	
	// ========== Immutable stuff below here ========== //
	imgSrcs : {
		"pick_handle"            : "images/pick_handle.png", 
		"pick_handle_mask"       : "images/pick_handle_mask.png", 
		"pick_handle_overlay"    : "images/pick_handle_overlay.png", 
		
		"tension_handle"         : "images/tension_handle.png", 
		"tension_handle_mask"    : "images/tension_handle_mask.png", 
		"tension_handle_overlay" : "images/tension_handle_overlay.png", 
		"tension_arm"            : "images/tension_arm.png",
		
		"pick_arm"               : "images/pick_arm.png",
		
		"padlock"                : "images/padlock.png",
		"background"             : "images/background.png",
	},
	
	// Fixed values of where to start to draw these
	pickArmOrigin       : [-200,  91],
	padlockOrigin       : [ -70, -69],
	tensionArmOrigin    : [  59,  75],
	
	pickHandleOrigin    : [   0,  0 ],
	tensionHandleOrigin : [ 495,  0 ],
	
	// Archive of default values for resetting
	pickHandleOffsetDefault    : [0, -160],
	tensionHandleOffsetDefault : [0, -20 ],
	
	// Clamp values for the above offsets during normal operation
	pickHandleClamp       : [ [0, 183], [-165, -5 ] ],
	tensionHandleClamp    : [ [0, 0  ], [ -20, -15] ], // Index 0 unused
	
	diskOrigins           : [2,22,42,62,82,102,122,142,162,182],  // Disk positions as x-offsets of pick handle
	diskSpacing           : 20,                                   // Archive of above
	diskDefaultBounds     : [-5, -165],                           // Range of motion a disk has when completely unbound
	gateOrigins           : [-160,-130,-100,-70,-40,-10],         // Gate positions as y-offsets of pick handle
	// TODO: if needed, arbitrary gate positions can be used with Map objects 
	diskWidth             : 8,                                    // How close you must be on the x-axis to be considered on the disk
	pickTipSlop           : 8,                                    // Slop on the y-axis the pick tip has inside the disk before it starts turning it
	gateFalseBindingSlop  : 8,                                    // How much jiggle a binding disk in a false gate has
	gateTrueBindingSlop   : 16,                                   // How much jiggle a nonbinding disk in a gate has
	
	
	// ========== Mutable stuff below here ========== //
	gameState : "wait",
	
	// Image objects here to be loaded later
	imgs       : {},
	imgsLoaded : false,
	
	// Dynamic values of how far away to draw these from their origin
	pickHandleOffset    : [0, -160],
	tensionHandleOffset : [0, -20 ], // Index 0 unused
	
	// Disk data
	disks         : [],                     // Array of disk objects, each with gates, position, and movement limits
	bindingOrder1 : [0,1,2,3,4,5,6,7,8,9],  // Binding order of the outside of the disks, to be shuffled in setup
	bindingOrder2 : [0,1,2,3,4,5,6,7,8,9],  // Binding order of the false gates of the disks, to be shuffled in setup
	
	
	tensionReleased : false,
	
	useDarkTheme : window.matchMedia("(prefers-color-scheme: dark)").matches,
	
	startTime : null,
	endTime   : null,
	
	screenText       : new Map(),
	activeAnimations : new Set(),
	
	previousFrameStartTime : null,
	
	endFade : 0,
	
	randomSeed : -1,
	
	
	showFps         : false,
	fpsSamples      : [],
	fpsSamplesMax   : 90, // Arbitrary
	fpsSamplesIndex : 0,
};


// Helper function
function clamp(l, x, h) {
	return Math.max(l, Math.min(h, x));
}

// Loads images into gameData
function loadImgs(callback) {
	if (gameData.imgsLoaded) {
		callback();
		return;
	}
	
	let loadedImgsCnt = 0;
	const numImgs = Object.keys(gameData.imgSrcs).length;
	
	const loadFunc = function() {
		loadedImgsCnt++;
		if (loadedImgsCnt === numImgs) {
			gameData.imgsLoaded = true;
			callback();
		}
	}
	
	for (let i in gameData.imgSrcs) {
		let img = new Image();
		img.onload = loadFunc;
		img.src = gameData.imgSrcs[i];
		gameData.imgs[i] = img;
	}
}

// Recomputes the binding status of each disk based on free movement made without tension. Result is updated in gameData.disks[i].bounds
// Also returns true if there exist a binding disk, for detecting wins
function recalculateDiskBinds() {	
	// Enumeration of disk spots
	const NO_GATE    = 0;
	const FALSE_GATE = 1;
	const TRUE_GATE  = 2;
	
	
	// Iterate over disk pack in respective binding order twice:
	// once looking for any disk not within true-slop range of *any* gate (between gates)
		// if found:
			// all previous disks have true-slop centered on the gate they were aligned with
			// this disk has no slop
			// all subsequent disks have full-slop
			// return binder found
		// else:
	// iterate again searching for a disk within true-slop of a false gate
		// if found: 
			// this disk has false-slop
			// all other disks have true-slop
			// return binder found
		// else:
	// if nothing found, lock must be open. return no binders found
	
	// Helper function: iterates over the gates of a disk and checks if its position would place it under the sidebar
	// Returns `i` for disk.gates[i] under the sidebar, or `false` for no gates (between gates, or just no gate cut on disk)
	function findTrueSlopToGate(disk) {
		for (let i in disk.gates) {
			if (disk.gates[i] === NO_GATE) continue;
			
			let targetCenter = gameData.gateOrigins[i];
			if (Math.abs(targetCenter - disk.position) <= gameData.gateTrueBindingSlop) {
				return i;
			}
		}
		
		return false;
	}
	
	// Each entry `i` is the gate index that disk[i] was found to be aligned with
	// eg alignedGates[5] -> 3 means that gameData.disks[5] is aligned to gate gameData.disks[5].gates[3]
	let alignedGates = [ false, false, false, false, false, false, false, false, false, false ];
	for (let i = 0; i < gameData.bindingOrder1.length; i++) {
		let di = gameData.bindingOrder1[i];
		let disk = gameData.disks[di];
		
		if ((alignedGates[di] = findTrueSlopToGate(disk)) === false) {
			for (let j = 0; j < i; j++) {
				let targetCenter = gameData.gateOrigins[alignedGates[gameData.bindingOrder1[j]]];
				gameData.disks[gameData.bindingOrder1[j]].bounds = [ targetCenter + gameData.gateTrueBindingSlop, targetCenter - gameData.gateTrueBindingSlop ];
			}
			
			disk.bounds = [ disk.position, disk.position ];
			
			for (let k = i + 1; k < gameData.bindingOrder1.length; k++) {
				gameData.disks[gameData.bindingOrder1[k]].bounds = [...gameData.diskDefaultBounds];
			}
			
			return true;
		}
	}
	
	
	let falseFound = false;
	for (let i = 0; i < gameData.bindingOrder2.length; i++) {
		let di = gameData.bindingOrder2[i];
		let disk = gameData.disks[di];
		
		let targetCenter = gameData.gateOrigins[alignedGates[di]];
		
		if (disk.gates[alignedGates[di]] === FALSE_GATE && !falseFound) {
			// Slop slowly decreases slop to R% of the original slop amount as you set more disks
			// Formula being (((1 - R) * X) + R) for `X` as 0-1 of the disk binding order
			const R = 0.5;
			let X = (gameData.bindingOrder2.length - i) / gameData.bindingOrder2.length;
			let multiplier = ((1 - R) * X) + R;
			let slop = multiplier * gameData.gateFalseBindingSlop;
			
			disk.bounds = [ targetCenter + slop, targetCenter - slop ];
			falseFound = true;
		} else {
			disk.bounds = [ targetCenter + gameData.gateTrueBindingSlop, targetCenter - gameData.gateTrueBindingSlop ];
		}
	}
	
	return falseFound;
}

// Sets up gameData with random disks which are all zeroed
function initGame(randomSeed) {
	randomSeed = randomSeed || generateSeed();
	let rand = new SeededRandom(randomSeed);
	
	function makeDisk(trueGatePosition, noFalses) {
		const NO_GATE    = O = 0;
		const FALSE_GATE = H = 1;
		const TRUE_GATE  = U = 2;
		
		// Currently unimplemented
		// O,H,U shorthand to make this less messy, and they sort of look like the gate shape
		// TODO: this is almost certainly inaccurate to reality. Research false disk placement.
		const gatePattern = [
			[ // Gate arrangements for true gate 0
				[ U, O, H, O, H, O ],
				[ U, O, H, O, O, O ],
				[ U, O, O, O, H, O ],
				[ U, O, O, H, O, H ],
			],
			[ // True gate 1
				[ O, U, O, H, O, H ],
				[ O, U, O, H, O, O ],
				[ O, U, O, O, O, H ],
				[ O, U, O, O, H, O ],
			],
			[ // True gate 2
				[ H, O, U, O, H, O ],
				[ H, O, U, O, O, O ],
				[ O, O, U, O, H, O ],
				[ O, O, U, O, O, H ],
			],
			[ // True gate 3
				[ O, H, O, U, O, H ],
				[ O, H, O, U, O, O ],
				[ O, O, O, U, O, H ],
				[ H, O, O, U, O, O ],
			],
			[ // True gate 4
				[ H, O, H, O, U, O ],
				[ H, O, O, O, U, O ],
				[ O, O, H, O, U, O ],
				[ O, H, O, O, U, O ],
			],
			[ // True gate 5
				[ O, H, O, H, O, U ],
				[ O, H, O, O, O, U ],
				[ O, O, O, H, O, U ],
				[ H, O, H, O, O, U ],
			],
		];
		
		
		let gates = [ NO_GATE, NO_GATE, NO_GATE, NO_GATE, NO_GATE, NO_GATE ];
		gates[trueGatePosition] = TRUE_GATE;
		
		// Randomly position false gates, they cannot be directly adjacent to another gate
		// 5 attempts are made so there can be a varying amount of the gates
		if (!noFalses) {
			for (let i = 0; i < 5; i++) {
				let index = Math.floor(rand.random() * 6);
				
				// Ugly, but two edge case checks and one general check
				if (index === 0) {
					if (gates[1] !== NO_GATE || gates[0] !== NO_GATE) continue;
				} else if (index === 5) {
					if (gates[4] !== NO_GATE || gates[5] !== NO_GATE) continue;
				} else {
					if (gates[index-1] !== NO_GATE || gates[index] !== NO_GATE || gates[index+1] !== NO_GATE) continue;
				}
				
				gates[index] = FALSE_GATE;
			}
		}
		
		// Future method?
		/*
		let gates;
		if (noFalses) {
			gates = [ O, O, O, O, O, O ];
			gates[trueGatePosition] = TRUE_GATE;
		} else {
			gates = gatePattern[trueGatePosition][Math.floor(rand.random() * gatePattern[trueGatePosition].length)];
		}
		*/
		
		let disk = {
			'gates'    : gates,
			'position' : gameData.gateOrigins[0],        // Position (rotation) of the disk starts on 0
			'bounds'   : [...gameData.diskDefaultBounds] // Clamp to the disk's position based on current binding state
		};
		
		return disk;
	}
	
	// Knuth shuffle
	function shuffleArray(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(rand.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}
	
	// Around 16% of possible bittings are invalid!
	function generateValidBitting() {
		let bitting;
		let isValid;
		
		// do { generate } while(invalid) pattern prevents bias
		do {
			bitting = [0,5,null,null,null,null,null,null,null,0];
			for (let i = 0; i < bitting.length; i++) {
				if (bitting[i] === null) {
					bitting[i] = Math.floor(rand.random() * 6);
				}
			}
			
			isValid = true;
			for (let i = 1; i < bitting.length - 1; i++) {
				// Same cut cannot appear 3 times in a row
				if (bitting[i-1] === bitting[i] && bitting[i] === bitting[i+1]) {
					isValid = false;
					break;
				}
			}
		} while (!isValid);
		
		return bitting;
	}
	
	
	// Setup stuff
	gameData.gameState           = "main";
	gameData.tensionReleased     = false;
	gameData.startTime           = null;
	gameData.endTime             = null;
	gameData.endFade             = 0;
	gameData.pickHandleOffset    = [...gameData.pickHandleOffsetDefault];
	gameData.tensionHandleOffset = [...gameData.tensionHandleOffsetDefault];
	gameData.randomSeed          = randomSeed;
	
	gameData.screenText.clear();
	gameData.activeAnimations.clear();
	
	ctx.reset();
	
	// Reset and shuffle binding order arrays
	for (let i = 0; i < gameData.bindingOrder1.length; i++) {
		gameData.bindingOrder1[i] = i;
		gameData.bindingOrder2[i] = i;
	}
	
	shuffleArray(gameData.bindingOrder1);
	shuffleArray(gameData.bindingOrder2);
	
	// Now generate bitting
	gameData.disks = [];
	let bitting = generateValidBitting();
	for (let i = 0; i < bitting.length - 1; i++) {
		gameData.disks.push(makeDisk(bitting[i], false));
	}
	gameData.disks.push(makeDisk(bitting[bitting.length - 1], true)); // No false gates on final disk which is a spinner
	
	// Finally do initial calculation of disk bindings
	recalculateDiskBinds();
	
	// Ready to play
	loadImgs(gameLoop);
}

function addWinText() {
	gameData.screenText.set("endOpen", {
		content       : "Open!",
		fillStyle     : "#231f20",
		fillStyleDark : "#cccccc",
		font          : "300 65px Roboto, sans-serif",
		origin        : [500, 150],
		justify       : "center",
	});
	
	// Gather bitting into a string
	let bitting = "0";
	for (let disk of gameData.disks) {
		bitting += disk.gates.indexOf(2);
	}
	
	gameData.screenText.set("endBitting", {
		content       : `Bitting: ${bitting}`,
		fillStyle     : "#231f20",
		fillStyleDark : "#cccccc",
		font          : "20px Roboto, sans-serif",
		origin        : [500, 240],
		justify       : "center",
	});
	
	// Determine win time
	let ds = (gameData.endTime - gameData.startTime) / 1000
	let minutes = Math.floor(ds / 60).toString();
	let seconds = (ds % 60).toFixed(3);
	
	gameData.screenText.set("endPickTime", {
		content       : `Picked in: ${minutes}m ${seconds}s`,
		fillStyle     : "#231f20",
		fillStyleDark : "#cccccc",
		font          : "20px Roboto, sans-serif",
		origin        : [500, 270],
		justify       : "center",
	});
	
	gameData.screenText.set("endRestart", {
		content       : "Click or tap to restart",
		fillStyle     : "#231f20",
		fillStyleDark : "#cccccc",
		font          : "16px Roboto, sans-serif",
		origin        : [500, 365],
		justify       : "center",
	});
}

// Each animation returns a bool if it should continue to run in the next frame
const animations = {
	"tensionUpdate" : function(msSincePrevFrame) {
		const tensionStep = 0.09 * (gameData.tensionReleased ? 1 : -1) * msSincePrevFrame;
		
		gameData.tensionHandleOffset[1] += tensionStep;
		gameData.tensionHandleOffset[1] = clamp(gameData.tensionHandleClamp[1][0], gameData.tensionHandleOffset[1], gameData.tensionHandleClamp[1][1]);
		
		// Reached fully tensioned state
		if (!gameData.tensionReleased && gameData.tensionHandleOffset[1] === gameData.tensionHandleClamp[1][0]) {
			if (gameData.gameState === "ending") {
				// Winner
				gameData.activeAnimations.add("turnCore");
			}
			
			return false;
		}
		
		// Reached fully released state
		if (gameData.tensionReleased && gameData.tensionHandleOffset[1] === gameData.tensionHandleClamp[1][1]) {
			return false;
		}
		
		return true;
	},
	
	"turnCore" : function(msSincePrevFrame) {
		const turnStep         = -0.25 * msSincePrevFrame;
		const tensionHandleMax = -95;
		const pickHandleMax    = -235;
		
		gameData.pickHandleOffset[1]    = Math.max(pickHandleMax,    gameData.pickHandleOffset[1]    + turnStep);
		gameData.tensionHandleOffset[1] = Math.max(tensionHandleMax, gameData.tensionHandleOffset[1] + turnStep);
		
		if (gameData.tensionHandleOffset[1] === tensionHandleMax) {
			// Timeout here not needed to be precise, just dramatic pause
			setTimeout(function(){ gameData.activeAnimations.add("fadeOut"); }, 600);
			return false;
		}
		
		return true;
	},
	
	"fadeOut" : function(msSincePrevFrame) {
		const fadeStep = 0.8 * msSincePrevFrame;
		const fadeMax  = 180;
		
		gameData.endFade = Math.min(gameData.endFade + fadeStep, fadeMax);
		
		if (gameData.endFade === fadeMax) {
			gameData.gameState = "end";
			addWinText();
			return false;
		}
		
		return true;
	},
};

function tickAnimations(msSincePrevFrame) {
	gameData.activeAnimations.forEach(animationName => {
		if (animations.hasOwnProperty(animationName)) {
			let loop = animations[animationName].apply(this, [ msSincePrevFrame ]);
			if (!loop) {
				gameData.activeAnimations.delete(animationName);
			}
		}
	});
}

function tickFps(thisFrameStartTime) {
	gameData.fpsSamples[gameData.fpsSamplesIndex] = thisFrameStartTime;
	
	let next = (gameData.fpsSamplesIndex + 1) % gameData.fpsSamplesMax;
	let deltaTime = gameData.fpsSamples[gameData.fpsSamplesIndex] - gameData.fpsSamples[next];
	// Subtract 1 here due to fenceposting
	let fps = (1000 * (gameData.fpsSamplesMax - 1)) / deltaTime;
	
	gameData.fpsSamplesIndex = next;
	
	if (!isNaN(fps)) {
		gameData.screenText.set("fps", {
			content   : `${fps.toFixed(2)} fps`,
			fillStyle : "black",
			font      : "10px sans-serif",
			origin    : [1, 10],
			justify   : "left",
		});
	}
}

// Draws frame to canvas using data in gameData
function drawFrame() {
	
	// Helper function to make this more readable with the nested saves and restores
	// This is peppered everywhere and wrapping every discrete canvas operation that uses a changed setting so 
	// we don't forget to restore fillStyle or globalAlpha or globalCompositeOperation or whatever
	function doCanvasWork(work) {
		ctx.save();
		work();
		ctx.restore();
	}
	
	const overlayAlpha = 0.72;
	
	// Clear canvas
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	
	// Mark the start of this frame and time since start of previous frame
	let thisFrameStartTime = performance.now();
	let msSincePrevFrame = thisFrameStartTime - gameData.previousFrameStartTime;
	gameData.previousFrameStartTime = thisFrameStartTime;
	
	// Debug fps
	if (gameData.showFps) {
		tickFps(thisFrameStartTime);
	} else {
		if (gameData.screenText.has("fps")) {
			gameData.screenText.delete("fps");
		}
	}
	
	// Start with canvas work for this frame
	
	// Tick animations
	tickAnimations(msSincePrevFrame);
	
	
	// Drawing game objects translated to the picking position
	doCanvasWork(() => {
		ctx.translate(pickingPosition[0], pickingPosition[1]);
		
		// Drawing the layers of the pick itself
		// Draw both masks first
		// No changed settings for these
		
		// Tension handle mask
		ctx.drawImage(
			gameData.imgs["tension_handle_mask"], 
			gameData.tensionHandleOrigin[0], 
			gameData.tensionHandleOrigin[1]
		);
		
		// Pick handle mask
		ctx.drawImage(
			gameData.imgs["pick_handle_mask"], 
			gameData.pickHandleOrigin[0] + gameData.pickHandleOffset[0], 
			gameData.pickHandleOrigin[1]
		);
		
		
		// Tension handle
		doCanvasWork(() => {
			ctx.globalCompositeOperation = "source-atop"
			ctx.drawImage(
				gameData.imgs["tension_handle"], 
				gameData.tensionHandleOrigin[0], 
				gameData.tensionHandleOrigin[1] + gameData.tensionHandleOffset[1]
			);
		});
		
		// Tension handle overlay
		doCanvasWork(() => {
			/* Annoyingly, you cannot do overlay AND source-atop together, so the overlay must be pre-masked to the mask.
			   You could just use the overlay AS your mask, but this eliminates the possibility of having transparent regions
			   within the overlay. Even though this is not the case here, the overlay and the mask are left separate. */
			ctx.globalCompositeOperation = "overlay"
			ctx.globalAlpha = overlayAlpha;
			ctx.drawImage(
				gameData.imgs["tension_handle_overlay"], 
				gameData.tensionHandleOrigin[0], 
				gameData.tensionHandleOrigin[1]
			);
		});
		
		
		// Pick handle
		doCanvasWork(() => {
			ctx.globalCompositeOperation = "source-atop"
			ctx.drawImage(
				gameData.imgs["pick_handle"], 
				gameData.pickHandleOrigin[0] + gameData.pickHandleOffset[0], 
				gameData.pickHandleOrigin[1] + gameData.pickHandleOffset[1]
			);
		});
		
		// Pick handle overlay
		doCanvasWork(() => {
			ctx.globalCompositeOperation = "overlay"
			ctx.globalAlpha = overlayAlpha;
			ctx.drawImage(
				gameData.imgs["pick_handle_overlay"], 
				gameData.pickHandleOrigin[0] + gameData.pickHandleOffset[0], 
				gameData.pickHandleOrigin[1]
			);
		});
		
		
		// Background objects now, drawn in reverse order
		doCanvasWork(() => {
			ctx.globalCompositeOperation = "destination-over";
			
			// Tension arm
			ctx.drawImage(
				gameData.imgs["tension_arm"], 
				gameData.tensionArmOrigin[0], 
				gameData.tensionArmOrigin[1]
			);
			
			// Pick arm
			// Really annoying and complicated converting the motion of the pick handle to the pick arm
			// The range of motion (pickHandleClamp) is used to normalize
			const pickArmMotionRange = 26;
			const pickArmRatio = pickArmMotionRange / (gameData.pickHandleClamp[1][0] - gameData.pickHandleClamp[1][1]);
			ctx.drawImage(
				gameData.imgs["pick_arm"], 
				gameData.pickArmOrigin[0] + gameData.pickHandleOffset[0],
				gameData.pickArmOrigin[1] + Math.round((gameData.pickHandleOffset[1] - gameData.pickHandleClamp[1][0]) * pickArmRatio)
			);
		});
		
		// Finally foreground objects are drawn last
		// No changed settings for these either
		
		// Padlock
		ctx.drawImage(gameData.imgs["padlock"], gameData.padlockOrigin[0], gameData.padlockOrigin[1]);
	});
	
	// Finished with all game objects
	// Now draw the entire background behind everything
	doCanvasWork(() => {
		ctx.globalCompositeOperation = "destination-over";
		ctx.drawImage(gameData.imgs["background"], 0, 0);
	});
	
	
	
	// == All below here is screen overlays ==
	
	
	// End fade screen effect
	if (gameData.endFade !== 0) {
		doCanvasWork(() => {
			const endFadeFillStyle     = "#ffffff";
			const endFadeFillStyleDark = "#242424";
			
			ctx.globalAlpha = gameData.endFade / 255;
			
			if (gameData.useDarkTheme) {
				ctx.fillStyle = endFadeFillStyleDark;
			} else {
				ctx.fillStyle = endFadeFillStyle;
			}
			
			ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		});
	}
	
	
	// Screen text
	for (let [ name, text ] of gameData.screenText) {
		doCanvasWork(() => {
			ctx.font = text.font;
			
			if (gameData.useDarkTheme && text.hasOwnProperty("fillStyleDark")) {
				ctx.fillStyle = text.fillStyleDark;
			} else {
				ctx.fillStyle = text.fillStyle;
			}
			
			let x = text.origin[0];
			let y = text.origin[1];
			
			let textWidth = ctx.measureText(text.content).width;
			
			switch (text.justify) {
				case "left":    break;
				case "right":   x -= textWidth;  break;
				case "center":  x -= textWidth / 2;  break;
			}
			
			ctx.fillText(text.content, x, y);
		});
	}
	
}

// Accept fresh input data from mouse/keyboard or touch events about movement
function inputMovement(movementX, movementY) {
	if (gameData.gameState !== "main") return;
	
	// Start the timer if we haven't already
	if (gameData.startTime === null) {
		gameData.startTime = performance.now();
	}
	
	let sensitivity = parseFloat(sens.value);
	movementX *= sensitivity;
	movementY *= sensitivity;
	
	// Mouse position for the pick handle input
	let nox = gameData.pickHandleOffset[0] + (movementX || 0);
	let noy = gameData.pickHandleOffset[1] + (movementY || 0);
	
	
	// Basic clamping for playable range
	nox = clamp(gameData.pickHandleClamp[0][0], nox, gameData.pickHandleClamp[0][1]);
	noy = clamp(gameData.pickHandleClamp[1][0], noy, gameData.pickHandleClamp[1][1]);
	
	// Disk-specific clamping
	
	// Helper function which tells you [diskToLeft, diskToRight] for a specific offset
	// left == right when you are on a disk, else you are between left and right
	function determinePickTipPosition(offset) {
		// Iterate disk origins, looking for which disk is the closest
		// When we find it, determine how close we are and on which side of it we're on
		for (let i = 0; i < gameData.diskOrigins.length; i++) {
			let distance = gameData.diskOrigins[i] - offset;
			if (Math.abs(distance) <= (gameData.diskSpacing / 2)) {
				// Closest disk found. Are we inside it?
				// Note that if the disk ranges from 40 to 50 (for example), 39.1 is considering inside, as is 50.9, considering they overlap an "inside" pixel
				// Because of this, we subtract 1 and use lessThan instead of lessThanOrEqualTo
				if (Math.abs(distance) - 1 < gameData.diskWidth) {
					// Inside it
					return [ i, i ];
				} else {
					// Not inside it. Which side of it are we on?
					if (Math.sign(distance) === -1) {
						// Right side
						return [ i, i + 1 ];
					} else {
						// Left side
						return [i - 1, i ];
					}
				}
			}
		}
	}
	
	
	// Clamping X-movement due to collisions with the side of disks
	if (movementX != 0) {
		let startDiskPos = determinePickTipPosition(gameData.pickHandleOffset[0]);
		let endDiskPos   = determinePickTipPosition(nox);
		
		// Start and end are in different locations in the disk pack
		// Two different code blocks here check if you are moving left or moving right
		// This is because you may skip over multiple disks (eg 3 -> 5) with quick mouse movements,
		// and iteration is required to determine which if any disks stop the movement.
		// The iteration directions (i++ and i--) and the clamp location are different, and so two loops are used
		
		// If start<end, moving to the right
		if (startDiskPos[0] < endDiskPos[0]) {
			for (let i = startDiskPos[0]+1; i <= endDiskPos[0]; i++) {
				let targetYPosition = gameData.disks[i].position;
				if (Math.abs(targetYPosition - gameData.pickHandleOffset[1]) > gameData.pickTipSlop) {
					// If here the pick tip is not aligned and cannot enter the disk
					// Pick tip is aligned to the left edge of the disk
					nox = Math.min(nox, gameData.diskOrigins[i] - gameData.diskWidth - 1);
					break;
				}
			}
		// If start>end, moving to the left
		} else if (startDiskPos[1] > endDiskPos[1]) {
			for (let i = startDiskPos[1]-1; i >= endDiskPos[1]; i--) {
				let targetYPosition = gameData.disks[i].position;
				if (Math.abs(targetYPosition - gameData.pickHandleOffset[1]) > gameData.pickTipSlop) {
					// If here the pick tip is not aligned and cannot enter the disk
					// Pick tip is aligned to the right edge of the disk
					nox = Math.max(gameData.diskOrigins[i] + gameData.diskWidth + 1, nox);
				}
			}
		}
		
		// Apply new position to pick tip
		gameData.pickHandleOffset[0] = nox;
	}
	
	
	// Clamp Y-movement due to disks binding, as well as modify the disk position by pushing it
	if (movementY !== 0) {
		// nox may have been adjusted above, so recalculate its position
		let endDiskPos = determinePickTipPosition(nox);
		
		// We only need to clamp the Y-axis if we are inside a disk 
		if (endDiskPos[0] === endDiskPos[1]) {
			let disk = gameData.disks[endDiskPos[0]];
			
			// We may be in a "slope", that is, outside the valid bounds of a disk and can "fall" into it
			// Therefore, direction-specific clamping is neccessary
			if (Math.sign(movementY) === 1) {
				// Positive movement, moving downwards on screen
				noy = Math.min(noy, Math.max(disk.position, disk.bounds[0]) + gameData.pickTipSlop);
			} else {
				// Negative movement, moving upwards
				noy = Math.max(noy, Math.min(disk.position, disk.bounds[1]) - gameData.pickTipSlop);
			}
			
			// Nudge disk within bounds as checked above
			disk.position = clamp(noy - gameData.pickTipSlop, disk.position, noy + gameData.pickTipSlop);
		}
		
		// Apply new position to pick tip
		gameData.pickHandleOffset[1] = noy;
	}
}

// Accept fresh input data about the tension status
function inputTension(tensionReleased) {
	if (gameData.gameState !== "main") return;
	
	// Start the timer if we haven't already
	if (gameData.startTime === null) {
		gameData.startTime = performance.now();
	}
	
	// Only do anything if the new status is different from the existing status
	if (tensionReleased !== gameData.tensionReleased) {
		// Update status
		gameData.tensionReleased = tensionReleased;
		
		// Run the animation
		gameData.activeAnimations.add("tensionUpdate");
		
		if (gameData.tensionReleased) {
			// Without tension, all disk bounds are set to default
			for (let disk of gameData.disks) {
				disk.bounds = [...gameData.diskDefaultBounds];
			}
		} else {
			// Under tension, redo all the bounds
			if (!recalculateDiskBinds()) {
				// Winner!
				gameData.endTime = performance.now();
				
				// Changing the gameState blocks further input, and causes the tensionUpdate 
				// animation to chain to the turnCore animation, triggering the end of the game
				gameData.gameState = "ending";
			}
		}
	}
}

// Main render loop which will continunally draw frames as fast as the browser allows
function gameLoop() {
	drawFrame();
	
	if (gameData.gameState !== "end") {
		requestAnimationFrame(gameLoop);
	} else {
		unfocusGame();
	}
}

// Mouse and keyboard hooking
const mouseAndKeyboardData = {
	tensionKeyIds      : new Set([ 13, 16, 17, 32 ]), // Enter, Shift, Ctrl, Space
	
	tensionActiveKeys  : new Set(),
	mouseButtonPressed : false
};

function updateMouseAndKeyboardInput(e) {
	// No need to read game state here since this function is regulated by the pointer lock element
	e.preventDefault();
	
	switch (e.type) {
		case "keydown":
			if (mouseAndKeyboardData.tensionKeyIds.has(e.keyCode)) {
				mouseAndKeyboardData.tensionActiveKeys.add(e.keyCode);
				inputTension(true);
			}
			break;
		
		case "keyup":
			mouseAndKeyboardData.tensionActiveKeys.delete(e.keyCode);
			inputTension(mouseAndKeyboardData.mouseButtonPressed || (mouseAndKeyboardData.tensionActiveKeys.size !== 0));
			break;
		
		case "mousemove":
			inputMovement(e.movementX, e.movementY);
			break;
		
		case "mousedown":
		case "mouseup":
			mouseAndKeyboardData.mouseButtonPressed = ((e.buttons & 3) !== 0);
			inputTension(mouseAndKeyboardData.mouseButtonPressed || (mouseAndKeyboardData.tensionActiveKeys.size !== 0));
			break;
	}
}

// Touch hooking
const touchData = {
	tensionerTouchRegion       : [800, 50, 950, 450], // x1, y1, x2, y2 of tensioner touch zone
	
	primaryTouchId             : null,     // Identifier of touch currently controlling picking
	previousPrimaryTouchOffset : [0, 0],   // Previous location of above for tracking movement over time
	tensionerTouchIds          : new Set() // Set of touches that are tension-releasing touches; at least 1 in set means tension released
};

function updateTouchInput(e) {
	if (gameData.gameState === "end") {
		// Do not prevent default here for resetting
		return;
	}
	
	e.preventDefault();
	
	// Only one touch at a time may control the pick tip movement, subsequent ones will be ignored
	// However, any number of touches on the tensioner are fine for releasing tension.
	// EG, touch with one finger, touch with second finger, remove first finger --> still releasing tension
	for (let touch of e.changedTouches) {
		
		switch (e.type) {
			case "touchstart":
				const cbr = c.getBoundingClientRect();
				let tx = touch.clientX - cbr.left;
				let ty = touch.clientY - cbr.top;
				if (
					tx >= touchData.tensionerTouchRegion[0] && // Checking that it is inside this region
					tx <= touchData.tensionerTouchRegion[2] &&
					ty >= touchData.tensionerTouchRegion[1] && 
					ty <= touchData.tensionerTouchRegion[3]
				) {
					touchData.tensionerTouchIds.add(touch.identifier);
					inputTension(true);
				} else {
					// Assign a new primary touch if not in tension region
					if (touchData.primaryTouchId === null) {
						touchData.primaryTouchId = touch.identifier;
						touchData.previousPrimaryTouchOffset = [ touch.clientX, touch.clientY ];
					}
				}
				
				break;
			
			
			case "touchmove":
				if (touch.identifier === touchData.primaryTouchId) {
					let movementX = touch.clientX - touchData.previousPrimaryTouchOffset[0];
					let movementY = touch.clientY - touchData.previousPrimaryTouchOffset[1];
					
					inputMovement(movementX, movementY);
					
					touchData.previousPrimaryTouchOffset = [ touch.clientX, touch.clientY ];
				}
				break;
			
			
			case "touchcancel":
			case "touchend":
				if (touch.identifier === touchData.primaryTouchId) {
					touchData.primaryTouchId = null;
				}
				
				if (touchData.tensionerTouchIds.has(touch.identifier)) {
					touchData.tensionerTouchIds.delete(touch.identifier);
					inputTension(touchData.tensionerTouchIds.size !== 0);
				}
				
				break;
		}
	}
}

// Add mouse/keyboard and touch event hooking into canvas element
function lockChange() {
	// The chain of requestPointerLock(), then onLockChange -> lockChange() is required in case the lock fails for whatever reason
	if (document.pointerLockElement === c) {
		document.addEventListener("keydown",   updateMouseAndKeyboardInput);
		document.addEventListener("keyup",     updateMouseAndKeyboardInput);
		document.addEventListener("mousedown", updateMouseAndKeyboardInput);
		document.addEventListener("mouseup",   updateMouseAndKeyboardInput);
		document.addEventListener("mousemove", updateMouseAndKeyboardInput);
	} else {
		document.removeEventListener("keydown",   updateMouseAndKeyboardInput);
		document.removeEventListener("keyup",     updateMouseAndKeyboardInput);
		document.removeEventListener("mousedown", updateMouseAndKeyboardInput);
		document.removeEventListener("mouseup",   updateMouseAndKeyboardInput);
		document.removeEventListener("mousemove", updateMouseAndKeyboardInput);
	}
}

// Doing it this way ensures everything sleeps when the game is unfocused
document.addEventListener('pointerlockchange', lockChange);

// Focus game hook for M&K using pointer lock
function focusGame() {
	// Resetting here
	if (gameData.gameState === "end") {
		initGame();
	}
	
	// Touch devices may not have this function available at all
	if (c.requestPointerLock instanceof Function) {
		if (document.pointerLockElement !== c) {
			c.requestPointerLock();
		}
	}
}

// Called at the end to kick you out
function unfocusGame() {
	if (document.exitPointerLock instanceof Function) {
		if (document.pointerLockElement === c) {
			document.exitPointerLock();
		}
	}
}

c.addEventListener("click", focusGame);

// For mobile devices we need to deal with touch events
c.addEventListener("touchstart",  updateTouchInput);
c.addEventListener("touchend",    updateTouchInput);
c.addEventListener("touchmove",   updateTouchInput);
c.addEventListener("touchcancel", updateTouchInput);

// Extra feature: rerender the current frame (even if not in game loop) when toggling light and dark mode
function colorModeChange(event) {
	gameData.useDarkTheme = event.matches;
	drawFrame();
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", colorModeChange);