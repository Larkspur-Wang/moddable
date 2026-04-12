import config from "mc/config";
import ES8311 from "es8311";
import M5PM1 from "m5pm1";

const DEFAULT_SPEAKER_SAMPLE_RATE = 44100;
const DEFAULT_MICROPHONE_SAMPLE_RATE = 16000;
const DEFAULT_BITS_PER_SAMPLE = 16;
const DEFAULT_SPEAKER_CHANNELS = 2;
const DEFAULT_MICROPHONE_CHANNELS = 1;
const DEFAULT_CODEC_VOLUME = 0xBF;

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
	lastError: ""
};

function clampCodecVolume(value) {
	return Math.max(0, Math.min(255, value | 0));
}

function resolveCodecVolume() {
	return clampCodecVolume(config.es8311?.volume ?? DEFAULT_CODEC_VOLUME);
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
			state.lastError = `power init skipped: ${error}`;
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
	const result = {
		...options
	};

	if (undefined === result.sampleRate)
		result.sampleRate = DEFAULT_SPEAKER_SAMPLE_RATE;
	if (undefined === result.bitsPerSample)
		result.bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
	if ((undefined === result.numChannels) && (undefined === result.channels))
		result.numChannels = DEFAULT_SPEAKER_CHANNELS;

	return result;
}

function ioSpeakerOptions(options = {}) {
	const result = {
		...options
	};

	if (undefined === result.sampleRate)
		result.sampleRate = DEFAULT_SPEAKER_SAMPLE_RATE;
	if (undefined === result.bitsPerSample)
		result.bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
	if ((undefined === result.channels) && (undefined === result.numChannels))
		result.channels = DEFAULT_SPEAKER_CHANNELS;

	return result;
}

function microphoneOptions(options = {}) {
	const result = {
		...options
	};

	if (undefined === result.sampleRate)
		result.sampleRate = DEFAULT_MICROPHONE_SAMPLE_RATE;
	if (undefined === result.bitsPerSample)
		result.bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
	if ((undefined === result.channels) && (undefined === result.numChannels))
		result.channels = DEFAULT_MICROPHONE_CHANNELS;

	return result;
}

function acquireSpeaker() {
	const board = ensureInitialized();

	if (state.microphoneUsers)
		throw new Error("StickS3 microphone is active");

	if (!state.speakerUsers) {
		try {
			board.power?.setSpeakerAmplifier(true);
			board.codec?.initSpeaker(resolveCodecVolume());
			state.mode = "speaker";
		}
		catch (error) {
			try {
				board.power?.setSpeakerAmplifier(false);
			}
			catch {
			}
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
		catch {
		}
		state.mode = state.microphoneUsers ? "microphone" : "idle";
	}
}

function acquireMicrophone() {
	const board = ensureInitialized();

	if (state.speakerUsers)
		throw new Error("StickS3 speaker is active");

	if (!state.microphoneUsers) {
		board.power?.setSpeakerAmplifier(false);
		board.codec?.initMicrophone();
		state.mode = "microphone";
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
		state.codec?.stopMicrophone();
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
		lastError: state.lastError
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
