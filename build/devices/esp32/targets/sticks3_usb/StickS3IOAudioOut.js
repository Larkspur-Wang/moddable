import AudioOut from "embedded:io/audio/out-original";
import StickS3Board from "sticks3/board";

export default class StickS3IOAudioOut extends AudioOut {
	constructor(options = {}) {
		const settings = StickS3Board.ioSpeakerOptions(options);
		super(settings);
		this._stickS3Closed = false;
		this._stickS3Started = false;
		this._stickS3Settings = settings;
	}

	start() {
		if (this._stickS3Closed)
			throw new Error("audio out closed");

		if (!this._stickS3Started) {
			StickS3Board.acquireSpeaker(this._stickS3Settings);
			try {
				super.start();
				this._stickS3Started = true;
			}
			catch (error) {
				StickS3Board.releaseSpeaker();
				throw error;
			}
			return;
		}

		super.start();
	}

	stop() {
		if (!this._stickS3Started)
			return super.stop();

		try {
			super.stop();
		}
		finally {
			this._stickS3Started = false;
			StickS3Board.releaseSpeaker();
		}
	}

	close() {
		if (this._stickS3Closed)
			return;

		this._stickS3Closed = true;
		try {
			super.close();
		}
		finally {
			if (this._stickS3Started) {
				this._stickS3Started = false;
				StickS3Board.releaseSpeaker();
			}
		}
	}
}
