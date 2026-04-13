import AudioOut from "embedded:io/audio/out-original";
import StickS3Board from "sticks3/board";

export default class StickS3IOAudioOut extends AudioOut {
	constructor(options = {}) {
		const settings = StickS3Board.ioSpeakerOptions(options);
		let acquired = false;
		try {
			trace("StickS3IOAudioOut constructor acquiring speaker route before native build\n");
			StickS3Board.acquireSpeaker(settings);
			acquired = true;
			super(settings);
			trace("StickS3IOAudioOut constructor native build ok\n");
		}
		catch (error) {
			trace(`StickS3IOAudioOut constructor failed ${error}\n`);
			if (acquired) {
				try {
					StickS3Board.releaseSpeaker();
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
	}

	start() {
		trace(`StickS3IOAudioOut start closed=${this._stickS3Closed} started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (this._stickS3Closed)
			throw new Error("audio out closed");

		if (!this._stickS3Started) {
			let acquired = false;
			try {
				if (!this._stickS3Acquired) {
					trace("StickS3IOAudioOut reacquiring speaker route on start\n");
					StickS3Board.acquireSpeaker(this._stickS3Settings);
					this._stickS3Acquired = true;
					acquired = true;
				}
				super.start();
				this._stickS3Started = true;
				trace("StickS3IOAudioOut native start ok\n");
			}
			catch (error) {
				trace(`StickS3IOAudioOut start failed ${error}\n`);
				if (acquired) {
					StickS3Board.releaseSpeaker();
					this._stickS3Acquired = false;
				}
				throw error;
			}
			return;
		}

		super.start();
		trace("StickS3IOAudioOut native restart ok\n");
	}

	stop() {
		trace(`StickS3IOAudioOut stop started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (!this._stickS3Started)
			return super.stop();

		try {
			super.stop();
			trace("StickS3IOAudioOut native stop ok\n");
		}
		finally {
			this._stickS3Started = false;
			if (this._stickS3Acquired) {
				trace("StickS3IOAudioOut releasing speaker route from stop\n");
				StickS3Board.releaseSpeaker();
				this._stickS3Acquired = false;
			}
		}
	}

	close() {
		trace(`StickS3IOAudioOut close closed=${this._stickS3Closed} started=${this._stickS3Started} acquired=${this._stickS3Acquired}\n`);
		if (this._stickS3Closed)
			return;

		this._stickS3Closed = true;
		try {
			super.close();
			trace("StickS3IOAudioOut native close ok\n");
		}
		finally {
			this._stickS3Started = false;
			if (this._stickS3Acquired) {
				trace("StickS3IOAudioOut releasing speaker route from close\n");
				StickS3Board.releaseSpeaker();
				this._stickS3Acquired = false;
			}
		}
	}
}
