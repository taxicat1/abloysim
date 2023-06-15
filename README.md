# Abloy Classic Picking Simulator

## Features

This simulates the use of a Jaakko Fagerlund-style pick to pick an Abloy Classic. The simulated lock has 11 disks with false gates. Feedback is obtained by moving the pick tip back and forth and using the notches on the handle to gauge the looseness of a disk by how far it is able to rotate. The bitting of the lock is generated randomly, but following Abloy's factory keying rules. Additionally, a timer is used to display the total time it took to open after it has been picked.

A live version is available here: https://assamow.com/abloysim/

With a video tutorial available here: https://www.youtube.com/watch?v=WtH8eWWQDIQ


## Technical details

The simulation is written in JavaScript and runs within a fixed-sized canvas element. Two binding orders are used, one for the outer diameter of the disks and one for the inner diameter of the false gates of the disks. Binding orders are random using a shuffle function. It supports both mouse and keyboard controls as well as touch controls for phones and tablets. It has been tested in Chrome, Firefox, and Safari and likely works in any modern web browser. It has no serverside computations and may be run locally simply by opening the index.html file in a browser.
