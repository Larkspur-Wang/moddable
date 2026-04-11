import AudioIn from "embedded:io/audio/in-original";
import StickS3Board from "sticks3/board";

export default class StickS3AudioIn extends AudioIn {
	constructor(options = {}) {
		const settings = StickS3Board.microphoneOptions(options);
		StickS3Board.acquireMicrophone();

		let constructed = false;
		try {
			super(settings);
			constructed = true;
			this._stickS3Closed = false;
		}
		finally {
			if (!constructed)
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
			StickS3Board.releaseMicrophone();
		}
	}
}
