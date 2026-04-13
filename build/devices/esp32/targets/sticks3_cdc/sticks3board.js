import config from "mc/config";
import ES8311 from "es8311";
import M5PM1 from "m5pm1";
import {
	DEFAULT_MICROPHONE_GAIN,
	normalizeMicrophoneSession,
	normalizeSpeakerSession
} from "es8311";

const DEFAULT_SPEAKER_SAMPLE_RATE = 44100;
const DEFAULT_MICROPHONE_SAMPLE_RATE = 16000;
const DEFAULT_BITS_PER_SAMPLE = 16;
const DEFAULT_SPEAKER_CHANNELS = 2;
const DEFAULT_MICROPHONE_CHANNELS = 1;
const DEFAULT_CODEC_VOLUME = 0xBF;
const DEFAULT_SPEAKER_SETTLE_MS = 24;
const DEFAULT_MICROPHONE_SETTLE_MS = 8;

const INTERNAL_I2C = Object.freeze({
	sda: 47,
	scl: 48,
	hz: 100000,
	timeout: 20
}, true);

const GROVE_I2C = Object.freeze({
	sda: 9,
	scl: 10,
	hz: 100000,
	timeout: 20
}, true);

const PINS = Object.freeze({
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

const state = {
	initialized: false,
	power: null,
	codec: null,
	speakerUsers: 0,
	microphoneUsers: 0,
	mode: "idle",
	lastError: "",
	speakerSession: null,
	microphoneSession: null
};

function clampCodecVolume(value) {
	return Math.max(0, Math.min(255, value | 0));
}

function resolveCodecVolume() {
	return clampCodecVolume(config.es8311?.volume ?? DEFAULT_CODEC_VOLUME);
}

function resolveMicrophoneGain() {
	return clampCodecVolume(config.es8311?.microphoneGain ?? DEFAULT_MICROPHONE_GAIN);
}

function resolveSpeakerSettleMs() {
	const value = config.es8311?.speakerSettleMs;
	return Number.isFinite(value) ? Math.max(1, value | 0) : DEFAULT_SPEAKER_SETTLE_MS;
}

function resolveMicrophoneSettleMs() {
	const value = config.es8311?.microphoneSettleMs;
	return Number.isFinite(value) ? Math.max(1, value | 0) : DEFAULT_MICROPHONE_SETTLE_MS;
}

function sameSession(a, b, keys) {
	if (!a || !b)
		return false;

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (a[key] !== b[key])
			return false;
	}

	return true;
}

function formatByte(value) {
	if (!Number.isFinite(value))
		return "??";
	return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, "0")}`;
}

function traceAudioRegisters(label) {
	try {
		const pmic11 = state.power?.readByte?.(0x11);
		const codec = state.codec?.readRegisters?.([0x00, 0x01, 0x02, 0x09, 0x0A, 0x0D, 0x0E, 0x12, 0x13, 0x14, 0x16, 0x17, 0x1C, 0x32, 0x37]);
		trace(`StickS3 ${label} pmic11=${formatByte(pmic11)} codec=${JSON.stringify(codec)}\n`);
	}
	catch (error) {
		trace(`StickS3 ${label} diagnostics failed: ${error}\n`);
	}
}

function speakerSession(options = {}) {
	return normalizeSpeakerSession({
		sampleRate: options.sampleRate ?? DEFAULT_SPEAKER_SAMPLE_RATE,
		bitsPerSample: options.bitsPerSample ?? DEFAULT_BITS_PER_SAMPLE,
		volume: options.volume ?? resolveCodecVolume(),
		settleMs: options.settleMs ?? resolveSpeakerSettleMs()
	});
}

function microphoneSession(options = {}) {
	return normalizeMicrophoneSession({
		sampleRate: options.sampleRate ?? DEFAULT_MICROPHONE_SAMPLE_RATE,
		bitsPerSample: options.bitsPerSample ?? DEFAULT_BITS_PER_SAMPLE,
		gain: options.gain ?? resolveMicrophoneGain(),
		settleMs: options.settleMs ?? resolveMicrophoneSettleMs()
	});
}

function initializeState() {
	if (state.initialized)
		return;

	try {
		const power = new M5PM1(INTERNAL_I2C);
		state.power = power;
		state.codec = new ES8311(INTERNAL_I2C);
		state.initialized = true;

		try {
			power.initializeStickS3();
			state.lastError = "";
		}
		catch (error) {
			state.lastError = `board init skipped: ${error}`;
		}
	}
	catch (error) {
		state.initialized = false;
		state.power = null;
		state.codec = null;
		state.lastError = `${error}`;
		throw error;
	}

	return;
}

function initialize() {
	initializeState();
	return StickS3Board;
}

function ensureInitialized() {
	if (!state.initialized)
		initializeState();
	return state;
}

function pinsSpeakerOptions(options = {}) {
	const session = speakerSession(options);
	const result = {
		...options
	};

	result.sampleRate = session.sampleRate;
	result.bitsPerSample = session.bitsPerSample;
	if ((undefined !== result.numChannels) && (result.numChannels !== DEFAULT_SPEAKER_CHANNELS))
		trace(`StickS3 speaker forcing stereo pins output from ${result.numChannels}\n`);
	if ((undefined !== result.channels) && (result.channels !== DEFAULT_SPEAKER_CHANNELS))
		trace(`StickS3 speaker forcing stereo pins output from ${result.channels}\n`);
	result.numChannels = DEFAULT_SPEAKER_CHANNELS;
	delete result.channels;
	delete result.volume;
	delete result.settleMs;

	return result;
}

function ioSpeakerOptions(options = {}) {
	const session = speakerSession(options);
	const result = {
		...options
	};

	result.sampleRate = session.sampleRate;
	result.bitsPerSample = session.bitsPerSample;
	if ((undefined !== result.numChannels) && (result.numChannels !== DEFAULT_SPEAKER_CHANNELS))
		trace(`StickS3 speaker forcing stereo io output from ${result.numChannels}\n`);
	if ((undefined !== result.channels) && (result.channels !== DEFAULT_SPEAKER_CHANNELS))
		trace(`StickS3 speaker forcing stereo io output from ${result.channels}\n`);
	result.channels = DEFAULT_SPEAKER_CHANNELS;
	delete result.numChannels;
	delete result.volume;
	delete result.settleMs;

	return result;
}

function microphoneOptions(options = {}) {
	const session = microphoneSession(options);
	const result = {
		...options
	};

	result.sampleRate = session.sampleRate;
	result.bitsPerSample = session.bitsPerSample;
	if ((undefined !== result.numChannels) && (result.numChannels !== DEFAULT_MICROPHONE_CHANNELS))
		trace(`StickS3 microphone forcing mono input from ${result.numChannels}\n`);
	if ((undefined !== result.channels) && (result.channels !== DEFAULT_MICROPHONE_CHANNELS))
		trace(`StickS3 microphone forcing mono input from ${result.channels}\n`);
	result.channels = DEFAULT_MICROPHONE_CHANNELS;
	delete result.numChannels;
	delete result.gain;
	delete result.settleMs;

	return result;
}

function acquireSpeaker(options = {}) {
	const board = ensureInitialized();
	const session = speakerSession(options);

	if (state.microphoneUsers)
		throw new Error("StickS3 microphone is active");

	if (state.speakerUsers && !sameSession(state.speakerSession, session, ["sampleRate", "bitsPerSample", "channels", "volume"]))
		throw new Error("StickS3 speaker is already active with a different format");

	if (!state.speakerUsers) {
		try {
			board.power?.setSpeakerAmplifier(true);
			state.speakerSession = board.codec?.startSpeaker(session) ?? session;
			state.mode = "speaker";
			state.lastError = "";
			traceAudioRegisters("speaker-start");
		}
		catch (error) {
			try {
				board.codec?.stopSpeaker();
			}
			catch {
			}
			try {
				board.power?.setSpeakerAmplifier(false);
			}
			catch {
			}
			state.mode = "idle";
			state.speakerSession = null;
			state.lastError = `speaker start failed: ${error}`;
			throw error;
		}
	}

	state.speakerUsers += 1;
	trace(`StickS3 board acquire speaker users=${state.speakerUsers}\n`);
	return board;
}

function releaseSpeaker() {
	if (!state.speakerUsers)
		return;

	state.speakerUsers -= 1;
	trace(`StickS3 board release speaker users=${state.speakerUsers}\n`);
	if (!state.speakerUsers) {
		try {
			state.power?.setSpeakerAmplifier(false);
		}
		catch (error) {
			state.lastError = `speaker amp disable failed: ${error}`;
		}
		try {
			state.codec?.stopSpeaker();
		}
		catch (error) {
			state.lastError = `speaker stop failed: ${error}`;
		}
		state.speakerSession = null;
		state.mode = state.microphoneUsers ? "microphone" : "idle";
	}
}

function acquireMicrophone(options = {}) {
	const board = ensureInitialized();
	const session = microphoneSession(options);

	if (state.speakerUsers)
		throw new Error("StickS3 speaker is active");

	if (state.microphoneUsers && !sameSession(state.microphoneSession, session, ["sampleRate", "bitsPerSample", "channels", "gain"]))
		throw new Error("StickS3 microphone is already active with a different format");

	if (!state.microphoneUsers) {
		try {
			board.power?.setSpeakerAmplifier(false);
			state.microphoneSession = board.codec?.startMicrophone(session) ?? session;
			state.mode = "microphone";
			state.lastError = "";
			traceAudioRegisters("microphone-start");
		}
		catch (error) {
			try {
				board.codec?.stopMicrophone();
			}
			catch {
			}
			state.mode = "idle";
			state.microphoneSession = null;
			state.lastError = `microphone start failed: ${error}`;
			throw error;
		}
	}

	state.microphoneUsers += 1;
	trace(`StickS3 board acquire microphone users=${state.microphoneUsers}\n`);
	return board;
}

function releaseMicrophone() {
	if (!state.microphoneUsers)
		return;

	state.microphoneUsers -= 1;
	trace(`StickS3 board release microphone users=${state.microphoneUsers}\n`);
	if (!state.microphoneUsers) {
		try {
			state.codec?.stopMicrophone();
		}
		catch (error) {
			state.lastError = `microphone stop failed: ${error}`;
		}
		state.microphoneSession = null;
		state.mode = state.speakerUsers ? "speaker" : "idle";
	}
}

function samplePower() {
	ensureInitialized();
	return state.power?.sample?.() ?? null;
}

function snapshot() {
	return {
		initialized: state.initialized,
		speakerUsers: state.speakerUsers,
		microphoneUsers: state.microphoneUsers,
		mode: state.mode,
		lastError: state.lastError,
		speakerSession: state.speakerSession,
		microphoneSession: state.microphoneSession,
		codec: state.codec?.snapshot?.() ?? null
	};
}

const StickS3Board = {
	initialize,
	acquireSpeaker,
	releaseSpeaker,
	acquireMicrophone,
	releaseMicrophone,
	pinsSpeakerOptions,
	ioSpeakerOptions,
	microphoneOptions,
	samplePower,
	snapshot,
	get pins() {
		return PINS;
	},
	get power() {
		return state.power;
	},
	get codec() {
		return state.codec;
	},
	get lastError() {
		return state.lastError;
	}
};

export {
	GROVE_I2C,
	INTERNAL_I2C,
	PINS,
	initialize,
	acquireSpeaker,
	releaseSpeaker,
	acquireMicrophone,
	releaseMicrophone,
	pinsSpeakerOptions,
	ioSpeakerOptions,
	microphoneOptions,
	samplePower,
	snapshot
};

export default Object.freeze(StickS3Board, true);
