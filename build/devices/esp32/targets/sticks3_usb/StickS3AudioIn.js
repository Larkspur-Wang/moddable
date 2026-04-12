import AudioIn from "embedded:io/audio/in-original";
import StickS3Board from "sticks3/board";

export default class StickS3AudioIn extends AudioIn {
	constructor(options = {}) {
		const settings = StickS3Board.microphoneOptions(options);
		super(settings);
		this._stickS3Closed = false;
		this._stickS3Started = false;
		this._stickS3Settings = settings;
	}

	start() {
		if (this._stickS3Closed)
			throw new Error("audio in closed");

		if (!this._stickS3Started) {
			StickS3Board.acquireMicrophone(this._stickS3Settings);
			try {
				super.start();
				this._stickS3Started = true;
			}
			catch (error) {
				StickS3Board.releaseMicrophone();
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
			StickS3Board.releaseMicrophone();
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
				StickS3Board.releaseMicrophone();
			}
		}
	}
}
