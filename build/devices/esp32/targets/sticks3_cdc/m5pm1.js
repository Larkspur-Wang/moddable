import SMBus from "pins/smbus";

const DEFAULTS = Object.freeze({
	address: 0x6E,
	sda: 47,
	scl: 48,
	hz: 100000,
	timeout: 20
}, true);

const SPEAKER_AMP_GPIO = 3;
const CHARGE_STATUS_GPIO = 0;
const DISPLAY_POWER_GPIO = 2;

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

	#configureInputGPIO(index) {
		const mask = 1 << index;

		this.#bitOff(0x16, mask);
		this.#bitOff(0x10, mask);
	}

	#initializeSpeakerAmplifierControl() {
		const mask = 1 << SPEAKER_AMP_GPIO;

		this.#bitOff(0x16, mask);
		this.#bitOn(0x10, mask);
		this.#bitOff(0x13, mask);
		this.#bitOff(0x11, mask);
	}

	initializeStickS3() {
		this.writeByte(0x09, 0x00);
		this.enableDisplayPower(true);
		this.#configureInputGPIO(CHARGE_STATUS_GPIO);
		this.#initializeSpeakerAmplifierControl();
	}

	enableDisplayPower(enabled) {
		this.#configureGPIO(DISPLAY_POWER_GPIO, true, !!enabled);
	}

	setSpeakerAmplifier(enabled) {
		const mask = 1 << SPEAKER_AMP_GPIO;
		if (enabled)
			this.#bitOn(0x11, mask);
		else
			this.#bitOff(0x11, mask);
	}

	setExt5VEnabled(enabled) {
		this.#configureGPIO(0, true, !!enabled);
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
