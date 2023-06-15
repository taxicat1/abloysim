/*
	Movement sensitivity stuff
	
	Used to read and write to local storage for the movement sensitivity option.
*/


const sens = document.getElementById("sens");
const sensDisplay = document.getElementById("sensdisplay");

function readSens() {
	let s = parseFloat(localStorage.getItem("sens"));
	if (s >= parseFloat(sens.min) && s <= parseFloat(sens.max)) {
		sens.value = s;
	}
}
readSens();

function saveSens() {
	localStorage.setItem("sens", sens.value);
}

function displaySens() {
	sensDisplay.textContent = parseFloat(sens.value).toFixed(1);
}
displaySens();

sens.addEventListener("change", saveSens);
sens.addEventListener("input", displaySens);