import SMBus from "pins/smbus";
import Timer from "timer";

const DEFAULTS = Object.freeze({
	address: 0x18,
	sda: 47,
	scl: 48,
	hz: 100000,
	timeout: 20
}, true);

const MODE_IDLE = "idle";
const MODE_SPEAKER = "speaker";
const MODE_MICROPHONE = "microphone";

const DEFAULT_SPEAKER_SETTLE_MS = 24;
const DEFAULT_MICROPHONE_SETTLE_MS = 8;
const DEFAULT_SPEAKER_VOLUME = 0xBF;
const DEFAULT_MICROPHONE_GAIN = 0xFF;
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_BITS_PER_SAMPLE = 16;
const DEFAULT_RESET_HOLD_MS = 20;
const COMMON_CODEC_INIT_SEQUENCE = Object.freeze([
	0x00, 0x80,
	0x01, 0xBF,
	0x02, 0x10,
	0x03, 0x10,
	0x04, 0x10,
	0x05, 0x00,
	0x06, 0x03,
	0x07, 0x00,
	0x08, 0xFF,
	0x09, 0x10,
	0x0A, 0x10,
	0x0D, 0x01,
	0x0E, 0x02,
	0x12, 0x00,
	0x13, 0x10,
	0x1C, 0x6A,
	0x37, 0x08
], true);
const COMMON_INTERFACE_SEQUENCE = Object.freeze([
	0x00, 0x80,
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
	0x32, DEFAULT_SPEAKER_VOLUME,
	0x37, 0x08
], true);
const MICROPHONE_ENABLE_SEQUENCE = Object.freeze([
	0x00, 0x80,
	0x01, 0xBA,
	0x02, 0x18,
	0x0D, 0x01,
	0x0E, 0x02,
	0x14, 0x10,
	0x17, DEFAULT_MICROPHONE_GAIN,
	0x1C, 0x6A
], true);
const MICROPHONE_DISABLE_SEQUENCE = Object.freeze([
	0x0D, 0xFC,
	0x0E, 0x6A,
	0x00, 0x00
], true);

function formatByte(value) {
	return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, "0")}`;
}

function traceCodecState(options, label) {
	try {
		withCodec(options, codec => {
			const registers = [0x00, 0x01, 0x02, 0x09, 0x0A, 0x0D, 0x0E, 0x12, 0x13, 0x14, 0x16, 0x17, 0x1C, 0x32, 0x37];
			const snapshot = {};
			for (let i = 0; i < registers.length; i++) {
				const register = registers[i];
				snapshot[formatByte(register)] = formatByte(codec.readByte(register));
			}
			trace(`StickS3 codec ${label} ${JSON.stringify(snapshot)}\n`);
		});
	}
	catch (error) {
		trace(`StickS3 codec ${label} diagnostics failed ${error}\n`);
	}
}

function withCodec(options, callback) {
	const codec = new SMBus({
		...DEFAULTS,
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

function clampByte(value, fallback) {
	const numeric = Number.isFinite(value) ? value : fallback;
	return Math.max(0, Math.min(255, numeric | 0));
}

function normalizeBitsPerSample(value) {
	const bitsPerSample = Number.isFinite(value) ? (value | 0) : DEFAULT_BITS_PER_SAMPLE;
	if (bitsPerSample !== 16)
		throw new Error(`ES8311 only supports 16-bit PCM in the StickS3 target, got ${bitsPerSample}`);
	return bitsPerSample;
}

function normalizePositiveInteger(value, fallback, label) {
	const normalized = Number.isFinite(value) ? (value | 0) : fallback;
	if (normalized <= 0)
		throw new Error(`${label} must be positive`);
	return normalized;
}

function normalizeChannelCount(value, fallback, label) {
	const normalized = Number.isFinite(value) ? (value | 0) : fallback;
	if ((normalized !== 1) && (normalized !== 2))
		throw new Error(`${label} must be 1 or 2`);
	return normalized;
}

function normalizeSpeakerSession(settings = {}) {
	return Object.freeze({
		mode: MODE_SPEAKER,
		sampleRate: normalizePositiveInteger(settings.sampleRate, DEFAULT_SAMPLE_RATE, "speaker sampleRate"),
		bitsPerSample: normalizeBitsPerSample(settings.bitsPerSample),
		channels: 2,
		volume: clampByte(settings.volume, DEFAULT_SPEAKER_VOLUME),
		settleMs: normalizePositiveInteger(settings.settleMs, DEFAULT_SPEAKER_SETTLE_MS, "speaker settleMs")
	}, true);
}

function normalizeMicrophoneSession(settings = {}) {
	return Object.freeze({
		mode: MODE_MICROPHONE,
		sampleRate: normalizePositiveInteger(settings.sampleRate, DEFAULT_SAMPLE_RATE, "microphone sampleRate"),
		bitsPerSample: normalizeBitsPerSample(settings.bitsPerSample),
		channels: normalizeChannelCount(settings.channels ?? settings.numChannels, 1, "microphone channels"),
		gain: clampByte(settings.gain, DEFAULT_MICROPHONE_GAIN),
		settleMs: normalizePositiveInteger(settings.settleMs, DEFAULT_MICROPHONE_SETTLE_MS, "microphone settleMs")
	}, true);
}

class ES8311 {
	constructor(options = {}) {
		this.options = {
			...DEFAULTS,
			...options
		};
		this.activeMode = MODE_IDLE;
		this.activeSession = null;
		this.initialized = false;
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

	initialize(settings = {}) {
		trace(`StickS3 codec initialize ${JSON.stringify(settings)}\n`);
		withCodec(this.options, codec => {
			codec.writeByte(0x00, 0x1F);
			Timer.delay(DEFAULT_RESET_HOLD_MS);
			codec.writeByte(0x00, 0x00);
			writeBulk(codec, COMMON_CODEC_INIT_SEQUENCE);
		});
		this.activeMode = MODE_IDLE;
		this.activeSession = null;
		this.initialized = true;
		traceCodecState(this.options, "after-init");
	}

	startSpeaker(settings = {}) {
		const session = normalizeSpeakerSession(settings);
		trace(`StickS3 codec startSpeaker request ${JSON.stringify(session)} active=${this.activeMode}\n`);

		if ((this.activeMode === MODE_SPEAKER) && this.activeSession &&
			(this.activeSession.sampleRate === session.sampleRate) &&
			(this.activeSession.bitsPerSample === session.bitsPerSample) &&
			(this.activeSession.channels === session.channels) &&
			(this.activeSession.volume === session.volume)) {
			trace("StickS3 codec startSpeaker reuse active session\n");
			return this.activeSession;
		}

		if (!this.initialized)
			this.initialize();

		withCodec(this.options, codec => {
			writeBulk(codec, COMMON_INTERFACE_SEQUENCE);
			writeBulk(codec, SPEAKER_ENABLE_SEQUENCE);
			if (session.volume !== DEFAULT_SPEAKER_VOLUME)
				codec.writeByte(0x32, session.volume);
		});

		this.initialized = true;
		this.activeMode = MODE_SPEAKER;
		this.activeSession = session;
		Timer.delay(session.settleMs);
		traceCodecState(this.options, "after-start-speaker");
		return session;
	}

	stopSpeaker() {
		if (this.activeMode !== MODE_SPEAKER)
			return;

		trace("StickS3 codec stopSpeaker idle-only\n");
		this.activeMode = MODE_IDLE;
		this.activeSession = null;
		traceCodecState(this.options, "after-stop-speaker");
	}

	startMicrophone(settings = {}) {
		const session = normalizeMicrophoneSession(settings);
		trace(`StickS3 codec startMicrophone request ${JSON.stringify(session)} active=${this.activeMode}\n`);

		if ((this.activeMode === MODE_MICROPHONE) && this.activeSession &&
			(this.activeSession.sampleRate === session.sampleRate) &&
			(this.activeSession.bitsPerSample === session.bitsPerSample) &&
			(this.activeSession.channels === session.channels) &&
			(this.activeSession.gain === session.gain)) {
			trace("StickS3 codec startMicrophone reuse active session\n");
			return this.activeSession;
		}

		if (!this.initialized)
			this.initialize();

		withCodec(this.options, codec => {
			writeBulk(codec, COMMON_INTERFACE_SEQUENCE);
			writeBulk(codec, MICROPHONE_ENABLE_SEQUENCE);
			if (session.gain !== DEFAULT_MICROPHONE_GAIN)
				codec.writeByte(0x17, session.gain);
		});

		this.initialized = true;
		this.activeMode = MODE_MICROPHONE;
		this.activeSession = session;
		Timer.delay(session.settleMs);
		traceCodecState(this.options, "after-start-microphone");
		return session;
	}

	stopMicrophone() {
		if (this.activeMode !== MODE_MICROPHONE)
			return;

		trace("StickS3 codec stopMicrophone\n");
		withCodec(this.options, codec => writeBulk(codec, MICROPHONE_DISABLE_SEQUENCE));
		this.initialized = false;
		this.activeMode = MODE_IDLE;
		this.activeSession = null;
		traceCodecState(this.options, "after-stop-microphone");
	}

	snapshot() {
		return {
			activeMode: this.activeMode,
			activeSession: this.activeSession
		};
	}
}

export {
	DEFAULT_MICROPHONE_GAIN,
	DEFAULT_SPEAKER_VOLUME,
	MODE_IDLE,
	MODE_MICROPHONE,
	MODE_SPEAKER,
	normalizeMicrophoneSession,
	normalizeSpeakerSession
};

export default ES8311;
