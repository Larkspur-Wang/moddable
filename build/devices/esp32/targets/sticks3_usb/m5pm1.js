import SMBus from "pins/smbus";

const DEFAULTS = Object.freeze({
	address: 0x6E,
	sda: 47,
	scl: 48,
	hz: 100000,
	timeout: 20
}, true);

class M5PM1 extends SMBus {
	constructor(options = {}) {
		super({
			...DEFAULTS,
			...options
		});
	}

	#bitOn(register, mask) {
		this.writeByte(register, this.readByte(register) | mask);
	}

	#bitOff(register, mask) {
		this.writeByte(register, this.readByte(register) & ~mask);
	}

	#read16(register) {
		const lo = this.readByte(register);
		const hi = this.readByte(register + 1);
		return (hi << 8) | lo;
	}

	#configureGPIO(index, output, value) {
		const mask = 1 << index;

		this.#bitOff(0x16, mask);
		if (output)
			this.#bitOn(0x10, mask);
		else
			this.#bitOff(0x10, mask);
		this.#bitOff(0x13, mask);
		if (value)
			this.#bitOn(0x11, mask);
		else
			this.#bitOff(0x11, mask);
	}

	initializeStickS3() {
		this.writeByte(0x09, 0x00);
		this.enableDisplayPower(true);
		this.setSpeakerAmplifier(false);
		this.setExt5VEnabled(false);
	}

	enableDisplayPower(enabled) {
		this.#configureGPIO(2, true, !!enabled);
	}

	setSpeakerAmplifier(enabled) {
		this.#configureGPIO(3, true, !!enabled);
	}

	setExt5VEnabled(enabled) {
		const mask = 1 << 0;
		this.#bitOff(0x16, mask);
		if (enabled)
			this.#bitOn(0x10, mask);
		else
			this.#bitOff(0x10, mask);
	}

	readDeviceId() {
		return this.readByte(0x00);
	}

	readBatteryMv() {
		return this.#read16(0x22);
	}

	readVinMv() {
		return this.#read16(0x24);
	}

	read5VInOutMv() {
		return this.#read16(0x26);
	}

	isCharging() {
		return (this.readByte(0x12) & 0x01) === 0;
	}

	sample() {
		return {
			deviceId: this.readDeviceId(),
			batteryMv: this.readBatteryMv(),
			vinMv: this.readVinMv(),
			fiveVMv: this.read5VInOutMv(),
			charging: this.isCharging()
		};
	}
}

export default M5PM1;
