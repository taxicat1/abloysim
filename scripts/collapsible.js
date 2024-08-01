/*
	Collapsing instructions stuff
	
	Only used for the collapse function of the instructions panel.
*/

"use strict";

let collapseElements = document.getElementsByClassName("collapsible-container");
for (let e of collapseElements) {
	let target  = e.getElementsByClassName("collapsible")[0];
	let trigger = e.getElementsByClassName("collapse-button")[0];
	
	target.style.maxHeight = target.scrollHeight + "px";
	
	trigger.addEventListener("click", function() {
		if (trigger.dataset.collapsed === "true") {
			trigger.dataset.collapsed = "false";
			target.style.maxHeight = target.scrollHeight + "px";
		} else {
			trigger.dataset.collapsed = "true";
			target.style.maxHeight = 0;
		}
	});
}