/*
	Overly large monolithic file containing all main game logic
	
	Could use refactoring to properly use classes instead of raw objects, but not
	to much benefit with only one game instance created per page.
*/

"use strict";

(function(){
	
	const viewport = document.getElementById("viewport");
	const layers = Array.from(
		viewport.getElementsByTagName("canvas")
	).map(canvasElement => {
		return {
			canvas   : canvasElement,
			ctx      : canvasElement.getContext("2d"),
			modified : false
		};
	});
	
	const cutawayCheckbox = document.getElementById("show-cutaway-checkbox");
	
	
	const gameData = {
		
		// ========== Immutable stuff below here ========== //
		
		// Layer where each object is to be drawn, for easier access
		objectLayers : {
			background    : layers[0],
			tensionArm    : layers[2],
			tensionHandle : layers[3],
			pickArm       : layers[1],
			pickHandle    : layers[4],
			padlock       : layers[5],
			cutaway       : layers[6],
			foreground    : layers[7]
		},
		
		imgSrcs : {
			"background"             : "images/background.png",
			
			"pick_handle"            : "images/pick_handle.png",
			"pick_handle_mask"       : "images/pick_handle_mask.png",
			"pick_handle_overlay"    : "images/pick_handle_overlay.png",
			
			"tension_handle"         : "images/tension_handle.png",
			"tension_handle_mask"    : "images/tension_handle_mask.png",
			"tension_handle_overlay" : "images/tension_handle_overlay.png",
			
			"tension_arm"            : "images/tension_arm.png",
			
			"pick_arm"               : "images/pick_arm.png",
			
			"padlock"                : "images/padlock.png",
			
			"cutaway_background"     : "images/cutaway_background.png",
			"cutaway_disk"           : "images/cutaway_disk.png",
			"cutaway_true_gate"      : "images/cutaway_true_gate.png",
			"cutaway_false_gate"     : "images/cutaway_false_gate.png",
			"cutaway_disks_overlay"  : "images/cutaway_disks_overlay.png",
			"cutaway_sidebar"        : "images/cutaway_sidebar.png",
			"cutaway_overlay"        : "images/cutaway_overlay.png"
		},
		
		// Fixed values of where to start to draw these
		pickArmOrigin       : [ -200,  92 ],
		padlockOrigin       : [ -265, -69 ],
		tensionArmOrigin    : [   59,  75 ],
		cutawayOrigin       : [ -198,  40 ],
		
		pickHandleOrigin           : [   0,   0 ],
		tensionHandleOrigin        : [ 495,   0 ],
		tensionHandleTextureOrigin : [   0, -20 ],
		
		// Archive of default values for resetting
		pickHandleOffsetDefault    : [  0, -160 ],
		pickingPositionDefault     : [ 70,  155 ],
		
		// Alternate value for cutaway mode
		pickingPositionCutaway      : [ 202, 155 ],
		
		coreRotationUntensioned :   5, // Amount of core rotation that signifies no tension applied
		coreRotationDefault     :  -2, // Amount of core rotation that signifies no progress
		coreRotationFalseSet    : -10, // Amount of core rotation that signifies a false set
		coreRotationOpen        : -75, // Amount of core rotation that signifies an open
		
		// Clamp values for the pick handle offset during normal operation
		pickHandleClamp       : [ [ 0, 183 ], [ -165, -5 ] ],
		
		diskOrigins           : [ 2,22,42,62,82,102,122,142,162,182 ], // Disk positions as x-offsets of pick handle
		diskSpacing           : 20,                                    // Archive of above
		diskDefaultBounds     : [ -5, -165 ],                          // Range of motion a disk has when completely unbound
		gateOrigins           : [ -160,-130,-100,-70,-40,-10 ],        // Gate positions as y-offsets of pick handle
		// TODO: if needed, arbitrary gate positions can be used with Map objects 
		diskWidth             : 8,                                     // How close you must be on the x-axis to be considered on the disk
		pickTipSlop           : 8,                                     // Slop on the y-axis the pick tip has inside the disk before it starts turning it
		gateFalseBindingSlop  : 8,                                     // How much jiggle a binding disk in a false gate has
		gateTrueBindingSlop   : 16,                                    // How much jiggle a nonbinding disk in a gate has
		
		
		// ========== Mutable stuff below here ========== //
		
		// Master offset on the canvas used as a fixed point to calculate other positions
		pickingPosition : [ 70, 155 ],
		
		gameState : "wait",
		
		// Image objects here to be loaded later
		imgs       : {},
		imgsLoaded : false,
		
		// Dynamic values of how far away to draw the handle from its origin
		pickHandleOffset : [ 0, -160 ],
		
		// How far the core is currently rotated (for drawing), and how far is it input to be rotated (for animating)
		coreRotation       : 0,
		coreRotationTarget : 0,
		
		// Disk data
		disks         : [],                     // Array of disk objects, each with gates, position, and movement limits
		bindingOrder1 : [0,1,2,3,4,5,6,7,8,9],  // Binding order of the outside of the disks, to be shuffled in setup
		bindingOrder2 : [0,1,2,3,4,5,6,7,8,9],  // Binding order of the false gates of the disks, to be shuffled in setup
		
		
		tensionReleased : false,
		
		useDarkTheme : matchMedia("(prefers-color-scheme: dark)").matches,
		
		startTime : null,
		endTime   : null,
		
		screenText       : new Map(),
		activeAnimations : new Set(),
		
		previousFrameStartTime : null,
		
		endFade : 0,
		
		randomSeed : -1,
		
		showCutaway : false,
		cheater     : false,
		
		debug : false,
		
		showFps         : false,
		fpsSamples      : [],
		fpsSamplesMax   : 90, // Arbitrary
		fpsSamplesIndex : 0,
	};
	
	function debug(msg) {
		if (gameData.debug) {
			console.log(`[${performance.now()}] ${msg.toString()}`);
		}
	}
	
	// Helper function
	function clamp(low, x, high) {
		return Math.max(low, Math.min(high, x));
	}
	
	// Loads images into gameData
	async function loadImgs(callback) {
		if (gameData.imgsLoaded) {
			callback();
			return;
		}
		
		
		let imgPromises = [];
		
		for (let imgName in gameData.imgSrcs) {
			let img = new Image();
			img.src = gameData.imgSrcs[imgName];
			imgPromises.push(img.decode());
			gameData.imgs[imgName] = img;
		}
		
		await Promise.all(imgPromises);
		
		debug("Images loaded");
		gameData.imgsLoaded = true;
		callback();
	}
	
	// Recomputes the binding status of each disk based on free movement made without tension. Result is updated in gameData.disks[i].bounds
	// Returns the current distance the core is able to be rotated (none, false set, or open)
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
			
			alignedGates[di] = findTrueSlopToGate(disk);
			if (alignedGates[di] === false) {
				for (let j = 0; j < i; j++) {
					let targetCenter = gameData.gateOrigins[alignedGates[gameData.bindingOrder1[j]]];
					
					gameData.disks[gameData.bindingOrder1[j]].bounds = [
						targetCenter + gameData.gateTrueBindingSlop,
						targetCenter - gameData.gateTrueBindingSlop
					];
				}
				
				disk.bounds = [ disk.position, disk.position ];
				
				for (let k = i + 1; k < gameData.bindingOrder1.length; k++) {
					gameData.disks[gameData.bindingOrder1[k]].bounds = [...gameData.diskDefaultBounds];
				}
				
				
				debug("Disk bindings recalculated, no false set");
				return gameData.coreRotationDefault;
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
		
		if (falseFound) {
			debug("Disk bindings recalculated, in false set");
			return gameData.coreRotationFalseSet;
		} else {
			debug("Disk bindings recalculated, open");
			return gameData.coreRotationOpen;
		}
	}
	
	// Sets up gameData with random disks which are all zeroed
	function initGame(randomSeed) {
		randomSeed = randomSeed || generateSeed();
		let rand = new SeededRandom(randomSeed);
		
		debug(`Game init, seed=${randomSeed}`);
		
		function makeDisk(trueGatePosition, noFalses) {
			const NO_GATE    = 0;
			const FALSE_GATE = 1;
			const TRUE_GATE  = 2;
			
			// O,H,U shorthand to make this less messy, and they sort of look like the gate shape
			// TODO: this is almost certainly inaccurate to reality. Research false disk placement.
			const O = NO_GATE;
			const H = FALSE_GATE;
			const U = TRUE_GATE;
			
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
			
			let gates;
			if (noFalses) {
				gates = [ O, O, O, O, O, O ];
				gates[trueGatePosition] = TRUE_GATE;
			} else {
				// Random selection from gate patterns
				gates = gatePattern[trueGatePosition][Math.floor(rand.random() * gatePattern[trueGatePosition].length)];
			}
			
			let disk = {
				"gates"    : gates,
				"position" : gameData.gateOrigins[0],         // Position (rotation) of the disk starts on 0
				"bounds"   : [...gameData.diskDefaultBounds], // Clamp to the disk's position based on current binding state
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
			
			// `do { generate() } while(invalid)` pattern prevents bias by rejection sampling
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
		gameData.gameState             = "main";
		gameData.tensionReleased       = false;
		gameData.startTime             = null;
		gameData.endTime               = null;
		gameData.endFade               = 0;
		gameData.pickingPosition       = [...gameData.pickingPositionDefault];
		gameData.pickHandleOffset      = [...gameData.pickHandleOffsetDefault];
		gameData.coreRotationTarget    = gameData.coreRotationDefault;
		gameData.randomSeed            = randomSeed;
		gameData.cheater               = false;
		gameData.showCutaway           = false;
		
		cutawayCheckbox.checked = false;
		
		gameData.screenText.clear();
		gameData.activeAnimations.clear();
		
		// Clear all layers
		layers.forEach(layer => {
			layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
			layer.modified = true;
		});
		
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
		gameData.coreRotation = recalculateDiskBinds();
		
		// Ready to play
		loadImgs(gameLoop);
	}
	
	// Add win screen text to gameData.screenText
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
		let ds = (gameData.endTime - gameData.startTime) / 1000;
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
		
		
		if (gameData.cheater) {
			gameData.screenText.set("endCheater", {
				content       : "... But you cheated! Try again without cutaway?",
				fillStyle     : "#231f20",
				fillStyleDark : "#cccccc",
				font          : "16px Roboto, sans-serif",
				origin        : [500, 320],
				justify       : "center",
			});
		}
		
		gameData.screenText.set("endRestart", {
			content       : "Click or tap to restart",
			fillStyle     : "#231f20",
			fillStyleDark : "#cccccc",
			font          : "16px Roboto, sans-serif",
			origin        : [500, 365],
			justify       : "center",
		});
		
		gameData.objectLayers.foreground.modified = true;
	}
	
	// Each animation returns a bool if it should continue to run in the next frame
	const animations = {
		cutawayPan : function(msSincePrevFrame) {
			const panStep = 0.8 * (gameData.showCutaway ? 1 : -1) * msSincePrevFrame;
			
			gameData.pickingPosition[0] = clamp(
				gameData.pickingPositionDefault[0],
				gameData.pickingPosition[0] + panStep,
				gameData.pickingPositionCutaway[0]
			);
			
			// Most objects use the picking position
			gameData.objectLayers.tensionArm.modified    = true;
			gameData.objectLayers.tensionHandle.modified = true;
			gameData.objectLayers.pickArm.modified       = true;
			gameData.objectLayers.pickHandle.modified    = true;
			gameData.objectLayers.padlock.modified       = true;
			gameData.objectLayers.cutaway.modified       = true;
			
			// Reached fully panned state
			if (gameData.showCutaway && gameData.pickingPosition[0] === gameData.pickingPositionCutaway[0]) {
				return false;
			}
			
			// Reached fully reset state
			if (!gameData.showCutaway && gameData.pickingPosition[0] === gameData.pickingPositionDefault[0]) {
				return false;
			}
			
			return true;
		},
		
		coreRotationUpdate : function(msSincePrevFrame) {
			const rotateStep = 0.15 * msSincePrevFrame;
			
			// Step from coreRotation towards coreRotationTarget, from positive or negative direction
			if (gameData.coreRotation > gameData.coreRotationTarget) {
				gameData.coreRotation = Math.max(gameData.coreRotation - rotateStep, gameData.coreRotationTarget);
			} else {
				gameData.coreRotation = Math.min(gameData.coreRotation + rotateStep, gameData.coreRotationTarget);
			}
			
			gameData.objectLayers.tensionHandle.modified = true;
			gameData.objectLayers.pickArm.modified       = true;
			gameData.objectLayers.pickHandle.modified    = true;
			
			if (gameData.showCutaway) {
				gameData.objectLayers.cutaway.modified = true;
			}
			
			// Check if done with animation
			if (gameData.coreRotation === gameData.coreRotationTarget) {
				
				// Check winner
				if (gameData.coreRotation === gameData.coreRotationOpen) {
					// Timeout here not needed to be precise, just dramatic pause
					const pause = 600;
					setTimeout(function() {
						gameData.activeAnimations.add(animations.fadeOut);
					}, pause);
				}
				
				return false;
			}
			
			return true;
		},
		
		fadeOut : function(msSincePrevFrame) {
			const fadeStep = 0.8 * msSincePrevFrame;
			const fadeMax  = 200;
			
			gameData.endFade = Math.min(gameData.endFade + fadeStep, fadeMax);
			
			gameData.objectLayers.foreground.modified = true;
			
			if (gameData.endFade === fadeMax) {
				gameData.gameState = "end";
				addWinText();
				return false;
			}
			
			return true;
		},
	};
	
	// Call each active animation with delta time
	function tickAnimations(msSincePrevFrame) {
		gameData.activeAnimations.forEach(animation => {
			let loop = animation(msSincePrevFrame);
			if (!loop) {
				gameData.activeAnimations.delete(animation);
			}
		});
	}
	
	// Record the sample of the current frame start time, calculate fps, and create screenText entry
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
			
			gameData.objectLayers.foreground.modified = true;
		}
	}
	
	// Helper function to increase readability
	// This is peppered within drawFrame and wrapping every discrete canvas operation that uses a changed setting so 
	// we don't forget to restore fillStyle or globalAlpha or globalCompositeOperation or whatever
	function doCanvasWork(ctx, work) {
		ctx.save();
		work(ctx);
		ctx.restore();
	}
	
	// Draws frame to canvas using data in gameData
	function drawFrame() {
		const overlayAlpha = 0.72;
		
		// Mark the start of this frame and time since start of previous frame
		let thisFrameStartTime = performance.now();
		let msSincePrevFrame = thisFrameStartTime - gameData.previousFrameStartTime;
		gameData.previousFrameStartTime = thisFrameStartTime;
		
		// Debug fps
		if (gameData.showFps) {
			tickFps(thisFrameStartTime);
		} else if (gameData.screenText.has("fps")) {
			gameData.screenText.delete("fps");
			gameData.objectLayers.foreground.modified = true;
		}
		
		// Start with canvas work for this frame
		
		// Tick animations
		tickAnimations(msSincePrevFrame);
		
		// Background
		if (gameData.objectLayers.background.modified) {
			doCanvasWork(gameData.objectLayers.background.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				
				ctx.drawImage(gameData.imgs["background"], 0, 0);
			});
		}
		
		// Picking arm
		if (gameData.objectLayers.pickArm.modified) {
			doCanvasWork(gameData.objectLayers.pickArm.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
				ctx.translate(gameData.pickArmOrigin[0], gameData.pickArmOrigin[1]);
				
				// Really annoying and complicated converting the motion of the pick handle to the pick arm
				// The range of motion (pickHandleClamp) is used to normalize
				const pickArmMotionRange = 26;
				const pickArmRatio = pickArmMotionRange / (gameData.pickHandleClamp[1][0] - gameData.pickHandleClamp[1][1]);
				
				let pickHandleDisplacement = gameData.coreRotation + 
				                             gameData.pickHandleOffset[1] - 
				                             gameData.pickHandleClamp[1][0];
				
				ctx.drawImage(
					gameData.imgs["pick_arm"], 
					gameData.pickHandleOffset[0],
					Math.round(pickHandleDisplacement * pickArmRatio)
				);
			});
		}
		
		// Tension arm
		if (gameData.objectLayers.tensionArm.modified) {
			doCanvasWork(gameData.objectLayers.tensionArm.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
				ctx.translate(gameData.tensionArmOrigin[0], gameData.tensionArmOrigin[1]);
				
				ctx.drawImage(
					gameData.imgs["tension_arm"], 
					0,
					0
				);
			});
		}
		
		// Tension handle
		if (gameData.objectLayers.tensionHandle.modified) {
			doCanvasWork(gameData.objectLayers.tensionHandle.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
				ctx.translate(gameData.tensionHandleOrigin[0], gameData.tensionHandleOrigin[1]);
				
				// Mask
				ctx.drawImage(
					gameData.imgs["tension_handle_mask"], 
					0,
					0
				);
				
				// Texture
				doCanvasWork(ctx, ctx => {
					ctx.globalCompositeOperation = "source-atop";
					ctx.translate(0, gameData.coreRotation);
					ctx.translate(gameData.tensionHandleTextureOrigin[0], gameData.tensionHandleTextureOrigin[1]);
					
					ctx.drawImage(
						gameData.imgs["tension_handle"], 
						0,
						0
					);
				});
				
				// Overlay
				doCanvasWork(ctx, ctx => {
					/* Annoyingly, you cannot do overlay AND source-atop together, so the overlay must be pre-masked to the mask.
					   You could just use the overlay AS your mask, but this eliminates the possibility of having transparent regions
					   within the overlay. Even though this is not the case here, the overlay and the mask are left separate. */
					ctx.globalCompositeOperation = "overlay";
					ctx.globalAlpha = overlayAlpha;
					
					ctx.drawImage(
						gameData.imgs["tension_handle_overlay"], 
						0, 
						0
					);
				});
			});
		}
		
		// Picking handle
		if (gameData.objectLayers.pickHandle.modified) {
			doCanvasWork(gameData.objectLayers.pickHandle.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
				ctx.translate(gameData.pickHandleOrigin[0], gameData.pickHandleOrigin[1]);
				
				// Mask
				ctx.drawImage(
					gameData.imgs["pick_handle_mask"], 
					gameData.pickHandleOffset[0], 
					0
				);
				
				// Texture
				doCanvasWork(ctx, ctx => {
					ctx.globalCompositeOperation = "source-atop";
					ctx.translate(0, gameData.coreRotation);
					
					ctx.drawImage(
						gameData.imgs["pick_handle"], 
						gameData.pickHandleOffset[0], 
						gameData.pickHandleOffset[1]
					);
				});
				
				// Overlay
				doCanvasWork(ctx, ctx => {
					ctx.globalCompositeOperation = "overlay";
					ctx.globalAlpha = overlayAlpha;
					
					ctx.drawImage(
						gameData.imgs["pick_handle_overlay"], 
						gameData.pickHandleOffset[0], 
						0
					);
				});
			});
		}
		
		// Padlock
		if (gameData.objectLayers.padlock.modified) {
			doCanvasWork(gameData.objectLayers.padlock.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
				ctx.translate(gameData.padlockOrigin[0], gameData.padlockOrigin[1]);
				
				ctx.drawImage(
					gameData.imgs["padlock"],
					0,
					0
				);
			});
		}
		
		// Cutaway
		if (gameData.objectLayers.cutaway.modified) {
			doCanvasWork(gameData.objectLayers.cutaway.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				
				if (gameData.showCutaway) {
					const NO_GATE    = 0;
					const FALSE_GATE = 1;
					const TRUE_GATE  = 2;
					
					// Radius ratio between the pick handle and the disks
					const diskRadiusRatio = 11.6 / 19;
					
					// If we've drawn a frame with the cutaway, this is a cheater
					gameData.cheater = true;
					
					ctx.translate(gameData.pickingPosition[0], gameData.pickingPosition[1]);
					ctx.translate(gameData.cutawayOrigin[0], gameData.cutawayOrigin[1]);
					
					// Background which clips the entire cutaway window
					ctx.drawImage(
						gameData.imgs["cutaway_background"],
						0,
						0
					);
					
					const cutawayMidpoint = gameData.imgs["cutaway_background"].height / 2;
					
					doCanvasWork(ctx, ctx => {
						// Clipped onto background
						ctx.globalCompositeOperation = "source-atop";
						
						// Centered on the midpoint of the cutaway
						ctx.translate(0, cutawayMidpoint);
						
						// Also is affected by core rotation
						ctx.translate(0, gameData.coreRotation * diskRadiusRatio);
						
						for (let i = 0; i < gameData.disks.length; i++) {
							// Draw disk itself
							let diskOffset = (gameData.disks[i].position - gameData.diskDefaultBounds[0]) * diskRadiusRatio;
							
							ctx.drawImage(
								gameData.imgs["cutaway_disk"],
								gameData.diskOrigins[i],
								// Divide by 4 here because the disk center is +90 degrees forward at the start
								// On top of dividing by 2 already to center the disk at the drawing location
								// Basically, we want to center the disk at the 3/4ths mark
								Math.round(diskOffset - (gameData.imgs["cutaway_disk"].height / 4))
							);
							
							for (let j = 0; j < gameData.disks[i].gates.length; j++) {
								let gateOffset = gameData.gateOrigins[j] * diskRadiusRatio;
								
								// Draw each gate at the correct location on the disk
								switch (gameData.disks[i].gates[j]) {
									case TRUE_GATE:
										ctx.drawImage(
											gameData.imgs["cutaway_true_gate"],
											gameData.diskOrigins[i],
											Math.round(diskOffset - gateOffset - (gameData.imgs["cutaway_true_gate"].height / 2))
										);
										
										break;
									
									case FALSE_GATE:
										ctx.drawImage(
											gameData.imgs["cutaway_false_gate"],
											gameData.diskOrigins[i],
											Math.round(diskOffset - gateOffset - (gameData.imgs["cutaway_false_gate"].height / 2))
										);
										
										break;
									
									case NO_GATE:
									default:
										break;
								}
							}
						}
					}); // End of drawing disks
					
					// Draw disk pack overlay
					doCanvasWork(ctx, ctx => {
						ctx.globalCompositeOperation = "overlay";
						ctx.globalAlpha = overlayAlpha;
						
						ctx.drawImage(
							gameData.imgs["cutaway_disks_overlay"],
							0,
							0
						);
					});
					
					// Draw sidebar, clipped by background and affected by core rotation
					doCanvasWork(ctx, ctx => {
						ctx.globalCompositeOperation = "source-atop";
						ctx.translate(0, cutawayMidpoint);
						ctx.translate(0, gameData.coreRotation * diskRadiusRatio);
						
						// Sidebar
						ctx.drawImage(
							gameData.imgs["cutaway_sidebar"],
							0,
							Math.round(0 - (gameData.imgs["cutaway_sidebar"].height / 2))
						);
					});
					
					// Finally draw the whole cutaway overlay
					doCanvasWork(ctx, ctx => {
						ctx.globalCompositeOperation = "overlay";
						ctx.globalAlpha = overlayAlpha;
						
						ctx.drawImage(
							gameData.imgs["cutaway_overlay"],
							0,
							0
						);
					});
				}
			});
		}
		
		// Foreground
		if (gameData.objectLayers.foreground.modified) {
			doCanvasWork(gameData.objectLayers.foreground.ctx, ctx => {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				
				// Outro fade
				if (gameData.endFade !== 0) {
					doCanvasWork(ctx, ctx => {
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
				
				// All screen text
				for (let [ name, text ] of gameData.screenText) {
					doCanvasWork(ctx, ctx => {
						if (text.font) {
							ctx.font = text.font;
						}
						
						if (gameData.useDarkTheme && text.fillStyleDark) {
							ctx.fillStyle = text.fillStyleDark;
						} else if (text.fillStyle) {
							ctx.fillStyle = text.fillStyle;
						}
						
						let x = text.origin[0];
						let y = text.origin[1];
						
						let textWidth;
						switch (text.justify) {
							case "center":
								textWidth = ctx.measureText(text.content).width;
								x -= textWidth / 2;
								break;
							
							case "right":
								textWidth = ctx.measureText(text.content).width;
								x -= textWidth;
								break;
							
							case "left":
							default:
								break;
						}
						
						ctx.fillText(text.content, x, y);
					});
				}
			});
		}
		
		// Frame has been drawn, mark all layers as unmodified
		// Do this here just as a pattern in case of two objects sharing a layer yet opting to be drawn in different blocks
		layers.forEach(layer => layer.modified = false);
	}
	
	// Accept fresh input data from mouse/keyboard or touch events about movement
	function inputMovement(movementX, movementY) {
		if (gameData.gameState !== "main") {
			return;
		}
		
		// Start the timer if we haven't already
		if (gameData.startTime === null) {
			gameData.startTime = performance.now();
		}
		
		// Sanitize input
		movementX = Number(movementX) || 0;
		movementY = Number(movementY) || 0;
		
		// Ignore null input, which seems to trigger frequently
		if (movementX === 0 && movementY === 0) {
			return;
		}
		
		debug(`Input movement: [ ${movementX}, ${movementY} ]`);
		
		// Mouse position for the pick handle input
		let nox = gameData.pickHandleOffset[0] + movementX;
		let noy = gameData.pickHandleOffset[1] + movementY;
		
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
		if (movementX !== 0) {
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
						break;
					}
				}
			}
			
			// Apply new position to pick tip
			gameData.pickHandleOffset[0] = nox;
			
			gameData.objectLayers.pickHandle.modified = true;
			gameData.objectLayers.pickArm.modified = true;
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
				
				if (gameData.showCutaway) {
					gameData.objectLayers.cutaway.modified = true;
				}
			}
			
			// Apply new position to pick tip
			gameData.pickHandleOffset[1] = noy;
			
			gameData.objectLayers.pickHandle.modified = true;
			gameData.objectLayers.pickArm.modified = true;
		}
	}
	
	// Accept fresh input data about the tension status
	function inputTension(tensionReleased) {
		if (gameData.gameState !== "main") {
			return;
		}
		
		// Start the timer if we haven't already
		if (gameData.startTime === null) {
			gameData.startTime = performance.now();
		}
		
		// Cast to bool, just in case of strange input
		tensionReleased = !!tensionReleased;
		
		// Only do anything if the new status is different from the existing status
		if (gameData.tensionReleased !== tensionReleased) {
			// Update status
			gameData.tensionReleased = tensionReleased;
			
			if (gameData.tensionReleased) {
				debug("Input tension released");
				
				// Rotate core backwards
				gameData.coreRotationTarget = gameData.coreRotationUntensioned;
				
				// Without tension, all disk bounds are set to default
				for (let disk of gameData.disks) {
					disk.bounds = [...gameData.diskDefaultBounds];
				}
			} else {
				debug("Input tension reapplied");
				
				// Under tension, redo all the bounds
				gameData.coreRotationTarget = recalculateDiskBinds();
				
				// Check winner immediately for calculating end time and stopping further input
				if (gameData.coreRotationTarget === gameData.coreRotationOpen) {
					// Winner!
					gameData.endTime = performance.now();
					
					// Changing the gameState blocks further input, and causes the coreRotationUpdate 
					// animation to trigger the end of the game upon reaching the open state
					gameData.gameState = "ending";
					debug("Game won");
				}
			}
			
			// Animate new core rotation
			gameData.activeAnimations.add(animations.coreRotationUpdate);
		}
	}
	
	// Accept fresh input data about whether to display the cutaway
	function inputCutaway(showCutaway) {
		if (gameData.gameState !== "main") {
			return;
		}
		
		// Cast to bool, just in case of strange input
		showCutaway = !!showCutaway;
		
		// Only do anything if the new status is different from the existing status
		if (gameData.showCutaway !== showCutaway) {
			if (showCutaway) {
				debug("Input show cutaway");
			} else {
				debug("Input hide cutaway");
			}
			
			// Update status
			gameData.showCutaway = showCutaway;
			
			// Trigger panning animation
			gameData.activeAnimations.add(animations.cutawayPan);
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
		tensionKeys : new Set([ "Enter", "Shift", "Control", " " ]),
		
		tensionActiveKeys  : new Set(),
		mouseButtonPressed : false,
	};
	
	function updateMouseAndKeyboardInput(event) {
		// No need to read game state here since this function is regulated by the pointer lock element
		event.preventDefault();
		debug(`Mouse/keyboard input: ${event.type}`);
		
		switch (event.type) {
			case "keydown":
				if (mouseAndKeyboardData.tensionKeys.has(event.key)) {
					mouseAndKeyboardData.tensionActiveKeys.add(event.key);
					inputTension(true);
				}
				
				break;
			
			case "keyup":
				mouseAndKeyboardData.tensionActiveKeys.delete(event.key);
				inputTension(mouseAndKeyboardData.mouseButtonPressed || (mouseAndKeyboardData.tensionActiveKeys.size !== 0));
				break;
			
			case "mousemove":
				let sensitivity = parseFloat(sens.value);
				inputMovement(sensitivity * event.movementX, sensitivity * event.movementY);
				break;
			
			case "mousedown":
			case "mouseup":
				mouseAndKeyboardData.mouseButtonPressed = ((event.buttons & 3) !== 0);
				inputTension(mouseAndKeyboardData.mouseButtonPressed || (mouseAndKeyboardData.tensionActiveKeys.size !== 0));
				break;
			
			default:
				break;
		}
	}
	
	// Touch hooking
	const touchData = {
		tensionerTouchRegion : [ 800, 0, 1000, 500 ], // x1, y1, x2, y2 of tensioner touch zone
		
		primaryTouchId             : null,      // Identifier of touch currently controlling picking
		previousPrimaryTouchOffset : [0, 0],    // Previous location of above for tracking movement over time
		tensionerTouchIds          : new Set(), // Set of touches that are tension-releasing touches; at least 1 in set means tension released
	};
	
	function updateTouchInput(event) {
		event.preventDefault();
		debug(`Touch input: ${event.type}`);
		
		if (gameData.gameState === "end") {
			// Reset here
			if (event.type === "touchstart") {
				initGame();
			}
			
			// Else ignore input
			return;
		}
		
		// Only one touch at a time may control the pick tip movement, subsequent ones will be ignored
		// However, any number of touches on the tensioner are fine for releasing tension.
		// EG, touch with one finger, touch with second finger, remove first finger --> still releasing tension
		for (let touch of event.changedTouches) {
			
			switch (event.type) {
				case "touchstart":
					const cbr = viewport.getBoundingClientRect();
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
						let sensitivity = parseFloat(sens.value);
						let movementX = sensitivity * (touch.clientX - touchData.previousPrimaryTouchOffset[0]);
						let movementY = sensitivity * (touch.clientY - touchData.previousPrimaryTouchOffset[1]);
						
						inputMovement(movementX, movementY);
						
						touchData.previousPrimaryTouchOffset = [ touch.clientX, touch.clientY ];
					}
					
					break;
				
				
				case "touchcancel":
				case "touchend":
					if (touch.identifier === touchData.primaryTouchId) {
						touchData.primaryTouchId = null;
					}
					
					touchData.tensionerTouchIds.delete(touch.identifier);
					inputTension(touchData.tensionerTouchIds.size !== 0);
					
					break;
				
				default:
					break;
			}
		}
	}
	
	// Add mouse/keyboard and touch event hooking into canvas element
	function lockChange() {
		// The chain of requestPointerLock(), then onLockChange -> lockChange() is required in case the lock fails for whatever reason
		if (document.pointerLockElement === viewport) {
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
	document.addEventListener("pointerlockchange", lockChange);
	
	// Focus game hook for M&K using pointer lock
	function focusGame() {
		// Resetting here
		if (gameData.gameState === "end") {
			initGame();
		}
		
		// Touch devices may not have this function available at all
		if (viewport.requestPointerLock) {
			if (document.pointerLockElement !== viewport) {
				viewport.requestPointerLock();
				debug("Game focused");
			}
		}
	}
	
	// Called at the end to kick you out
	function unfocusGame() {
		if (document.exitPointerLock) {
			if (document.pointerLockElement === viewport) {
				document.exitPointerLock();
				debug("Game unfocused");
			}
		}
	}
	
	viewport.addEventListener("click", focusGame);
	
	// For mobile devices we need to deal with touch events
	viewport.addEventListener("touchstart",  updateTouchInput);
	viewport.addEventListener("touchend",    updateTouchInput);
	viewport.addEventListener("touchmove",   updateTouchInput);
	viewport.addEventListener("touchcancel", updateTouchInput);
	
	// Also accept info from the cutaway checkbox
	function checkboxChange(event) {
		inputCutaway(this.checked);
	}
	
	cutawayCheckbox.addEventListener("change", checkboxChange);
	
	// Extra feature: rerender the current frame (even if not in game loop) when toggling light and dark mode
	function colorModeChange(event) {
		gameData.useDarkTheme = event.matches;
		
		// Mark each layer as needing a redraw
		layers.forEach(layer => layer.modified = true);
		
		drawFrame();
	}
	
	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", colorModeChange);
	
	
	initGame();
})();