import Digital from "pins/digital";
import M5PM1 from "m5pm1";
import { GROVE_I2C, INTERNAL_I2C, PINS } from "sticks3/board";

function powerOnDisplayPins() {
	Digital.write(PINS.display.rst, 1);
	Digital.write(PINS.display.backlight, 1);
	trace("StickS3 target: LCD pins ready\n");
}

function primeBoardPower() {
	const power = new M5PM1(INTERNAL_I2C);
	try {
		power.initializeStickS3();
		trace("StickS3 target: PMIC primed\n");
	}
	finally {
		power.close();
	}
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
