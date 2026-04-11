import Digital from "pins/digital";
import SMBus from "pins/smbus";

const internalI2C = Object.freeze({
	sda: 47,
	scl: 48,
	hz: 100000,
	address: 0x6E
}, true);

const pins = Object.freeze({
	internalI2C: { sda: 47, scl: 48 },
	groveI2C: { sda: 9, scl: 10 },
	display: {
		mosi: 39,
		sck: 40,
		dc: 45,
		cs: 41,
		rst: 21,
		backlight: 38,
		width: 135,
		height: 240,
		columnOffset: 52,
		rowOffset: 40
	},
	buttons: {
		a: 11,
		b: 12
	},
	infrared: {
		tx: 46,
		rx: 42
	},
	audio: {
		mck: 18,
		bck: 17,
		ws: 15,
		dout: 14,
		din: 16
	}
}, true);

function bitOn(bus, register, mask) {
	bus.writeByte(register, bus.readByte(register) | mask);
}

function bitOff(bus, register, mask) {
	bus.writeByte(register, bus.readByte(register) & ~mask);
}

function initializePMIC() {
	const pmic = new SMBus(internalI2C);

	try {
		pmic.writeByte(0x09, 0x00);

		bitOff(pmic, 0x16, 1 << 2);
		bitOn(pmic, 0x10, 1 << 2);
		bitOff(pmic, 0x13, 1 << 2);
		bitOn(pmic, 0x11, 1 << 2);

		bitOff(pmic, 0x16, 1 << 3);
		bitOn(pmic, 0x10, 1 << 3);
		bitOff(pmic, 0x13, 1 << 3);
		bitOff(pmic, 0x11, 1 << 3);

		bitOff(pmic, 0x16, 1 << 0);
		bitOff(pmic, 0x10, 1 << 0);

		trace("StickS3 target: PMIC initialized\n");
	}
	finally {
		pmic.close();
	}
}

function powerOnDisplayPins() {
	Digital.write(pins.display.rst, 1);
	Digital.write(pins.display.backlight, 1);
	trace("StickS3 target: LCD pins ready\n");
}

export default function(done) {
	try {
		initializePMIC();
		powerOnDisplayPins();
		globalThis.stick = Object.freeze({
			name: "M5Stack StickS3",
			pins
		}, true);
	}
	catch (error) {
		trace(`StickS3 target setup failed: ${error}\n`);
	}

	done?.();
}
