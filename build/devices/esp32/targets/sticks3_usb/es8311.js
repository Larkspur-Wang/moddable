import Timer from "timer";
import SMBus from "pins/smbus";

const INTERNAL_I2C = Object.freeze({
	address: 0x18,
	sda: 47,
	scl: 48,
	hz: 100000,
	timeout: 20
}, true);

function withCodec(options, callback) {
	const codec = new SMBus({
		...INTERNAL_I2C,
		...options
	});

	try {
		return callback(codec);
	}
	finally {
		codec.close();
	}
}

function writeBulk(codec, pairs) {
	for (let i = 0; i < pairs.length; i += 2)
		codec.writeByte(pairs[i], pairs[i + 1]);
}

const DIGITAL_CLOCK_SETUP = Object.freeze([
	0x03, 0x10,
	0x04, 0x10,
	0x05, 0x00,
	0x06, 0x03,
	0x07, 0x00,
	0x08, 0xFF
], true);

const SERIAL_FORMAT_16BIT = Object.freeze([
	0x09, 0x10,
	0x0A, 0x10
], true);

const SPEAKER_ENABLE_SEQUENCE = Object.freeze([
	0x00, 0x80,
	0x01, 0xB5,
	0x02, 0x18,
	0x0D, 0x01,
	0x12, 0x00,
	0x13, 0x10,
	0x32, 0xBF,
	0x37, 0x08
], true);

const SPEAKER_DISABLE_SEQUENCE = Object.freeze([
	0x0D, 0xFC,
	0x12, 0xFF,
	0x13, 0x00,
	0x00, 0x00
], true);

const MICROPHONE_ENABLE_SEQUENCE = Object.freeze([
	0x00, 0x80,
	0x01, 0xBA,
	0x02, 0x18,
	0x0D, 0x01,
	0x0E, 0x02,
	0x14, 0x10,
	0x17, 0xFF,
	0x1C, 0x6A
], true);

const MICROPHONE_DISABLE_SEQUENCE = Object.freeze([
	0x0D, 0xFC,
	0x0E, 0x6A,
	0x00, 0x00
], true);

function initializeDigitalCore(codec) {
	writeBulk(codec, [
		0x00, 0x1F
	]);
	Timer.delay(20);
	writeBulk(codec, [
		0x00, 0x00,
		0x00, 0x80,
		0x01, 0xBF,
		0x02, 0x10,
		...DIGITAL_CLOCK_SETUP,
		0x00, 0x80,
		...SERIAL_FORMAT_16BIT,
		0x37, 0x08
	]);
}

class ES8311 {
	constructor(options = {}) {
		this.options = {
			...INTERNAL_I2C,
			...options
		};
	}

	probe() {
		try {
			return withCodec(this.options, codec => ({
				found: true,
				address: this.options.address,
				reset: codec.readByte(0x00)
			}));
		}
		catch {
			return {
				found: false,
				address: this.options.address
			};
		}
	}

	readRegisters(registers) {
		return withCodec(this.options, codec => {
			const result = {};
			for (let i = 0; i < registers.length; i++) {
				const register = registers[i] & 0xFF;
				const key = `0x${register.toString(16).toUpperCase().padStart(2, "0")}`;
				result[key] = codec.readByte(register);
			}
			return result;
		});
	}

	initSpeaker(volume = 0xBF) {
		const clamped = Math.max(0, Math.min(255, volume | 0));

		withCodec(this.options, codec => {
			initializeDigitalCore(codec);
			writeBulk(codec, SPEAKER_ENABLE_SEQUENCE);
			codec.writeByte(0x32, clamped);
		});
	}

	stopSpeaker() {
		withCodec(this.options, codec => writeBulk(codec, SPEAKER_DISABLE_SEQUENCE));
	}

	initMicrophone() {
		withCodec(this.options, codec => {
			initializeDigitalCore(codec);
			writeBulk(codec, MICROPHONE_ENABLE_SEQUENCE);
			codec.writeByte(0x16, 0x01);
		});
	}

	stopMicrophone() {
		withCodec(this.options, codec => writeBulk(codec, MICROPHONE_DISABLE_SEQUENCE));
	}
}

export default ES8311;
