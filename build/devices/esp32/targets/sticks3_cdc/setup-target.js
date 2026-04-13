import Digital from "pins/digital";
import StickS3Board, { GROVE_I2C, INTERNAL_I2C, PINS } from "sticks3/board";

function powerOnDisplayPins() {
	Digital.write(PINS.display.rst, 1);
	Digital.write(PINS.display.backlight, 1);
	trace("StickS3 target: LCD pins ready\n");
}

function primeBoardPower() {
	StickS3Board.initialize();
	trace("StickS3 target: board primed\n");
}

export default function(done) {
	try {
		primeBoardPower();
		powerOnDisplayPins();
	}
	catch (error) {
		trace(`StickS3 target setup failed: ${error}\n`);
	}

	globalThis.stick = Object.freeze({
		name: "M5Stack StickS3",
		pins: PINS,
		buses: Object.freeze({
			internalI2C: INTERNAL_I2C,
			groveI2C: GROVE_I2C
		}, true)
	}, true);

	done?.();
}
