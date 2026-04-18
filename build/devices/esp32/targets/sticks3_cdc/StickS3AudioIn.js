import AudioIn from "embedded:io/audio/in-original";
import StickS3Board from "sticks3/board";

const STICKS3_NATIVE_MIC_CHANNELS = 1;
const STICKS3_NATIVE_MIC_SLOT = 0;

function bufferLength(value) {
	return value?.byteLength ?? 0;
}

function asInt16Samples(source, byteLength = bufferLength(source)) {
	if (source instanceof ArrayBuffer)
		return new Int16Array(source, 0, byteLength >> 1);
	return new Int16Array(source.buffer, source.byteOffset, byteLength >> 1);
}

function peakOfSamples(samples) {
	let peak = 0;

	for (let i = 0; i < samples.length; i++) {
		const sample = Math.abs(samples[i]);
		if (sample > peak)
			peak = sample;
	}

	return peak;
}

export default class StickS3AudioIn extends AudioIn {
	constructor(options = {}) {
		const requestedChannels = options.channels ?? options.numChannels ?? STICKS3_NATIVE_MIC_CHANNELS;
		const userOnReadable = options.onReadable;
		const nativeOptions = {
			...options,
			channels: STICKS3_NATIVE_MIC_CHANNELS
		};
		delete nativeOptions.numChannels;
		if (requestedChannels !== STICKS3_NATIVE_MIC_CHANNELS)
			trace(`StickS3AudioIn forcing mono microphone capture from ${requestedChannels}\n`);
		let owner = null;
		nativeOptions.onReadable = size => {
			if (!userOnReadable)
				return;
			return userOnReadable.call(owner, size);
		};
		const settings = StickS3Board.microphoneOptions(nativeOptions);
		let acquired = false;
		try {
			trace("StickS3AudioIn constructor acquiring microphone route before native build\n");
			StickS3Board.acquireMicrophone(settings);
			acquired = true;
			super(settings);
			owner = this;
			trace("StickS3AudioIn constructor native build ok\n");
		}
		catch (error) {
			trace(`StickS3AudioIn constructor failed ${error}\n`);
			if (acquired) {
				try {
					StickS3Board.releaseMicrophone();
				}
				catch {
				}
			}
			throw error;
		}
		this._stickS3Closed = false;
		this._stickS3Acquired = acquired;
		this._stickS3Started = false;
		this._stickS3Settings = settings;
		this._stickS3RequestedChannels = STICKS3_NATIVE_MIC_CHANNELS;
		this._stickS3NativeChannels = STICKS3_NATIVE_MIC_CHANNELS;
		this._stickS3MonoChannel = STICKS3_NATIVE_MIC_SLOT;
		this._stickS3ChannelPeaks = [0, 0];
	}

	read(samples) {
		const hasArgument = (arguments.length > 0) && (undefined !== samples);
		const writableBytes = bufferLength(samples);
		const result = hasArgument ? super.read(samples) : super.read();
		if (hasArgument && (undefined === result))
			return result;

		let source;
		let sourceBytes;
		if (writableBytes) {
			source = samples;
			sourceBytes = ("number" === typeof result) ? result : writableBytes;
		}
		else {
			source = result;
			sourceBytes = bufferLength(result);
		}

		const sampleBytes = sourceBytes & ~1;
		if (!sampleBytes)
			return result;

		const input = asInt16Samples(source, sampleBytes);
		const peak = peakOfSamples(input);
		this._stickS3ChannelPeaks[0] = Math.max(this._stickS3ChannelPeaks[0], peak);
		return result;
	}

	get channels() {
		return this._stickS3RequestedChannels;
	}

	get nativeChannels() {
		return this._stickS3NativeChannels;
	}

	get channelIndex() {
		return (this._stickS3RequestedChannels > 1) ? -1 : this._stickS3MonoChannel;
	}

	get channelPeaks() {
		return this._stickS3ChannelPeaks.slice();
	}

	start() {
		trace(`StickS3AudioIn start closed=${this._stickS3Closed} started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (this._stickS3Closed)
			throw new Error("audio in closed");

		if (!this._stickS3Started) {
			let acquired = false;
			try {
				if (!this._stickS3Acquired) {
					trace("StickS3AudioIn reacquiring microphone route on start\n");
					StickS3Board.acquireMicrophone(this._stickS3Settings);
					this._stickS3Acquired = true;
					acquired = true;
				}
				super.start();
				this._stickS3Started = true;
				trace("StickS3AudioIn native start ok\n");
			}
			catch (error) {
				trace(`StickS3AudioIn start failed ${error}\n`);
				if (acquired) {
					StickS3Board.releaseMicrophone();
					this._stickS3Acquired = false;
				}
				throw error;
			}
			return;
		}

		super.start();
		trace("StickS3AudioIn native restart ok\n");
	}

	stop() {
		trace(`StickS3AudioIn stop started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (!this._stickS3Started)
			return super.stop();

		try {
			super.stop();
			trace("StickS3AudioIn native stop ok\n");
		}
		finally {
			this._stickS3Started = false;
			if (this._stickS3Acquired) {
				trace("StickS3AudioIn releasing microphone route from stop\n");
				StickS3Board.releaseMicrophone();
				this._stickS3Acquired = false;
			}
		}
	}

	close() {
		trace(`StickS3AudioIn close closed=${this._stickS3Closed} started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (this._stickS3Closed)
			return;

		this._stickS3Closed = true;
		try {
			super.close();
			trace("StickS3AudioIn native close ok\n");
		}
		finally {
			this._stickS3Started = false;
			if (this._stickS3Acquired) {
				trace("StickS3AudioIn releasing microphone route from close\n");
				StickS3Board.releaseMicrophone();
				this._stickS3Acquired = false;
			}
		}
	}
}
