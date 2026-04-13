import AudioIn from "embedded:io/audio/in-original";
import StickS3Board from "sticks3/board";

export default class StickS3AudioIn extends AudioIn {
	constructor(options = {}) {
		const settings = StickS3Board.microphoneOptions(options);
		let acquired = false;
		try {
			trace("StickS3AudioIn constructor acquiring microphone route before native build\n");
			StickS3Board.acquireMicrophone(settings);
			acquired = true;
			super(settings);
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
