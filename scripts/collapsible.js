/*
	Collapsing instructions stuff
	
	Only used for the collapse function of the instructions panel.
*/

let collapseElements = document.getElementsByClassName("collapsible-container");
for (let e of collapseElements) {
	let target  = e.getElementsByClassName("collapsible")[0];
	let trigger = e.getElementsByClassName("collapse-button")[0];
	
	target.style.maxHeight = target.scrollHeight + "px";
	
	trigger.addEventListener("click", function() {
		if (trigger.getAttribute("collapsed") === "true") {
			trigger.setAttribute("collapsed", "false");
			target.style.maxHeight = target.scrollHeight + "px";
		} else {
			trigger.setAttribute("collapsed", "true");
			target.style.maxHeight = 0;
		}
	});
}