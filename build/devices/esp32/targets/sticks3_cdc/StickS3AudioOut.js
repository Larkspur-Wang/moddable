import AudioOut from "pins/audioout-original";
import StickS3Board from "sticks3/board";

export default class StickS3AudioOut extends AudioOut {
	constructor(options = {}) {
		const settings = StickS3Board.pinsSpeakerOptions(options);
		let acquired = false;
		try {
			trace("StickS3AudioOut constructor acquiring speaker route before native build\n");
			StickS3Board.acquireSpeaker(settings);
			acquired = true;
			super(settings);
			trace("StickS3AudioOut constructor native build ok\n");
		}
		catch (error) {
			trace(`StickS3AudioOut constructor failed ${error}\n`);
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
		if (this._stickS3Closed)
			throw new Error("audio out closed");

		if (!this._stickS3Started) {
			let acquired = false;
			try {
				if (!this._stickS3Acquired) {
					StickS3Board.acquireSpeaker(this._stickS3Settings);
					this._stickS3Acquired = true;
					acquired = true;
				}
				super.start();
				this._stickS3Started = true;
			}
			catch (error) {
				if (acquired) {
					StickS3Board.releaseSpeaker();
					this._stickS3Acquired = false;
				}
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
			if (this._stickS3Acquired) {
				StickS3Board.releaseSpeaker();
				this._stickS3Acquired = false;
			}
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
			this._stickS3Started = false;
			if (this._stickS3Acquired) {
				StickS3Board.releaseSpeaker();
				this._stickS3Acquired = false;
			}
		}
	}
}
